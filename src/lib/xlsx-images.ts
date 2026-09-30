import JSZip from "jszip";

/**
 * 从 .xlsx / .xlsm 中抽取图片引用（不读取图片字节，避免整表入内存）：
 * - 普通内嵌图片：xl/drawings/*.xml 的锚点 + rels 映射到 xl/media/*
 * - WPS DISPIMG：单元格 DISPIMG("ID_xxx") → xl/cellimages.xml → rels → xl/media/*
 * 返回「媒体路径 + 所在行/列」，由调用方逐个读取、落到图片索引后释放。
 */
export type XlsxImageRef = {
  mediaPath: string;
  row: number;
  column: number;
  source: "embedded" | "dispimg";
};

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

function columnIndex(reference: string | undefined, fallback: number) {
  const letters = reference?.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return fallback;
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function pathJoinXml(base: string, target: string) {
  const stack = base.split("/");
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function parseRels(xml: string, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/g)) {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1];
    if (!id || !target) continue;
    const resolved = target.startsWith("/") ? target.slice(1) : pathJoinXml(baseDir, target);
    map.set(id, resolved);
  }
  return map;
}

function rowsOf(sheetXml: string): Array<{ index: number; xml: string }> {
  const rows: Array<{ index: number; xml: string }> = [];
  let fallback = 0;
  for (const match of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const declared = Number(/\br="(\d+)"/.exec(match[1])?.[1]);
    rows.push({ index: Number.isFinite(declared) && declared > 0 ? declared - 1 : fallback, xml: match[2] });
    fallback += 1;
  }
  return rows;
}

async function extractDispImg(zip: JSZip, sheetXml: string, refs: XlsxImageRef[]) {
  const cellImages = zip.files["xl/cellimages.xml"];
  if (!cellImages) return;
  const xml = await cellImages.async("string");
  const relsEntry = zip.files["xl/_rels/cellimages.xml.rels"];
  const rels = relsEntry ? parseRels(await relsEntry.async("string"), "xl") : new Map<string, string>();
  const idToMedia = new Map<string, string>();
  for (const pic of xml.matchAll(/<xdr:pic\b[\s\S]*?<\/xdr:pic>/g)) {
    const name = /\bname="([^"]+)"/.exec(pic[0])?.[1];
    const embed = /\br:embed="([^"]+)"/.exec(pic[0])?.[1];
    if (!name || !embed) continue;
    const media = rels.get(embed);
    if (media) idToMedia.set(decodeXml(name), media);
  }
  if (!idToMedia.size) return;
  for (const row of rowsOf(sheetXml)) {
    for (const cell of row.xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const disp = /DISPIMG\s*\(\s*"([^"]+)"/.exec(cell[0]) ?? /DISPIMG\s*\(\s*"([^"]+)"/.exec(cell[1]);
      if (!disp) continue;
      const media = idToMedia.get(decodeXml(disp[1]));
      if (!media) continue;
      refs.push({
        mediaPath: media,
        row: row.index,
        column: columnIndex(/\br="([^"]+)"/.exec(cell[1])?.[1], 0),
        source: "dispimg",
      });
    }
  }
}

async function extractEmbedded(zip: JSZip, sheetRelsPath: string | undefined, refs: XlsxImageRef[]) {
  const drawingPaths = new Set<string>();
  if (sheetRelsPath && zip.files[sheetRelsPath]) {
    const rels = parseRels(await zip.files[sheetRelsPath].async("string"), "xl/worksheets");
    for (const target of rels.values()) if (/drawings\/drawing\d*\.xml$/i.test(target)) drawingPaths.add(target);
  }
  // 找不到工作表 rels 时兜底扫描所有 drawing，兼容 WPS 命名差异。
  if (!drawingPaths.size) for (const name of Object.keys(zip.files)) if (/^xl\/drawings\/drawing[^/]*\.xml$/i.test(name)) drawingPaths.add(name);

  for (const drawingPath of drawingPaths) {
    const entry = zip.files[drawingPath];
    if (!entry) continue;
    const xml = await entry.async("string");
    const drawingDir = drawingPath.split("/").slice(0, -1).join("/");
    const relsPath = `${drawingDir}/_rels/${drawingPath.split("/").pop()}.rels`;
    const relsEntry = zip.files[relsPath];
    const rels = relsEntry ? parseRels(await relsEntry.async("string"), drawingDir) : new Map<string, string>();
    for (const anchor of xml.matchAll(/<xdr:(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g)) {
      const from = /<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(anchor[0])?.[1];
      if (!from) continue;
      const row = Number(/<xdr:row>(\d+)<\/xdr:row>/.exec(from)?.[1]);
      if (!Number.isFinite(row)) continue;
      const col = Number(/<xdr:col>(\d+)<\/xdr:col>/.exec(from)?.[1]);
      for (const blip of anchor[0].matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)) {
        const media = rels.get(blip[1]);
        if (media) refs.push({ mediaPath: media, row, column: Number.isFinite(col) ? col : 0, source: "embedded" });
      }
    }
  }
}

export async function extractXlsxImageRefs(
  zip: JSZip,
  sheetXml: string,
  sheetRelsPath?: string,
): Promise<XlsxImageRef[]> {
  const refs: XlsxImageRef[] = [];
  await extractDispImg(zip, sheetXml, refs);
  await extractEmbedded(zip, sheetRelsPath, refs);
  // 同一媒体在同一行只保留一次。
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.mediaPath}:${ref.row}:${ref.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
