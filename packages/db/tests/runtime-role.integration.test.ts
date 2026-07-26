// packages/db/tests/runtime-role.integration.test.ts
// 以 disposable PostgreSQL 證明 application runtime role 與 migration 管理角色隔離。

import { Client, escapeIdentifier, escapeLiteral } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configureRuntimeRole } from "../prisma/configure-runtime-role";

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
let migrationMetadataOwner: string;
let publicSchemaOwner: string;
const temporaryRoles = new Set<string>();
const OWNERSHIP_TABLE = "runtime_ownership_table_test";
const OWNERSHIP_VIEW = "runtime_ownership_view_test";
const OWNERSHIP_SEQUENCE = "runtime_ownership_sequence_test";

beforeAll(async () => {
  migrationClient = new Client({ connectionString: migrationDatabaseUrl });
  runtimeClient = new Client({ connectionString: runtimeDatabaseUrl });
  await migrationClient.connect();
  await runtimeClient.connect();
  const identity = await migrationClient.query<{
    migration_metadata_owner: string;
    public_schema_owner: string;
  }>(
    `SELECT
       (
         SELECT owner.rolname
         FROM pg_namespace AS namespace
         JOIN pg_roles AS owner ON owner.oid = namespace.nspowner
         WHERE namespace.nspname = 'public'
       ) AS public_schema_owner,
       (
         SELECT owner.rolname
         FROM pg_class AS class
         JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
         JOIN pg_roles AS owner ON owner.oid = class.relowner
         WHERE namespace.nspname = 'public'
           AND class.relname = '_prisma_migrations'
       ) AS migration_metadata_owner`,
  );
  const row = identity.rows[0];

  if (!row) {
    throw new Error("Failed to read PostgreSQL ownership test identities.");
  }
  migrationMetadataOwner = row.migration_metadata_owner;
  publicSchemaOwner = row.public_schema_owner;
});

afterEach(async () => {
  await cleanupOwnershipFixtures();
});

afterAll(async () => {
  await cleanupOwnershipFixtures();
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

describe("PostgreSQL runtime role ownership preflight", () => {
  it("creates and repeatedly converges a normally owned runtime role", async () => {
    const role = "runtime_normal_owner_test";
    temporaryRoles.add(role);

    await configureRuntimeRole({
      migrationDatabaseUrl,
      runtimeRole: role,
      runtimePassword: "normal-password-one",
    });
    await configureRuntimeRole({
      migrationDatabaseUrl,
      runtimeRole: role,
      runtimePassword: "normal-password-two",
    });

    const attributes = await readRoleAttributes(role);
    expect(attributes).toMatchObject({
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolsuper: false,
    });
    expect(await canConnectAs(role, "normal-password-one")).toBe(false);
    expect(await canConnectAs(role, "normal-password-two")).toBe(true);
    expect(await countOwnedPublicRelations(role)).toBe(0);
  });

  it("rejects public schema ownership before changing role attributes, password, or grants", async () => {
    const role = "runtime_schema_owner_test";
    await createTemporaryRole(role, "schema-owner-old-password");
    await migrationClient.query(`ALTER SCHEMA public OWNER TO ${escapeIdentifier(role)}`);

    await expect(
      configureRuntimeRole({
        migrationDatabaseUrl,
        runtimeRole: role,
        runtimePassword: "schema-owner-new-password",
      }),
    ).rejects.toThrow("Runtime role ownership preflight failed: the role owns the public schema.");

    expect(await readPublicSchemaOwner()).toBe(role);
    expect(await readRoleAttributes(role)).toMatchObject({ rolcreatedb: true });
    expect(await canConnectAs(role, "schema-owner-old-password")).toBe(true);
    expect(await canConnectAs(role, "schema-owner-new-password")).toBe(false);
    expect(await hasSchemaCreate(role)).toBe(true);
  });

  it.each([
    {
      kind: "table",
      name: OWNERSHIP_TABLE,
      create: `CREATE TABLE public.${escapeIdentifier(OWNERSHIP_TABLE)} (id integer)`,
      transfer: `ALTER TABLE public.${escapeIdentifier(OWNERSHIP_TABLE)} OWNER TO`,
    },
    {
      kind: "view",
      name: OWNERSHIP_VIEW,
      create: `CREATE VIEW public.${escapeIdentifier(OWNERSHIP_VIEW)} AS SELECT 1 AS id`,
      transfer: `ALTER VIEW public.${escapeIdentifier(OWNERSHIP_VIEW)} OWNER TO`,
    },
    {
      kind: "sequence",
      name: OWNERSHIP_SEQUENCE,
      create: `CREATE SEQUENCE public.${escapeIdentifier(OWNERSHIP_SEQUENCE)}`,
      transfer: `ALTER SEQUENCE public.${escapeIdentifier(OWNERSHIP_SEQUENCE)} OWNER TO`,
    },
  ])("rejects a runtime role that owns an application $kind", async ({
    create,
    name,
    transfer,
  }) => {
    const role = `runtime_${name.replace("runtime_ownership_", "").replace("_test", "")}_owner_test`;
    await createTemporaryRole(role, "relation-owner-password");
    await migrationClient.query(create);
    await migrationClient.query(`${transfer} ${escapeIdentifier(role)}`);

    await expect(
      configureRuntimeRole({
        migrationDatabaseUrl,
        runtimeRole: role,
        runtimePassword: "relation-owner-new-password",
      }),
    ).rejects.toThrow(
      "Runtime role ownership preflight failed: the role owns one or more public relations.",
    );
    expect(await readPublicRelationOwner(name)).toBe(role);
  });

  it("rejects a runtime role that owns Prisma migration metadata", async () => {
    const role = "runtime_migration_owner_test";
    await createTemporaryRole(role, "migration-owner-password");
    await migrationClient.query(
      `ALTER TABLE public."_prisma_migrations" OWNER TO ${escapeIdentifier(role)}`,
    );

    await expect(
      configureRuntimeRole({
        migrationDatabaseUrl,
        runtimeRole: role,
        runtimePassword: "migration-owner-new-password",
      }),
    ).rejects.toThrow("Runtime role ownership preflight failed: the role owns migration metadata.");
    expect(await readPublicRelationOwner("_prisma_migrations")).toBe(role);
  });
});

async function createTemporaryRole(role: string, password: string): Promise<void> {
  temporaryRoles.add(role);
  await migrationClient.query(
    `CREATE ROLE ${escapeIdentifier(role)} LOGIN PASSWORD ${escapeLiteral(password)} CREATEDB`,
  );
  await migrationClient.query(`GRANT CREATE ON SCHEMA public TO ${escapeIdentifier(role)}`);
}

async function cleanupOwnershipFixtures(): Promise<void> {
  await migrationClient.query(
    `ALTER SCHEMA public OWNER TO ${escapeIdentifier(publicSchemaOwner)}`,
  );
  await migrationClient.query(
    `ALTER TABLE public."_prisma_migrations" OWNER TO ${escapeIdentifier(migrationMetadataOwner)}`,
  );
  await migrationClient.query(`DROP VIEW IF EXISTS public.${escapeIdentifier(OWNERSHIP_VIEW)}`);
  await migrationClient.query(`DROP TABLE IF EXISTS public.${escapeIdentifier(OWNERSHIP_TABLE)}`);
  await migrationClient.query(
    `DROP SEQUENCE IF EXISTS public.${escapeIdentifier(OWNERSHIP_SEQUENCE)}`,
  );

  for (const role of temporaryRoles) {
    const identifier = escapeIdentifier(role);
    await migrationClient.query(`DROP OWNED BY ${identifier}`);
    await migrationClient.query(`DROP ROLE IF EXISTS ${identifier}`);
  }
  temporaryRoles.clear();
}

async function readRoleAttributes(role: string) {
  const result = await migrationClient.query<{
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
    [role],
  );
  return result.rows[0];
}

async function readPublicSchemaOwner(): Promise<string | undefined> {
  const result = await migrationClient.query<{ owner: string }>(
    `SELECT owner.rolname AS owner
     FROM pg_namespace AS namespace
     JOIN pg_roles AS owner ON owner.oid = namespace.nspowner
     WHERE namespace.nspname = 'public'`,
  );
  return result.rows[0]?.owner;
}

async function readPublicRelationOwner(relationName: string): Promise<string | undefined> {
  const result = await migrationClient.query<{ owner: string }>(
    `SELECT owner.rolname AS owner
     FROM pg_class AS class
     JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
     JOIN pg_roles AS owner ON owner.oid = class.relowner
     WHERE namespace.nspname = 'public'
       AND class.relname = $1`,
    [relationName],
  );
  return result.rows[0]?.owner;
}

async function countOwnedPublicRelations(role: string): Promise<number> {
  const result = await migrationClient.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM pg_class AS class
     JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
     JOIN pg_roles AS owner ON owner.oid = class.relowner
     WHERE namespace.nspname = 'public'
       AND owner.rolname = $1`,
    [role],
  );
  return result.rows[0]?.count ?? -1;
}

async function hasSchemaCreate(role: string): Promise<boolean> {
  const result = await migrationClient.query<{ allowed: boolean }>(
    "SELECT has_schema_privilege($1, 'public', 'CREATE') AS allowed",
    [role],
  );
  return result.rows[0]?.allowed ?? false;
}

async function canConnectAs(role: string, password: string): Promise<boolean> {
  const url = new URL(migrationDatabaseUrl);
  url.username = role;
  url.password = password;
  const client = new Client({ connectionString: url.toString() });

  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
