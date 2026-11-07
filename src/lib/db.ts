import {PrismaClient} from "@prisma/client";
const globalDb = globalThis as unknown as {breweryDb?: PrismaClient};
export const db = globalDb.breweryDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.breweryDb = db;
