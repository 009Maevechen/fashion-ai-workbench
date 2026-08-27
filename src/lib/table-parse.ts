import JSZip from "jszip";
import type { TableRow } from "./pose-inventory";

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
export async function parseXlsx(buffer: Buffer): Promise<TableRow[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = Object.keys(zip.files).find((name) => name === "xl/workbook.xml");
  if (!workbookEntry) throw new Error("无效的 Excel 文件（缺少 workbook.xml）");

  // 读取 sharedStrings
  let sharedStrings: string[] = [];
  const sharedEntry = zip.files["xl/sharedStrings.xml"];
  if (sharedEntry) {
    const xml = await sharedEntry.async("string");
    sharedStrings = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
      [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(""),
    );
  }

  // 找到第一个 sheet
  const sheetEntry = Object.keys(zip.files).find((name) => /^xl\/worksheets\/sheet1\.xml$/.test(name));
  if (!sheetEntry) throw new Error("Excel 文件没有工作表");
  const sheetXml = await zip.files[sheetEntry].async("string");

  const rows: TableRow[] = [];
  const rowMatches = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  const headerRow = rowMatches[0];
  if (!headerRow) return [];
  const headers = [...headerRow[1].matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)].map((cell) => cellValue(cell[1], sharedStrings).trim());
  for (let i = 1; i < rowMatches.length; i++) {
    const cells = [...rowMatches[i][1].matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)].map((cell) => cellValue(cell[1], sharedStrings).trim());
    const row: TableRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? "";
    });
    if (Object.values(row).some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
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
