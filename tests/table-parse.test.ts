import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseCsv, parseTableDocument, spreadsheetUploadLimitMb, validateSpreadsheetUploadSize } from "../src/lib/table-parse";

test("CSV 支持 WPS 引号、逗号和换行", () => {
  const rows = parseCsv('SKU,商品名称,制作要求\r\n001,"针织衫,女款","换装\n三姿势"');
  assert.equal(rows[0].SKU, "001");
  assert.equal(rows[0]["商品名称"], "针织衫,女款");
  assert.equal(rows[0]["制作要求"], "换装\n三姿势");
});

test("XLSX 按单元格坐标读取，空列不会让后续字段错位", async () => {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="商品清单" sheetId="1" r:id="rId7"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships><Relationship Id="rId7" Target="worksheets/products.xml"/></Relationships>');
  zip.file("xl/sharedStrings.xml", '<sst><si><t>SKU</t></si><si><t>商品名称</t></si><si><t>商品图片路径</t></si><si><t>JR00507</t></si><si><t>针织衫</t></si><si><t>D:\\img.jpg</t></si></sst>');
  zip.file("xl/worksheets/products.xml", '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="E1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c><c r="E2" t="s"><v>5</v></c></row></sheetData></worksheet>');
  const parsed = await parseTableDocument(await zip.generateAsync({ type: "nodebuffer" }), "products.xlsx");
  assert.equal(parsed.sheetName, "商品清单");
  assert.deepEqual(parsed.rows, [{ SKU: "JR00507", 商品名称: "针织衫", 商品图片路径: "D:\\img.jpg" }]);
});

test("旧版 xls 给出明确转换提示", async () => {
  await assert.rejects(() => parseTableDocument(Buffer.from("xls"), "商品.xls"), /另存为 \.xlsx/);
});

test("表格上传允许超过旧版 20MB 限制", () => {
  assert.equal(spreadsheetUploadLimitMb(), 100);
  assert.doesNotThrow(() => validateSpreadsheetUploadSize(21 * 1024 * 1024));
  assert.doesNotThrow(() => validateSpreadsheetUploadSize(100 * 1024 * 1024));
});

test("表格上传仍会拒绝超过安全上限的文件", () => {
  assert.throws(() => validateSpreadsheetUploadSize(100 * 1024 * 1024 + 1), /不能超过 100MB/);
  assert.throws(() => validateSpreadsheetUploadSize(0), /文件大小无效/);
});
