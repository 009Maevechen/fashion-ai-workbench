import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractXlsxImageRefs } from "../src/lib/xlsx-images";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

async function buildWorkbook() {
  const zip = new JSZip();
  zip.file("xl/media/image1.png", PNG);
  zip.file("xl/media/image2.png", PNG);
  zip.file(
    "xl/cellimages.xml",
    `<?xml version="1.0"?><etc:cellImages xmlns:etc="e" xmlns:xdr="x" xmlns:a="a" xmlns:r="r"><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="ID_abc123"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>`,
  );
  zip.file(
    "xl/_rels/cellimages.xml.rels",
    `<Relationships xmlns="rel"><Relationship Id="rId1" Target="media/image1.png"/></Relationships>`,
  );
  zip.file(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="x" xmlns:a="a" xmlns:r="r"><xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1" cy="1"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Picture 1"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`,
  );
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<Relationships xmlns="rel"><Relationship Id="rId2" Target="../media/image2.png"/></Relationships>`,
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<Relationships xmlns="rel"><Relationship Id="rIdSheet1" Target="../drawings/drawing1.xml"/></Relationships>`,
  );
  const sheetXml = `<?xml version="1.0"?><worksheet xmlns="w"><sheetData><row r="1"><c r="A1" t="str"><v>SKU1</v></c></row><row r="3"><c r="B3" t="str"><f>_xlfn.DISPIMG("ID_abc123",1)</f><v>DISPIMG</v></c></row></sheetData></worksheet>`;
  return { zip, sheetXml };
}

test("抽取 WPS DISPIMG 图片并按行映射", async () => {
  const { zip, sheetXml } = await buildWorkbook();
  const refs = await extractXlsxImageRefs(zip, sheetXml, "xl/worksheets/_rels/sheet1.xml.rels");
  const disp = refs.find((ref) => ref.source === "dispimg");
  assert.ok(disp, "应识别到 DISPIMG 图片");
  assert.equal(disp!.mediaPath, "xl/media/image1.png");
  assert.equal(disp!.row, 2);
  assert.equal(disp!.column, 1);
});

test("抽取普通内嵌图片并按锚点行映射", async () => {
  const { zip, sheetXml } = await buildWorkbook();
  const refs = await extractXlsxImageRefs(zip, sheetXml, "xl/worksheets/_rels/sheet1.xml.rels");
  const embedded = refs.find((ref) => ref.source === "embedded");
  assert.ok(embedded, "应识别到内嵌图片");
  assert.equal(embedded!.mediaPath, "xl/media/image2.png");
  assert.equal(embedded!.row, 4);
  assert.equal(embedded!.column, 2);
});

test("没有图片时返回空数组", async () => {
  const zip = new JSZip();
  const refs = await extractXlsxImageRefs(zip, "<worksheet><sheetData/></worksheet>");
  assert.deepEqual(refs, []);
});
