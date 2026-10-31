import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (
    ![
      "timetable",
      "faculty",
      "substitutions",
      "changes",
      "academics",
      "availability",
      "inbox",
      "settings",
    ].includes(view)
  )
    notFound();
  if (
    process.env.DEMO_MODE === "true" &&
    !(await cookies()).get("facultyflow-demo")
  )
    redirect("/api/demo");
  return null;
}
