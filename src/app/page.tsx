import { cookies } from "next/headers";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (
    process.env.DEMO_MODE === "true" &&
    !(await cookies()).get("facultyflow-demo")
  )
    redirect("/api/demo");
  return null;
}
