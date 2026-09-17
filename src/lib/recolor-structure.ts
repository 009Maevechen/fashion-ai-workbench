export type RecolorStructureMode="same_style"|"explicit_variant";
export type RecolorStyleRelation="same"|"explicit_difference"|"uncertain";

export const EXPLICIT_STRUCTURE_CONFIDENCE=0.85;

/** 默认锁定原款。只有参考图明确显示、置信度足够且列出具体差异时才允许改结构。 */
export function resolveRecolorStructureMode(
  relation:RecolorStyleRelation|undefined,
  confidence:number|undefined,
  differences:string[]|undefined,
):RecolorStructureMode{
  return relation==="explicit_difference"
    &&(confidence||0)>=EXPLICIT_STRUCTURE_CONFIDENCE
    &&Boolean(differences?.length)
    ?"explicit_variant"
    :"same_style";
}

export function recolorStructureNeedsReview(
  relation:RecolorStyleRelation|undefined,
  confidence:number|undefined,
  differences:string[]|undefined,
  occlusion:"none"|"partial"|"heavy"|undefined,
){
  const possibleDifference=relation==="explicit_difference"
    &&resolveRecolorStructureMode(relation,confidence,differences)!=="explicit_variant";
  const hiddenStructure=occlusion!=="none"&&relation==="uncertain";
  return possibleDifference||hiddenStructure;
}

export type RecolorConsistencyStatus="passed"|"needs_review"|"failed";

export function resolveRecolorConsistencyStatus(input:{
  consistent:boolean;
  score:number;
  checks:{
    silhouette:boolean;
    construction:boolean;
    colorMapping:boolean;
    regionIsolation:boolean;
    person:boolean;
    composition:boolean;
    cleanliness:boolean;
    toneIntegrity:boolean;
    artifactFree:boolean;
  };
}):RecolorConsistencyStatus{
  const criticalFailed=!input.checks.silhouette
    ||!input.checks.construction
    ||!input.checks.colorMapping
    ||!input.checks.regionIsolation
    ||!input.checks.person
    ||!input.checks.composition
    ||!input.checks.cleanliness
    ||!input.checks.toneIntegrity
    ||!input.checks.artifactFree;
  if(input.consistent&&input.score>=85&&!criticalFailed)return "passed";
  if(criticalFailed||(!input.consistent&&input.score<65))return "failed";
  return "needs_review";
}
