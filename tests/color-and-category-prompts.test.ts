import test from "node:test";
import assert from "node:assert/strict";
import { tryonPrompt } from "../src/lib/ai/prompts/tryon";
import { recolorPrompt } from "../src/lib/ai/prompts/recolor";
import { recolorAreaForProductType } from "../src/lib/recolor-scope";

test("换装提示词明确包含必选服装类目", () => {
  const prompt = tryonPrompt("连衣裙", "印花长裙", "保持裙摆");
  assert.match(prompt, /服装类型：连衣裙/);
  assert.match(prompt, /不得改成其他服装类目/);
});

test("换装只把产品图作为服装真值并锁定尺寸材质与垂感", () => {
  const prompt = tryonPrompt("上衣", "针织短款上衣", "保持领口和下摆");
  assert.match(
    prompt,
    /服装产品图：这是生成结果中服装外观的唯一真值、唯一来源和最高优先级依据/,
  );
  assert.match(prompt, /换装主体必须是参考模特图/);
  assert.match(prompt, /模特参考图里的服装只是需要被彻底移除的遮挡物/);
  assert.match(prompt, /景别与姿态强制锁定/);
  assert.match(prompt, /整体尺寸比例、衣长\/裤长\/裙长、宽度、围度、松量/);
  assert.match(
    prompt,
    /不得为了贴合模特参考图原服装而改变产品大小、长度或覆盖范围/,
  );
  assert.match(prompt, /厚薄、重量感、硬挺或柔软程度、弹性/);
  assert.match(prompt, /重力下垂方向和垂坠感/);
  assert.match(
    prompt,
    /布料贴合身体后的自然褶皱可以随姿势变化，但材质属性、垂感强弱和结构尺寸不得改变/,
  );
  assert.match(prompt, /不得新增、删除、移动、替换或重新设计任何结构/);
});

test("换装严格隔离双图职责且只允许修改服装区域", () => {
  const prompt = tryonPrompt("裤装", "垂感阔腿裤", "保持腰头、侧缝和裤脚");
  assert.match(prompt, /双图隔离硬规则/);
  assert.match(
    prompt,
    /服装产品图中的人物、模特、人体、衣架、手、道具、文字、背景/,
  );
  assert.match(prompt, /模特参考图中除原服装以外的全部可见内容必须保持/);
  assert.match(prompt, /唯一允许修改区域/);
  assert.match(prompt, /不得重绘、重构、美化、移动或替换/);
  assert.match(
    prompt,
    /不得残留其领口、袖口、下摆、颜色、花纹、材质、轮廓或任何设计痕迹/,
  );
  assert.match(prompt, /肩斜、袖窿、袖山、落肩位置、省道、分割线、拼接线/);
  assert.match(prompt, /裆深、前后裆线、内侧缝、外侧缝/);
  assert.match(prompt, /任何一项不满足都视为失败，必须重新生成/);
  assert.match(prompt, /人物身份绝对锁定/);
  assert.match(prompt, /不得以产品图人物作为输出主体/);
  assert.match(prompt, /彻底去除模特原服装/);
  assert.match(prompt, /全部作废、全部删除、全部不得保留/);
  assert.match(
    prompt,
    /任何原服装残留、颜色渗入或结构混入都必须判定为失败并重试/,
  );
  assert.match(prompt, /产品图是结果的唯一服装来源/);
  assert.match(prompt, /不得让模特原服装的任何特征出现在结果里/);
  assert.match(prompt, /扣子与小五金重点强化/);
  assert.match(prompt, /扣子数量——产品图有几颗就生成几颗/);
  assert.match(prompt, /单排扣、双排扣、明门襟、暗门襟/);
  assert.match(prompt, /扣子不得出现漂浮、歪斜、糊掉、消失、变形、错位/);
  assert.match(prompt, /多件\/多色产品图单件隔离/);
  assert.match(prompt, /这一件、这一个颜色款.*唯一服装来源/);
  assert.match(prompt, /禁止从其他颜色款借颜色、借细节、补结构或拼成混合款/);
  assert.match(
    prompt,
    /结果不得混入第二件服装的颜色、图案、面料或任何局部设计/,
  );
});

test("普通复色只映射主体色并让扣子继承原款", () => {
  const prompt = recolorPrompt(
    "裙子",
    "焦糖色",
    "#C8A06A",
    ["印花"],
    "保持背景",
    false,
    "白色",
    "#FFFFFF",
  );
  assert.match(prompt, /同款不同色默认规则/);
  assert.match(prompt, /第1张图片.*颜色区域布局的唯一基础底图/);
  assert.match(prompt, /普通款只负责提供主体颜色/);
  assert.match(prompt, /扣子、纽扣和统一五金颜色始终继承第1张图/);
  assert.match(prompt, /先锁布局，再映射颜色/);
  assert.match(prompt, /口袋、条纹、拼接、扣子、印花、包边/);
  assert.match(prompt, /#C8A06A/);
  assert.match(prompt, /普通款不单独识别或改动边饰、扣子与五金颜色/);
  assert.match(
    prompt,
    /当前颜色款按同款不同色处理，所有结构与第一张图完全一致/,
  );
  assert.match(prompt, /面料类别、织法、纹理、光泽、厚薄和垂感/);
  assert.match(prompt, /禁止裁剪服装 · 最高优先规则/);
  assert.match(prompt, /只能扩展背景，绝对不能裁切人物或服装/);
  assert.match(prompt, /服装所有可见边缘均未被新画面边界裁掉/);
  assert.match(prompt, /露脸与原图样式锁定/);
  assert.match(prompt, /有脸就保留同一张脸/);
  assert.match(prompt, /没有脸就不得补画/);
});

test("复色区域由商品类型锁定，上衣不得改动下装", () => {
  assert.equal(recolorAreaForProductType("上衣"), "上衣");
  assert.equal(recolorAreaForProductType("裤装"), "裤子");
  assert.equal(recolorAreaForProductType("半身裙"), "裙子");
  const prompt = recolorPrompt("上衣", "深咖啡色", "#432E28", [], "");
  assert.match(prompt, /绝对不得改色的其他服饰：裤子、裙子/);
  assert.match(prompt, /背景、皮肤、头发、鞋子、道具/);
});

test("所有复色模式默认同款不同色，只有明确高置信度差异才允许局部改款", () => {
  const uniform = recolorPrompt(
    "上衣",
    "黑色",
    "#000000",
    ["背景"],
    "保持结构",
    false,
    "",
    "",
    [],
    "",
    "",
    "uniform",
  );
  assert.match(uniform, /同款不同色默认规则/);
  assert.match(uniform, /默认只允许改变对应服装区域的颜色/);
  const perVariant = recolorPrompt(
    "上衣",
    "黑色",
    "#000000",
    ["背景"],
    "保持结构",
    false,
    "",
    "",
    [],
    "",
    "",
    "perVariant",
  );
  assert.match(perVariant, /同款不同色默认规则/);
  const explicitVariant = recolorPrompt(
    "上衣",
    "黑色",
    "#000000",
    ["背景"],
    "保持结构",
    false,
    "",
    "",
    ["包边宽度不同"],
    "",
    "",
    "perVariant",
    [],
    false,
    0,
    "none",
    "visible_only",
    "",
    "explicit_variant",
    ["包边宽度不同"],
    0.93,
  );
  assert.match(explicitVariant, /明确颜色款差异规则/);
  assert.match(explicitVariant, /允许的明确差异仅限：包边宽度不同/);
  assert.match(explicitVariant, /未列明的版型、结构、口袋/);
  // 所有模式都必须保证同一颜色款内多张图设计一致，不允许某张多一块少一块。
  assert.match(uniform, /同款颜色设计一致性/);
  assert.match(perVariant, /同款颜色设计一致性/);
  assert.match(uniform, /不允许多一块少一块/);
});

test("复色款式以底图为唯一依据，颜色以参考图为主要依据", () => {
  const prompt = recolorPrompt(
    "裤子",
    "标题写红色",
    "#FF0000",
    ["背景"],
    "",
    false,
    "",
    "",
    ["黑白侧条纹"],
    "细密梭织",
    "标题辅助规则",
    "perVariant",
    [
      { part: "主体", colorName: "橄榄绿", hex: "#556B2F", confidence: 0.94 },
      { part: "侧条纹", colorName: "白色", hex: "#FFFFFF", confidence: 0.91 },
    ],
  );
  assert.match(prompt, /第1张图始终负责款式结构和区域布局/);
  assert.match(prompt, /名称和 HEX 只能辅助命名/);
  assert.match(prompt, /冲突时以第2张图可见颜色为准/);
  assert.match(prompt, /主体=橄榄绿\(#556B2F\)/);
  assert.match(prompt, /侧条纹=白色\(#FFFFFF\)/);
  assert.doesNotMatch(prompt, /颜色名称就是生成规则/);
});

test("遮挡区域只有明确统一单色时才允许延展", () => {
  const safe = recolorPrompt(
    "裤子",
    "绿色",
    "#556B2F",
    [],
    "",
    false,
    "",
    "",
    [],
    "",
    "",
    "perVariant",
    [],
    true,
    0.91,
    "partial",
    "extend_uniform",
    "裤腿被折叠",
  );
  assert.match(safe, /确认该颜色款是统一单色/);
  assert.match(safe, /只把可见主体色延展到同一个服装主体区域/);
  const review = recolorPrompt(
    "裤子",
    "绿色",
    "#556B2F",
    [],
    "",
    false,
    "",
    "",
    ["黑白侧条纹"],
    "",
    "",
    "perVariant",
    [],
    false,
    0.4,
    "partial",
    "visible_only",
    "侧边被遮挡",
  );
  assert.match(review, /无法确认的颜色必须标记人工审核/);
  assert.match(review, /禁止猜色、乱分区/);
});

test("单独上传的当前颜色款参考图拥有绝对优先级", () => {
  const prompt = recolorPrompt(
    "上衣",
    "墨绿色",
    "#234B36",
    [],
    "",
    false,
    "",
    "",
    [],
    "",
    "",
    "perVariant",
    [],
    false,
    0,
    "none",
    "visible_only",
    "",
    "same_style",
    [],
    0,
    {},
    "independent",
  );
  assert.match(prompt, /独立参考图绝对优先/);
  assert.match(prompt, /完全忽略 SKU 级多色参考图/);
  assert.match(prompt, /禁止借用或混入任何其他颜色款/);
});

test("人工选定基本色覆盖照片色差，照片只提供局部颜色布局", () => {
  const prompt = recolorPrompt(
    "上衣",
    "纯黑色",
    "#1A1A1A",
    [],
    "",
    false,
    "",
    "",
    [],
    "",
    "",
    "perVariant",
    [],
    false,
    0,
    "none",
    "visible_only",
    "",
    "same_style",
    [],
    0,
    {
      mainBody: "#1A1A1A",
      下摆米白条纹: "#E8E4D8",
      下摆酒红条纹: "#7A2E3A",
    },
    "independent",
    "selected",
  );
  assert.match(prompt, /人工基本色锁定/);
  assert.match(prompt, /只允许局部改颜色/);
  assert.match(prompt, /不是重新设计、重新换装或整图重绘/);
  assert.match(prompt, /绝无权限改变服装设计/);
  assert.match(prompt, /不能输出模糊近似图/);
  assert.match(prompt, /纯黑色.*#1A1A1A/);
  assert.match(prompt, /优先级高于参考照片的像素取色/);
  assert.match(prompt, /参考图姿态归一/);
  assert.match(prompt, /禁止复制参考图的角度、褶皱、裁切、轮廓或摆放方式/);
  assert.match(prompt, /下摆米白条纹=#E8E4D8/);
  assert.match(prompt, /下摆酒红条纹=#7A2E3A/);
});
