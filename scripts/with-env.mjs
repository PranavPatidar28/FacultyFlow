import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const [file, ...args] = process.argv.slice(2);
if (!file || !args.length)
  throw new Error(
    "Usage: node scripts/with-env.mjs <env-file> <node-entrypoint> [arguments]",
  );
const result = spawnSync(process.execPath, args, {
  env: { ...process.env, ...parse(readFileSync(file)) },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
