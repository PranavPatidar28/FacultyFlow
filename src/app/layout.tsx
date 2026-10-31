import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceShell } from "@/components/workspace-shell";
export const metadata: Metadata = {
  title: {
    default: "FacultyFlow",
    template: "%s · FacultyFlow",
  },
  description: "Manage faculty timetables, availability, and class coverage.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkspaceShell>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
