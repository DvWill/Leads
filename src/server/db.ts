import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prospectaPrisma?: PrismaClient;
};

/**
 * A single Prisma client per Node.js process. Reusing the client is especially
 * important during Next.js development, where modules are frequently reloaded.
 */
export const db =
  globalForPrisma.prospectaPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prospectaPrisma = db;
}

export default db;
