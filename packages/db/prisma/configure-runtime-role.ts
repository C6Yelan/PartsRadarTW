// packages/db/prisma/configure-runtime-role.ts
// 由 migration 管理連線建立並收斂 application runtime role 的最小資料庫權限。

import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { Client, escapeIdentifier } from "pg";

interface RuntimeRoleConfiguration {
  migrationDatabaseUrl: string;
  runtimeRole: string;
  runtimePassword: string;
}

export interface RuntimeRoleConfigurationResult {
  databaseName: string;
  tableCount: number;
  viewCount: number;
  sequenceCount: number;
}

class RuntimeRoleOwnershipError extends Error {}

export async function configureRuntimeRole({
  migrationDatabaseUrl,
  runtimeRole,
  runtimePassword,
}: RuntimeRoleConfiguration): Promise<RuntimeRoleConfigurationResult> {
  const client = new Client({ connectionString: migrationDatabaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    const identity = await client.query<{
      database_name: string;
      migration_role: string;
    }>("SELECT current_database() AS database_name, current_user AS migration_role");
    const databaseName = identity.rows[0]?.database_name;
    const migrationRole = identity.rows[0]?.migration_role;

    if (!databaseName || !migrationRole) {
      throw new Error("Unable to resolve the migration database identity.");
    }
    if (runtimeRole === migrationRole) {
      throw new Error("The runtime role must be different from the migration role.");
    }

    const roleIdentifier = escapeIdentifier(runtimeRole);
    const databaseIdentifier = escapeIdentifier(databaseName);
    const [existingRole, membership, databaseOwner] = await Promise.all([
      client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [runtimeRole]),
      client.query(
        `SELECT 1
         FROM pg_auth_members AS membership
         JOIN pg_roles AS member ON member.oid = membership.member
         WHERE member.rolname = $1
         LIMIT 1`,
        [runtimeRole],
      ),
      client.query(
        `SELECT 1
         FROM pg_database AS database
         JOIN pg_roles AS owner ON owner.oid = database.datdba
         WHERE database.datname = current_database()
           AND owner.rolname = $1`,
        [runtimeRole],
      ),
    ]);

    if ((membership.rowCount ?? 0) > 0) {
      throw new Error("The runtime role must not inherit privileges from another role.");
    }
    if ((databaseOwner.rowCount ?? 0) > 0) {
      throw new Error("The runtime role must not own the application database.");
    }
    await assertRuntimeRoleOwnsNoApplicationObjects(client, runtimeRole);

    if (existingRole.rowCount === 0) {
      await client.query(
        `CREATE ROLE ${roleIdentifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
    } else {
      await client.query(
        `ALTER ROLE ${roleIdentifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
    }
    await client.query(
      `SELECT
         set_config('partsradar.runtime_role', $1, true),
         set_config('partsradar.runtime_password', $2, true)`,
      [runtimeRole, runtimePassword],
    );
    await client.query(`
      DO $runtime_role_password$
      BEGIN
        EXECUTE format(
          'ALTER ROLE %I PASSWORD %L',
          current_setting('partsradar.runtime_role'),
          current_setting('partsradar.runtime_password')
        );
      END
      $runtime_role_password$
    `);

    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await client.query(
      `REVOKE ALL PRIVILEGES ON DATABASE ${databaseIdentifier} FROM ${roleIdentifier}`,
    );
    await client.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${roleIdentifier}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
    await client.query(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${roleIdentifier}`,
    );
    await client.query(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${roleIdentifier}`,
    );

    const objects = await client.query<{ object_name: string; object_type: string }>(
      `SELECT class.relname AS object_name, class.relkind AS object_type
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'public'
         AND class.relkind IN ('r', 'p', 'v', 'm', 'S')
       ORDER BY class.relname`,
    );
    let tableCount = 0;
    let viewCount = 0;
    let sequenceCount = 0;

    for (const object of objects.rows) {
      const objectIdentifier = `public.${escapeIdentifier(object.object_name)}`;

      if (object.object_name === "_prisma_migrations") {
        continue;
      }
      if (object.object_type === "r" || object.object_type === "p") {
        await client.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${objectIdentifier} TO ${roleIdentifier}`,
        );
        tableCount += 1;
      } else if (object.object_type === "v" || object.object_type === "m") {
        await client.query(`GRANT SELECT ON TABLE ${objectIdentifier} TO ${roleIdentifier}`);
        viewCount += 1;
      } else {
        await client.query(
          `GRANT USAGE, SELECT ON SEQUENCE ${objectIdentifier} TO ${roleIdentifier}`,
        );
        sequenceCount += 1;
      }
    }

    await client.query("COMMIT");
    return { databaseName, tableCount, viewCount, sequenceCount };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function assertRuntimeRoleOwnsNoApplicationObjects(
  client: Client,
  runtimeRole: string,
): Promise<void> {
  const ownership = await client.query<{
    owns_migration_metadata: boolean;
    owns_public_relation: boolean;
    owns_public_schema: boolean;
  }>(
    `SELECT
       EXISTS (
         SELECT 1
         FROM pg_namespace AS namespace
         JOIN pg_roles AS owner ON owner.oid = namespace.nspowner
         WHERE namespace.nspname = 'public'
           AND owner.rolname = $1
       ) AS owns_public_schema,
       EXISTS (
         SELECT 1
         FROM pg_class AS class
         JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
         JOIN pg_roles AS owner ON owner.oid = class.relowner
         WHERE namespace.nspname = 'public'
           AND owner.rolname = $1
       ) AS owns_public_relation,
       EXISTS (
         SELECT 1
         FROM pg_class AS class
         JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
         JOIN pg_roles AS owner ON owner.oid = class.relowner
         WHERE namespace.nspname = 'public'
           AND class.relname = '_prisma_migrations'
           AND owner.rolname = $1
       ) AS owns_migration_metadata`,
    [runtimeRole],
  );
  const result = ownership.rows[0];

  if (result?.owns_public_schema) {
    throw new RuntimeRoleOwnershipError(
      "Runtime role ownership preflight failed: the role owns the public schema.",
    );
  }
  if (result?.owns_migration_metadata) {
    throw new RuntimeRoleOwnershipError(
      "Runtime role ownership preflight failed: the role owns migration metadata.",
    );
  }
  if (result?.owns_public_relation) {
    throw new RuntimeRoleOwnershipError(
      "Runtime role ownership preflight failed: the role owns one or more public relations.",
    );
  }
}

async function main(): Promise<void> {
  if (process.env.CI !== "true" && process.env.PARTSRADAR_SKIP_DOTENV !== "1") {
    loadDotenv({ path: resolve(__dirname, "../../..", ".env"), quiet: true });
  }

  const migrationDatabaseUrl = requireEnvironment("MIGRATION_DATABASE_URL");
  const runtimeRole = requireEnvironment("POSTGRES_RUNTIME_USER");
  const runtimePassword = requireEnvironment("POSTGRES_RUNTIME_PASSWORD");
  const result = await configureRuntimeRole({
    migrationDatabaseUrl,
    runtimeRole,
    runtimePassword,
  });

  console.log(
    `Runtime database role configured for ${result.databaseName}: ${result.tableCount} tables, ${result.viewCount} views, ${result.sequenceCount} sequences.`,
  );
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof RuntimeRoleOwnershipError
        ? error.message
        : "Runtime database role configuration failed.",
    );
    process.exitCode = 1;
  });
}
