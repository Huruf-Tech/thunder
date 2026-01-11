import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Env } from "./core/common/env.ts";

export const db = drizzle({ client: neon(Env.getSync("DATABASE_URL")) });
