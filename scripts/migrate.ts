import { config } from "dotenv";
config({ path: ".env.local" });
if (process.env.DATABASE_URL_UNPOOLED)
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { db } from "../src/db";
await migrate(db(), { migrationsFolder: "drizzle" });
console.log("Database migrations applied.");
process.exit(0);
