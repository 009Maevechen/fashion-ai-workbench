"use client";

import {usePathname} from "next/navigation";
import AppChrome from "@/components/AppChrome";
import PhotoCopyLayer from "@/components/workbench/PhotoCopyLayer";

const workbenchPrefixes=["/workbench","/projects/","/history","/libraries/","/inventory/","/visual-reference","/settings"];

export default function RootShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const isWorkbench=workbenchPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(prefix));
  return isWorkbench?<><AppChrome>{children}</AppChrome><PhotoCopyLayer/></>:children;
}
