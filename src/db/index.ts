import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
let instance: ReturnType<typeof create> | undefined;
function create() {
  return drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), {
    schema,
  });
}
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  return (instance ??= create());
}
