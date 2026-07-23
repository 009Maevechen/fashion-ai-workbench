export function uniqueArchivePath(requested:string,used:Set<string>){
  if(!used.has(requested)){used.add(requested);return requested}
  const dot=requested.lastIndexOf("."),base=dot>requested.lastIndexOf("/")?requested.slice(0,dot):requested,extension=dot>requested.lastIndexOf("/")?requested.slice(dot):"";
  let version=2,candidate="";
  do{candidate=`${base}_v${version}${extension}`;version++}while(used.has(candidate));
  used.add(candidate);return candidate;
}
