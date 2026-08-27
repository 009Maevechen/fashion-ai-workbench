import crypto from "node:crypto";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/db";
import { getInventoryGroup, resolveLocalImage } from "@/lib/pose-inventory";
import { saveOutput } from "@/lib/ai/storage";
import { safeSegment } from "@/lib/ai/validators";
import { invalidateForAssetChange } from "@/lib/workflow";

/** 把姿势库存中的一组（3张本地图）应用到项目的三姿势工作流。 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const { groupId } = (await request.json()) as { groupId?: string };
    if (!groupId) throw new Error("缺少姿势组ID");
    const [project, group] = await Promise.all([getProject(id), getInventoryGroup(groupId)]);
    if (!project) throw new Error("项目不存在");
    if (!group) throw new Error("姿势组不存在");
    const paths = [group.pose01Path, group.pose02Path, group.pose03Path];
    if (paths.some((p) => !p)) throw new Error("该姿势组图片不完整，请先补全图片后重新扫描");

    const now = new Date().toISOString();
    const urls: string[] = [];
    for (let index = 0; index < 3; index++) {
      const buffer = await fs.readFile(resolveLocalImage(paths[index]!));
      const url = await saveOutput(
        project.sku,
        "pose-inventory",
        `${safeSegment(group.poseGroupId)}-pose${index + 1}-${crypto.randomUUID()}.jpg`,
        buffer,
      );
      urls.push(url);
    }
    const inputs = urls.map((imagePath, index) => {
      const previous = project.poseReferenceInputs?.find((item) => item.poseIndex === (index + 1));
      return {
        id: previous?.id || crypto.randomUUID(),
        poseIndex: (index + 1) as 1 | 2 | 3,
        imagePath,
        description: [group.pose1Description, group.pose2Description, group.pose3Description][index] || `姿势${index + 1}`,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
    });
    const updated = await updateProject(id, {
      poseReferenceInputs: inputs,
      selectedPoseTemplateGroupId: undefined,
      poseTemplateSnapshot: undefined,
      assets: { ...project.assets, poseReferenceImages: urls },
      settings: {
        ...project.settings,
        pose: {
          ...(project.settings.pose || { mode: "standard", shotType: "全身", face: false, background: true, detailRequirements: "", poseInstructions: inputs.map((i) => i.description || ""), sourceMode: project.confirmedTryonImage ? "confirmed" : "standalone" }),
          referenceMode: "upload",
          poseInstructions: [group.pose1Description, group.pose2Description, group.pose3Description].map((d) => d || ""),
        },
      },
    });
    await invalidateForAssetChange(id, "poseReferenceImages");
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "应用姿势组失败" }, { status: 400 });
  }
}
