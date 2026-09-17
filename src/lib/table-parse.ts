import JSZip from "jszip";
import type { TableRow } from "./pose-inventory";

export const DEFAULT_MAX_SPREADSHEET_UPLOAD_MB = 100;

export function spreadsheetUploadLimitMb(value = process.env.SPREADSHEET_MAX_UPLOAD_MB) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 21 ? Math.floor(parsed) : DEFAULT_MAX_SPREADSHEET_UPLOAD_MB;
}

export function validateSpreadsheetUploadSize(size: number, limitMb = spreadsheetUploadLimitMb()) {
  if (!Number.isFinite(size) || size <= 0) throw new Error("商品表格为空或文件大小无效");
  if (size > limitMb * 1024 * 1024) throw new Error(`商品表格不能超过 ${limitMb}MB`);
}

/** 解析 CSV 文本为行对象数组（首行为表头）。支持引号包裹。 */
export function parseCsv(text: string): TableRow[] {
  const rows = csvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((cell) => cell.trim());
  return rows.slice(1).map((cells) => {
    const row: TableRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

export type ParsedTable = {
  rows: TableRow[];
  sheetName: string;
  headers: string[];
};

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** 从 xlsx 中读取第一个工作表为行对象数组。使用 jszip 解析，不引入重量级依赖。 */
function columnIndex(cellReference: string | undefined, fallback: number) {
  const letters = cellReference?.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return fallback;
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]) {
  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const values: string[] = [];
    let fallback = 0;
    for (const match of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = /\br="([^"]+)"/.exec(match[1])?.[1];
      const index = columnIndex(reference, fallback);
      values[index] = cellValue(`${match[1]}>${match[2]}`, sharedStrings).trim();
      fallback = index + 1;
    }
    return values;
  });
}

export async function parseXlsxDocument(buffer: Buffer): Promise<ParsedTable> {
  const zip = await JSZip.loadAsync(buffer);
  const workbook = zip.files["xl/workbook.xml"];
  if (!workbook) throw new Error("无效的 Excel 文件（缺少 workbook.xml）");
  const workbookXml = await workbook.async("string");

  // 读取 sharedStrings
  let sharedStrings: string[] = [];
  const sharedEntry = zip.files["xl/sharedStrings.xml"];
  if (sharedEntry) {
    const xml = await sharedEntry.async("string");
    sharedStrings = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
      [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(""),
    );
  }

  // 通过 workbook relationship 找到第一个可见工作表，兼容 WPS 非 sheet1 命名。
  const firstSheet = /<sheet\b([^>]*)\/?>(?:<\/sheet>)?/.exec(workbookXml)?.[1] || "";
  const sheetName = decodeXml(/\bname="([^"]*)"/.exec(firstSheet)?.[1] || "Sheet1");
  const relationshipId = /\br:id="([^"]+)"/.exec(firstSheet)?.[1];
  let sheetEntry = "xl/worksheets/sheet1.xml";
  const relationships = zip.files["xl/_rels/workbook.xml.rels"];
  if (relationshipId && relationships) {
    const xml = await relationships.async("string");
    const relation = [...xml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)]
      .map((match) => match[1])
      .find((attributes) => new RegExp(`\\bId="${relationshipId}"`).test(attributes));
    const target = relation && /\bTarget="([^"]+)"/.exec(relation)?.[1];
    if (target) sheetEntry = target.startsWith("/") ? target.slice(1) : pathJoinXml("xl", target);
  }
  if (!zip.files[sheetEntry]) throw new Error("Excel 文件没有可读取的工作表");
  const sheetXml = await zip.files[sheetEntry].async("string");

  const rows: TableRow[] = [];
  const parsedRows = parseSheetRows(sheetXml, sharedStrings);
  const headers = parsedRows[0] || [];
  if (!headers.some(Boolean)) return { rows: [], sheetName, headers: [] };
  for (let i = 1; i < parsedRows.length; i++) {
    const cells = parsedRows[i];
    const row: TableRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? "";
    });
    if (Object.values(row).some((value) => value.trim() !== "")) rows.push(row);
  }
  return { rows, sheetName, headers };
}

export async function parseXlsx(buffer: Buffer): Promise<TableRow[]> {
  return (await parseXlsxDocument(buffer)).rows;
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

function cellValue(cellXml: string, sharedStrings: string[]): string {
  const t = /t="([^"]*)"/.exec(cellXml)?.[1];
  const v = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
  if (t === "s" && v !== undefined) return sharedStrings[Number(v)] ?? "";
  const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cellXml)?.[1];
  if (inline !== undefined) return decodeXml(inline);
  return v !== undefined ? decodeXml(v) : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function parseTable(buffer: Buffer, filename: string): Promise<TableRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(buffer);
  throw new Error("仅支持 CSV 或 Excel (.xlsx) 文件");
}

export async function parseTableDocument(buffer: Buffer, filename: string): Promise<ParsedTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const rows = parseCsv(buffer.toString("utf8"));
    return { rows, sheetName: "CSV", headers: rows.length ? Object.keys(rows[0]) : [] };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsxDocument(buffer);
  if (lower.endsWith(".xls")) throw new Error("旧版 .xls 请先在 WPS/Excel 中另存为 .xlsx 后导入");
  throw new Error("仅支持 CSV 或 Excel (.xlsx/.xlsm) 文件");
}
