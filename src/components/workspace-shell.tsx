"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Workspace } from "./workspace";
const views = new Set([
  "timetable",
  "faculty",
  "substitutions",
  "changes",
  "academics",
  "availability",
  "inbox",
  "settings",
]);
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const view = pathname === "/" ? "dashboard" : pathname.slice(1);
  return (
    <>
      {view === "dashboard" || views.has(view) ? (
        <Workspace view={view} />
      ) : null}
      {children}
    </>
  );
}
