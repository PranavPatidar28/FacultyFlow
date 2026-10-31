import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const content = `DEMO_MODE=true\nSOLVER_URL=http://127.0.0.1:8001/api/solve\nSOLVER_SECRET=${randomBytes(32).toString("hex")}\n`;
try {
  await writeFile(new URL("../.env.local", import.meta.url), content, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Local synthetic demo configured. Start the Python solver, then npm run dev.",
  );
} catch (error) {
  if (error.code === "EEXIST")
    console.error(
      ".env.local already exists; it was preserved. Review it manually.",
    );
  else throw error;
  process.exitCode = 1;
}
