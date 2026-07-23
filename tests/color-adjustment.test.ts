import test from "node:test";
import assert from "node:assert/strict";
import {adjustHex,hexToRgb,normalizeHex,rgbToHex} from "../src/lib/color-adjustment";

test("色差板支持HEX与RGB双向转换",()=>{
  assert.deepEqual(hexToRgb("#D7D5C9"),{r:215,g:213,b:201});
  assert.equal(rgbToHex({r:215,g:213,b:201}),"#D7D5C9");
  assert.equal(normalizeHex("#d7d5c9"),"#D7D5C9");
});

test("色差归零时保持基础颜色",()=>{
  assert.equal(adjustHex("#C8A06A",{hue:0,saturation:0,lightness:0}),"#C8A06A");
});

test("调整色相饱和度和明度会生成不同的有效颜色",()=>{
  const result=adjustHex("#C8A06A",{hue:18,saturation:12,lightness:-8});
  assert.match(result,/^#[0-9A-F]{6}$/);
  assert.notEqual(result,"#C8A06A");
});
