/** One persisted image has one formal file and lightweight display derivatives. */
export type ImageSourceVersions = {
  masterSource: string;
  approvedSource: string | null;
  previewSource: string;
  thumbnailSource: string;
};

const FORMAL_PREFIX = "/api/files/";

export function isFormalImageSource(url: string) {
  if (!url.startsWith(FORMAL_PREFIX)) return false;
  try {
    const parsed = new URL(url, "http://workbench.local");
    const first = decodeURIComponent(parsed.pathname.slice(FORMAL_PREFIX.length)).split("/")[0];
    return !parsed.searchParams.has("thumbnail") &&
      !parsed.searchParams.has("preview") &&
      first !== ".cache";
  } catch {
    return false;
  }
}

export function assertFormalImageSource(url: string, label = "AI任务源图") {
  if (!isFormalImageSource(url)) {
    throw new Error(`${label}必须使用 masterSource 或 approvedSource 高清正式文件，禁止使用缩略图、预览图或缓存图`);
  }
  return url;
}

function derivativeUrl(url: string, key: "preview" | "thumbnail", width: number) {
  if (!url.startsWith(FORMAL_PREFIX)) return url;
  const parsed = new URL(url, "http://workbench.local");
  parsed.searchParams.delete("preview");
  parsed.searchParams.delete("thumbnail");
  parsed.searchParams.set(key, String(Math.round(width)));
  return `${parsed.pathname}${parsed.search}`;
}

export function imageSourceVersions(masterSource: string, approvedSource?: string | null): ImageSourceVersions {
  assertFormalImageSource(masterSource, "masterSource");
  if(approvedSource)assertFormalImageSource(approvedSource, "approvedSource");
  const displaySource=approvedSource||masterSource;
  return {
    masterSource,
    approvedSource: approvedSource||null,
    previewSource: derivativeUrl(displaySource, "preview", 960),
    thumbnailSource: derivativeUrl(displaySource, "thumbnail", 480),
  };
}

export const previewSourceUrl = (url: string, width = 960) =>
  derivativeUrl(url, "preview", Math.max(600, Math.min(1280, width)));

export const thumbnailSourceUrl = (url: string, width = 480) =>
  derivativeUrl(url, "thumbnail", Math.max(240, Math.min(600, width)));
