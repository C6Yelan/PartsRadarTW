// packages/db/tests/runtime-role.integration.test.ts
// 以 disposable PostgreSQL 證明 application runtime role 與 migration 管理角色隔離。

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.TEST_DATABASE_URL;
const runtimeRole = process.env.POSTGRES_RUNTIME_USER;

if (!migrationDatabaseUrl || !runtimeDatabaseUrl || !runtimeRole) {
  throw new Error(
    "MIGRATION_DATABASE_URL, TEST_DATABASE_URL, and POSTGRES_RUNTIME_USER are required.",
  );
}

let migrationClient: Client;
let runtimeClient: Client;

beforeAll(async () => {
  migrationClient = new Client({ connectionString: migrationDatabaseUrl });
  runtimeClient = new Client({ connectionString: runtimeDatabaseUrl });
  await migrationClient.connect();
  await runtimeClient.connect();
});

afterAll(async () => {
  await migrationClient.query('DROP TABLE IF EXISTS public."runtime_role_should_not_create"');
  await Promise.all([migrationClient.end(), runtimeClient.end()]);
});

describe("PostgreSQL runtime role", () => {
  it("uses a distinct login without administrative attributes or inherited roles", async () => {
    const identity = await runtimeClient.query<{ current_user: string }>(
      "SELECT current_user AS current_user",
    );
    const attributes = await migrationClient.query<{
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolinherit: boolean;
      rolreplication: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
       FROM pg_roles
       WHERE rolname = $1`,
      [runtimeRole],
    );
    const membership = await migrationClient.query(
      `SELECT 1
       FROM pg_auth_members AS membership
       JOIN pg_roles AS member ON member.oid = membership.member
       WHERE member.rolname = $1`,
      [runtimeRole],
    );
    const databaseOwner = await migrationClient.query(
      `SELECT 1
       FROM pg_database AS database
       JOIN pg_roles AS owner ON owner.oid = database.datdba
       WHERE database.datname = current_database()
         AND owner.rolname = $1`,
      [runtimeRole],
    );

    expect(identity.rows[0]?.current_user).toBe(runtimeRole);
    expect(attributes.rows).toEqual([
      {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
      },
    ]);
    expect(membership.rowCount).toBe(0);
    expect(databaseOwner.rowCount).toBe(0);
  });

  it("has application DML and view read grants without migration metadata or DDL access", async () => {
    const privileges = await migrationClient.query<{
      base_table_count: number;
      base_table_missing_dml: number;
      migration_metadata_readable: boolean;
      schema_create: boolean;
      schema_usage: boolean;
      view_count: number;
      view_missing_select: number;
      view_with_write: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE class.relkind IN ('r', 'p') AND class.relname <> '_prisma_migrations')::int AS base_table_count,
         COUNT(*) FILTER (
           WHERE class.relkind IN ('r', 'p')
             AND class.relname <> '_prisma_migrations'
             AND NOT (
               has_table_privilege($1, class.oid, 'SELECT')
               AND has_table_privilege($1, class.oid, 'INSERT')
               AND has_table_privilege($1, class.oid, 'UPDATE')
               AND has_table_privilege($1, class.oid, 'DELETE')
             )
         )::int AS base_table_missing_dml,
         COUNT(*) FILTER (WHERE class.relkind IN ('v', 'm'))::int AS view_count,
         COUNT(*) FILTER (
           WHERE class.relkind IN ('v', 'm')
             AND NOT has_table_privilege($1, class.oid, 'SELECT')
         )::int AS view_missing_select,
         COUNT(*) FILTER (
           WHERE class.relkind IN ('v', 'm')
             AND (
               has_table_privilege($1, class.oid, 'INSERT')
               OR has_table_privilege($1, class.oid, 'UPDATE')
               OR has_table_privilege($1, class.oid, 'DELETE')
             )
         )::int AS view_with_write,
         BOOL_OR(
           class.relname = '_prisma_migrations'
           AND has_table_privilege($1, class.oid, 'SELECT')
         ) AS migration_metadata_readable,
         BOOL_OR(has_schema_privilege($1, 'public', 'USAGE')) AS schema_usage,
         BOOL_OR(has_schema_privilege($1, 'public', 'CREATE')) AS schema_create
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND class.relkind IN ('r', 'p', 'v', 'm')`,
      [runtimeRole],
    );

    expect(privileges.rows[0]).toMatchObject({
      base_table_missing_dml: 0,
      migration_metadata_readable: false,
      schema_create: false,
      schema_usage: true,
      view_missing_select: 0,
      view_with_write: 0,
    });
    expect(privileges.rows[0]?.base_table_count).toBeGreaterThan(0);
    expect(privileges.rows[0]?.view_count).toBeGreaterThan(0);
    await expect(
      runtimeClient.query('CREATE TABLE public."runtime_role_should_not_create" (id integer)'),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runtimeClient.query('SELECT * FROM public."_prisma_migrations" LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });
});
