import type {Project} from "./db";
import {duplicateColorNames} from "./color-sets";
import {confirmedColorResults} from "./recolor-collection";

export function finalPackageIssues(project:Project){
  const colors=project.targetColors||[];
  const poseCount=new Set((project.confirmedPoseImages||[]).filter(Boolean)).size;
  const emptyColors=colors.filter(color=>!confirmedColorResults(color).some(Boolean));
  const staleColors=colors.filter(color=>color.status==="stale");
  return [
    !project.confirmedTryonImage&&"尚未确认换装结果",
    (poseCount<2||poseCount>3)&&"尚未确认两张或三张姿势图",
    colors.length===0&&"尚未建立任何颜色套装",
    emptyColors.length>0&&`${emptyColors.length} 款颜色还没有生成出可导出照片`,
    duplicateColorNames(colors).size>0&&"存在重复颜色名称",
    project.dependencyStatus&&project.dependencyStatus!=="current"&&"上游输入已经变化，当前结果需要重新生成或重新审核",
    staleColors.length>0&&`${staleColors.length} 套复色结果已过期`,
  ].filter(Boolean) as string[];
}

export function finalPackagePhotoCount(project:Project){
  const urls=[
    project.confirmedTryonImage,
    ...(project.confirmedPoseImages||[]),
    ...(project.targetColors||[]).flatMap(confirmedColorResults),
    ...(project.confirmedRecolorImages||[]),
  ].filter(Boolean) as string[];
  return new Set(urls).size;
}
