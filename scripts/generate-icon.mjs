import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await fs.readFile(path.join(root, "scripts", "logo.svg"), "utf8");

// 生成应用图标 PNG（512 基础，多尺寸）
await fs.mkdir(path.join(root, "build"), { recursive: true });
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await fs.writeFile(path.join(root, "build", "icon.png"), png);
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const resized = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await fs.writeFile(path.join(root, "build", `icon-${size}.png`), resized);
}
console.log("图标已生成到 build/ 目录");
