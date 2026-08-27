import PoseInventoryManager from "@/components/PoseInventoryManager";
import { listInventory } from "@/lib/pose-inventory";
import { listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PoseInventoryPage() {
  const [manifest, projects] = await Promise.all([listInventory(), listProjects()]);
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Pose inventory</div>
          <h1>姿势库存</h1>
          <p>从本地图片文件夹 + Excel/CSV 表格建立姿势库存，图片继续保存在你的电脑里，工作台只建立索引。</p>
        </div>
      </header>
      <PoseInventoryManager initialManifest={manifest} projects={projects} />
    </>
  );
}
