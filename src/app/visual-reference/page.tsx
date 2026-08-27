import VisualReferenceManager from "@/components/VisualReferenceManager";
import { readVisualReferenceManifest } from "@/lib/visual-reference";
import { listProjects } from "@/lib/db";
import { visualReferenceSettings } from "@/lib/runtime-paths";

export const dynamic = "force-dynamic";

export default async function VisualReferencePage() {
  const [manifest, projects] = await Promise.all([readVisualReferenceManifest(), listProjects()]);
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Visual reference</div>
          <h1>视觉参考库</h1>
          <p>读取本地参考图库，AI 识别分类打标签，为当前商品匹配参考图与三姿势模板组，输出视觉生产方案。</p>
        </div>
      </header>
      <VisualReferenceManager initialManifest={manifest} projects={projects} initialSettings={visualReferenceSettings()} />
    </>
  );
}
