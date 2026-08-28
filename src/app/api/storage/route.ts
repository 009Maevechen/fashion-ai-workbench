import { NextResponse } from "next/server";
import { emptyOutputCache, emptyTrash, storageStats, updateOutputRoot } from "@/lib/ai/storage";
import {
  hasExplicitFinalDir,
  hasExplicitPoseLibraryDir,
  runtimeFinalDir,
  runtimeOutputsDir,
  runtimePoseLibraryDir,
  runtimeVisualReferenceDir,
  saveRuntimeFinalDir,
  saveRuntimeOutputsDir,
  saveRuntimePoseLibraryDir,
  saveRuntimeVisualReferenceDir,
} from "@/lib/runtime-paths";
import { readManifest } from "@/lib/manifest";
import fs from "node:fs/promises";
import path from "node:path";

async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      total += entry.isDirectory() ? await dirSize(p) : (await fs.stat(p)).size;
    }
    return total;
  } catch {
    return 0;
  }
}

export async function GET() {
  const stats = await storageStats();
  const finalDir = runtimeFinalDir();
  const poseLibraryDir = runtimePoseLibraryDir();
  const visualReferenceDir = runtimeVisualReferenceDir();
  const tempDir = runtimeOutputsDir();
  const [finalBytes, poseLibraryBytes, visualReferenceBytes, finalManifest, poseManifest] = await Promise.all([
    dirSize(finalDir),
    dirSize(poseLibraryDir),
    dirSize(visualReferenceDir),
    readManifest(finalDir),
    readManifest(poseLibraryDir),
  ]);
  return NextResponse.json({
    ...stats,
    tempPath: tempDir,
    finalPath: finalDir,
    finalExplicit: hasExplicitFinalDir(),
    poseLibraryPath: poseLibraryDir,
    poseLibraryExplicit: hasExplicitPoseLibraryDir(),
    visualReferencePath: visualReferenceDir,
    finalBytes,
    poseLibraryBytes,
    visualReferenceBytes,
    finalCount: finalManifest.images.length,
    poseLibraryCount: poseManifest.images.length,
  });
}

export async function DELETE() {
  await emptyTrash();
  return NextResponse.json(await storageStats());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; path?: string };
    const action = body.action;
    if (action === "clear-cache") await emptyOutputCache();
    else if (action === "set-output-path") updateOutputRoot(await saveRuntimeOutputsDir(String(body.path || "")));
    else if (action === "set-final-path") await saveRuntimeFinalDir(String(body.path || ""));
    else if (action === "set-pose-library-path") await saveRuntimePoseLibraryDir(String(body.path || ""));
    else if (action === "set-visual-reference-path") await saveRuntimeVisualReferenceDir(String(body.path || ""));
    else if (action === "open-dir") {
      const which = String(body.path || "temp");
      const dir = which === "final" ? runtimeFinalDir() : which === "pose" ? runtimePoseLibraryDir() : which === "visual" ? runtimeVisualReferenceDir() : runtimeOutputsDir();
      await fs.mkdir(dir, { recursive: true });
      return NextResponse.json({ opened: dir });
    } else throw new Error("不支持的存储操作");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "存储操作失败" }, { status: 400 });
  }
}
