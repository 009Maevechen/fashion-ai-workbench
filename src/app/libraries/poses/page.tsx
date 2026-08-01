import PoseLibraryManager from "@/components/PoseLibraryManager";
import {listPoseTemplateGroups,listProjects} from "@/lib/db";

export const dynamic="force-dynamic";

export default async function PoseLibraryPage(){
  const [groups,projects]=await Promise.all([listPoseTemplateGroups(),listProjects()]);
  return <><header className="page-head"><div><div className="eyebrow">Pose assets</div><h1>姿势库</h1><p>保存可复用的三姿势模板。相同图片、近似图片或相同姿势描述不会重复占用存储。</p></div></header><PoseLibraryManager initialGroups={groups} projects={projects}/></>;
}
