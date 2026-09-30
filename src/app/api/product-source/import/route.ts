import { NextResponse } from "next/server";
import { createProject, listProjects, updateProjectWith } from "@/lib/db";
import { downloadAllowlistedImage, moveFileToTrash } from "@/lib/ai/storage";
import { invalidateForAssetChange, persistProductUpload } from "@/lib/workflow";
import { imageSourceVersions } from "@/lib/image-sources";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  sku: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/),
  url: z.string().url(),
  source: z.enum(["cocomoda", "tooerp-us"]).optional(),
});

function assertProductSystemUrl(raw: string, source?: "cocomoda" | "tooerp-us") {
  const url = new URL(raw);
  const expectedOrigin = source === "tooerp-us" ? "https://us.tooerp.com" : "https://cocomoda.tooerp.com";
  const isImage = /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname);
  const isKnownResource = url.pathname.startsWith("/be/statics/resources/");
  const isAllowedUsCdn = source === "tooerp-us" && url.origin === "https://usimg.k2049.com" && (url.pathname.startsWith("/files/x/") || url.pathname.startsWith("/files/t/"));
  if (!isImage || (!isAllowedUsCdn && (url.origin !== expectedOrigin || !isKnownResource))) {
    throw new Error("商品图片地址不是已授权的商品系统图片");
  }
  return url.toString();
}

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const remoteUrl = assertProductSystemUrl(input.url, input.source);
    const allowedHosts = input.source === "tooerp-us"
      ? ["us.tooerp.com", "usimg.k2049.com"]
      : ["cocomoda.tooerp.com"];
    const downloaded = await downloadAllowlistedImage(remoteUrl, allowedHosts);
    const mime = downloaded.mime.startsWith("image/") ? downloaded.mime : "image/jpeg";
    const file = new File([downloaded.buffer], `${input.sku}-product.jpg`, { type: mime });
    const saved = await persistProductUpload(file, input.sku, `${input.source || "product-system"}-product`);
    let project = (await listProjects()).find((item) => item.sku.trim().toLocaleLowerCase() === input.sku.toLocaleLowerCase());
    let projectCreated = false;
    if (!project) {
      try {
        project = await createProject({ sku: input.sku, productName: input.sku, productType: "上衣" });
        projectCreated = true;
      } catch {
        project = (await listProjects()).find((item) => item.sku.trim().toLocaleLowerCase() === input.sku.toLocaleLowerCase());
      }
    }
    const projectId = project?.id;
    if (projectId) {
      let previous: string | undefined;
      let previousEnhanced: string | undefined;
      await updateProjectWith(projectId, (current) => {
        previous = current.assets.garmentImage;
        previousEnhanced = current.assets.garmentEnhancedImage;
        const now = new Date().toISOString();
        return {
          assets: { ...current.assets, garmentImage: saved.url, garmentEnhancedImage: saved.enhancedUrl },
          assetImageVersions: {
            ...(current.assetImageVersions || {}),
            garmentImage: imageSourceVersions(saved.url, saved.url),
            garmentEnhancedImage: imageSourceVersions(saved.enhancedUrl, saved.enhancedUrl),
          },
          productImageEnhancement: {
            status: saved.enhancement.needsReview ? "needs_review" : saved.enhancement.applied ? "enhanced" : "preserved",
            sourceWidth: saved.sourceWidth,
            sourceHeight: saved.sourceHeight,
            enhancedWidth: saved.enhancedWidth,
            enhancedHeight: saved.enhancedHeight,
            blurDetected: saved.enhancement.blurDetected,
            lowResolution: saved.enhancement.lowResolution,
            sourceSharpness: saved.enhancement.sourceSharpness,
            enhancedSharpness: saved.enhancement.enhancedSharpness,
            methods: saved.enhancement.methods,
            processedAt: now,
          },
          garmentDetailLock: undefined,
          productVisualAnalysis: undefined,
        };
      });
      await invalidateForAssetChange(projectId, "garmentImage");
      if (previous && previous !== saved.url) await moveFileToTrash(previous, projectId);
      if (previousEnhanced && previousEnhanced !== saved.enhancedUrl) await moveFileToTrash(previousEnhanced, projectId);
    }
    return NextResponse.json({ ok: true, sku: input.sku, url: saved.url, enhancedUrl: saved.enhancedUrl, projectId, projectCreated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品图片导入失败" }, { status: 400 });
  }
}
