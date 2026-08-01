import test from "node:test";
import assert from "node:assert/strict";
import {colorDistance,extractColorPalette,readableColorName} from "../src/lib/color-palette";

test("颜色参考图可以提取多个不重复色卡",()=>{
  const pixels=new Uint8Array([
    ...Array(40).fill([25,25,25]).flat(),
    ...Array(35).fill([232,224,205]).flat(),
    ...Array(25).fill([176,145,100]).flat(),
  ]);
  const colors=extractColorPalette(pixels,3,6);
  assert.ok(colors.length>=3);
  assert.equal(new Set(colors.map(color=>color.hex)).size,colors.length);
  assert.ok(colors.every(color=>/^#[0-9A-F]{6}$/.test(color.hex)));
});

test("局部色块可以获得可读名称并判断近似重复色",()=>{
  assert.equal(readableColorName("#171717"),"纯黑色");
  assert.ok(colorDistance("#A6886B","#A7896C")<3);
  assert.ok(colorDistance("#A6886B","#181818")>40);
});

test("自动色卡最多保留五款服装主色并过滤中间灰背景",()=>{
  const pixels=new Uint8Array([
    ...Array(300).fill([205,205,205]).flat(),
    ...Array(90).fill([166,136,107]).flat(),
    ...Array(80).fill([139,118,87]).flat(),
    ...Array(70).fill([75,48,38]).flat(),
    ...Array(60).fill([24,24,24]).flat(),
    ...Array(50).fill([242,239,229]).flat(),
  ]);
  const colors=extractColorPalette(pixels,3,5);
  assert.ok(colors.length<=5);
  assert.equal(colors.some(color=>color.name==="中灰色"),false);
  assert.ok(colors.some(color=>color.name.includes("卡其")||color.name.includes("棕")));
});

test("自动色卡过滤明显肤色但保留卡其与棕色",()=>{
  const pixels=new Uint8Array([
    ...Array(120).fill([207,151,126]).flat(),
    ...Array(90).fill([166,139,113]).flat(),
    ...Array(80).fill([80,50,39]).flat(),
    ...Array(70).fill([15,15,15]).flat(),
    ...Array(60).fill([243,240,232]).flat(),
  ]);
  const colors=extractColorPalette(pixels,3,5);
  assert.equal(colors.some(color=>color.hex==="#CF977E"),false);
  assert.ok(colors.some(color=>color.name.includes("卡其")));
  assert.ok(colors.some(color=>color.name.includes("咖啡")||color.name.includes("棕")));
});
