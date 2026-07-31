// packages/db/tests/target-price-notification/migration.integration.test.ts
// 驗證 RC-09 expand migration 在成功、逐 statement 失敗與舊 application rollback 時保留既有 due index。

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, escapeIdentifier } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for PostgreSQL migration tests.");
}

const migrationPath = fileURLToPath(
  new URL(
    "../../prisma/migrations/20260730120000_bound_target_price_notification_claim/migration.sql",
    import.meta.url,
  ),
);
const migrationSql = readFileSync(migrationPath, "utf8");
const migrationStatements = migrationSql
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);
const migrationClient = new Client({ connectionString: migrationDatabaseUrl });
const sandboxSchemas = new Set<string>();

beforeAll(async () => {
  await migrationClient.connect();
});

afterAll(async () => {
  for (const schema of sandboxSchemas) {
    await migrationClient.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(schema)} CASCADE`);
  }
  await migrationClient.end();
});

describe("RC-09 target-watch expand migration", () => {
  it("contains only the additive scan-state and pending-index statements", () => {
    expect(migrationSql).not.toMatch(/\b(?:ALTER|DROP|TRUNCATE)\b/i);
    expect(migrationStatements.map((statement) => statement.split(/\s+/, 2)[0])).toEqual([
      "CREATE",
      "INSERT",
      "CREATE",
    ]);
    expect(migrationStatements[0]).toContain(
      'TABLE "discord_target_price_notification_scan_state"',
    );
    expect(migrationStatements[1]).toContain('INTO "discord_target_price_notification_scan_state"');
    expect(migrationStatements[2]).toContain(
      'INDEX "discord_target_price_watches_pending_scan_idx"',
    );
  });

  it("keeps both old and new access paths in the deployed current schema", async () => {
    const indexes = await readTargetWatchIndexes("public");
    const scanState = await migrationClient.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM public.discord_target_price_notification_scan_state
       WHERE id = 1`,
    );

    expect(indexes).toMatchObject({
      discord_target_price_watches_notification_due_idx: {
        indisready: true,
        indisvalid: true,
      },
      discord_target_price_watches_pending_scan_idx: {
        indisready: true,
        indisvalid: true,
      },
    });
    expect(scanState.rows).toEqual([{ count: 1 }]);
  });

  it("upgrades a populated legacy schema without replacing its old access path", async () => {
    const schema = await createLegacySandbox();

    try {
      await applyMigrationPrefix(schema, migrationStatements.length);

      const indexes = await readTargetWatchIndexes(schema);
      const watches = await migrationClient.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM ${escapeIdentifier(schema)}.discord_target_price_watches`,
      );
      const scanState = await migrationClient.query<{
        cursor_updated_at: Date | null;
        cursor_watch_id: string | null;
        id: number;
        round_upper_updated_at: Date | null;
        round_upper_watch_id: string | null;
      }>(
        `SELECT id, cursor_updated_at, cursor_watch_id,
                round_upper_updated_at, round_upper_watch_id
         FROM ${escapeIdentifier(schema)}.discord_target_price_notification_scan_state`,
      );

      expect(indexes).toMatchObject({
        discord_target_price_watches_notification_due_idx: {
          indisready: true,
          indisvalid: true,
        },
        discord_target_price_watches_pending_scan_idx: {
          indisready: true,
          indisvalid: true,
        },
      });
      expect(watches.rows).toEqual([{ count: 2 }]);
      expect(scanState.rows).toEqual([
        {
          cursor_updated_at: null,
          cursor_watch_id: null,
          id: 1,
          round_upper_updated_at: null,
          round_upper_watch_id: null,
        },
      ]);
    } finally {
      await dropSandbox(schema);
    }
  });

  it.each(
    migrationStatements.map((_, statementIndex) => ({
      appliedStatements: statementIndex + 1,
    })),
  )("preserves the old due index after failure following statement $appliedStatements", async ({
    appliedStatements,
  }) => {
    const schema = await createLegacySandbox();

    try {
      await applyMigrationPrefix(schema, appliedStatements);
      await expect(
        migrationClient.query(
          `SELECT * FROM ${escapeIdentifier(schema)}.partsradar_forced_migration_failure`,
        ),
      ).rejects.toThrow();

      expect(await readTargetWatchIndexes(schema)).toMatchObject({
        discord_target_price_watches_notification_due_idx: {
          indisready: true,
          indisvalid: true,
        },
      });
    } finally {
      await dropSandbox(schema);
    }
  });

  it("keeps the legacy application query usable after the expand migration", async () => {
    const schema = await createLegacySandbox();

    try {
      await applyMigrationPrefix(schema, migrationStatements.length);
      const dueWatches = await migrationClient.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM ${escapeIdentifier(schema)}.discord_target_price_watches
         WHERE enabled = true
           AND last_notified_at IS NULL
           AND (
             notification_claimed_at IS NULL
             OR notification_claimed_at <= '2030-01-01T00:30:00.000Z'
           )`,
      );

      expect(dueWatches.rows).toEqual([{ count: 1 }]);
      expect(await readTargetWatchIndexes(schema)).toMatchObject({
        discord_target_price_watches_notification_due_idx: {
          indisready: true,
          indisvalid: true,
        },
      });
    } finally {
      await dropSandbox(schema);
    }
  });
});

async function createLegacySandbox(): Promise<string> {
  const schema = `rc09_migration_${randomUUID().replaceAll("-", "")}`;
  sandboxSchemas.add(schema);
  const schemaIdentifier = escapeIdentifier(schema);

  await migrationClient.query(`CREATE SCHEMA ${schemaIdentifier}`);
  await migrationClient.query(`
    CREATE TABLE ${schemaIdentifier}.discord_target_price_watches (
      id UUID NOT NULL PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_notified_at TIMESTAMPTZ(6),
      notification_claimed_at TIMESTAMPTZ(6),
      updated_at TIMESTAMPTZ(6) NOT NULL
    )
  `);
  await migrationClient.query(`
    CREATE INDEX discord_target_price_watches_notification_due_idx
    ON ${schemaIdentifier}.discord_target_price_watches(
      enabled,
      last_notified_at,
      notification_claimed_at
    )
  `);
  await migrationClient.query(
    `INSERT INTO ${schemaIdentifier}.discord_target_price_watches (
       id,
       enabled,
       last_notified_at,
       notification_claimed_at,
       updated_at
     )
     VALUES
       ($1, true, NULL, NULL, '2030-01-01T00:00:00.000Z'),
       ($2, false, NULL, NULL, '2030-01-01T00:01:00.000Z')`,
    [randomUUID(), randomUUID()],
  );

  return schema;
}

async function applyMigrationPrefix(schema: string, statementCount: number): Promise<void> {
  await migrationClient.query(`SET search_path TO ${escapeIdentifier(schema)}, pg_catalog`);
  try {
    for (const statement of migrationStatements.slice(0, statementCount)) {
      await migrationClient.query(statement);
    }
  } finally {
    await migrationClient.query("RESET search_path");
  }
}

async function readTargetWatchIndexes(
  schema: string,
): Promise<Record<string, { indisready: boolean; indisvalid: boolean }>> {
  const result = await migrationClient.query<{
    index_name: string;
    indisready: boolean;
    indisvalid: boolean;
  }>(
    `SELECT index_class.relname AS index_name, index.indisready, index.indisvalid
     FROM pg_index AS index
     JOIN pg_class AS table_class ON table_class.oid = index.indrelid
     JOIN pg_class AS index_class ON index_class.oid = index.indexrelid
     JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
     WHERE namespace.nspname = $1
       AND table_class.relname = 'discord_target_price_watches'
       AND index_class.relname IN (
         'discord_target_price_watches_notification_due_idx',
         'discord_target_price_watches_pending_scan_idx'
       )
     ORDER BY index_class.relname`,
    [schema],
  );

  return Object.fromEntries(
    result.rows.map(({ index_name, indisready, indisvalid }) => [
      index_name,
      { indisready, indisvalid },
    ]),
  );
}

async function dropSandbox(schema: string): Promise<void> {
  await migrationClient.query(`DROP SCHEMA ${escapeIdentifier(schema)} CASCADE`);
  sandboxSchemas.delete(schema);
}
