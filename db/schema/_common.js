// Shared column factories mirroring Prisma defaults. TEXT columns cannot
// carry DB-level defaults in MySQL, so Prisma's @default("[]")/("{}")/etc.
// are reproduced application-side via $defaultFn — identical behavior.
import { varchar, text, timestamp } from "drizzle-orm/mysql-core";
import { randomUUID } from "node:crypto";

// UUID primary key (Prisma @id @default(uuid())).
export const uuidPk = (name = "id") =>
    varchar(name, { length: 36 }).primaryKey().$defaultFn(() => randomUUID());

// String primary key such as guildId / tokenHash.
export const strPk = (name, length = 191) =>
    varchar(name, { length }).primaryKey();

// Indexed string (unique keys, FK-less join columns): bounded so MySQL
// can index it under utf8mb4.
export const str191 = (name) => varchar(name, { length: 191 });

// Free-form / JSON string content.
export const txt = (name) => text(name);

// TEXT with a Prisma @default("...") reproduced application-side.
export const txtDef = (name, value) => text(name).notNull().$defaultFn(() => value);

export const createdAt = (name = "createdAt") =>
    timestamp(name, { mode: "date", fsp: 3 }).notNull().defaultNow();

export const updatedAt = (name = "updatedAt") =>
    timestamp(name, { mode: "date", fsp: 3 }).notNull().defaultNow().onUpdateNow().$onUpdateFn(() => new Date());

export const ts = (name) => timestamp(name, { mode: "date", fsp: 3 });

export { randomUUID };
