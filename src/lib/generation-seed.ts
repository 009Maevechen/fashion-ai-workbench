import crypto from "node:crypto";

export const MAX_SAFE_GENERATION_SEED = 2 ** 31 - 1;

export function randomGenerationSeed() {
  return crypto.randomInt(1, MAX_SAFE_GENERATION_SEED + 1);
}
