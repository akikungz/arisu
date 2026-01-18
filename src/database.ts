import { Pool } from "pg";

import { env } from "./env.js";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./prisma/generated/client.js";

export const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
    })
  ),
});

// Re-export Prisma types for convenience
export type { PrismaClient } from "./prisma/generated/client.js";
export * from "./prisma/generated/enums.js";