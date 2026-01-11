import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import process from "node:process";
import { schemas } from "./drizzle.schemas.ts";

export default defineConfig({
  out: "./drizzle",
  schema: ["db", ...schemas],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
