// 驗證 RC-07 migration 可升級既有個人排程設定，且保留舊版排程讀取路徑。

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, escapeIdentifier } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required for RC-07 migration tests.");
}

const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../prisma/migrations/20260801013000_bound_scheduled_price_report_retries/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const client = new Client({ connectionString: migrationDatabaseUrl });
const schemas = new Set<string>();

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  for (const schema of schemas) {
    await client.query(`DROP SCHEMA IF EXISTS ${escapeIdentifier(schema)} CASCADE`);
  }
  await client.end();
});

describe("RC-07 scheduled price report retry migration", () => {
  it("has the expected current-schema defaults and due index", async () => {
    const columns = await client.query<{
      column_name: string;
      column_default: string | null;
      is_nullable: string;
    }>(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'discord_price_report_settings'
        AND column_name IN (
          'delivery_state',
          'consecutive_delivery_failures',
          'delivery_claimed_at'
        )
      ORDER BY column_name
    `);
    const index = await client.query<{ indisready: boolean; indisvalid: boolean }>(`
      SELECT index_meta.indisready, index_meta.indisvalid
      FROM pg_index AS index_meta
      JOIN pg_class AS index_relation ON index_relation.oid = index_meta.indexrelid
      JOIN pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND index_relation.relname = 'discord_price_report_settings_delivery_due_idx'
    `);

    expect(columns.rows).toEqual([
      { column_name: "consecutive_delivery_failures", column_default: "0", is_nullable: "NO" },
      { column_name: "delivery_claimed_at", column_default: null, is_nullable: "YES" },
      {
        column_name: "delivery_state",
        column_default: "'active'::discord_price_report_delivery_state",
        is_nullable: "NO",
      },
    ]);
    expect(index.rows).toEqual([{ indisready: true, indisvalid: true }]);
  });

  it("upgrades a populated representative legacy table without losing schedule truth", async () => {
    const schema = `rc07_migration_${randomUUID().replaceAll("-", "")}`;
    schemas.add(schema);
    const identifier = escapeIdentifier(schema);
    await client.query(`CREATE SCHEMA ${identifier}`);
    await client.query(`
      CREATE TABLE ${identifier}.discord_price_report_settings (
        id uuid PRIMARY KEY,
        discord_user_id text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        next_send_at timestamptz(6),
        notification_cursor_at timestamptz(6),
        last_sent_at timestamptz(6)
      )
    `);
    await client.query(
      `INSERT INTO ${identifier}.discord_price_report_settings (
         id, discord_user_id, enabled, next_send_at, notification_cursor_at, last_sent_at
       ) VALUES ($1, $2, true, $3, $4, $5)`,
      [
        randomUUID(),
        "masked-test-subject",
        new Date("2026-08-01T01:00:00.000Z"),
        new Date("2026-07-31T01:00:00.000Z"),
        new Date("2026-07-31T01:00:00.000Z"),
      ],
    );

    await client.query(`SET search_path TO ${identifier}, pg_catalog`);
    try {
      await client.query(migrationSql);
    } finally {
      await client.query("RESET search_path");
    }

    const rows = await client.query<{
      consecutive_delivery_failures: number;
      delivery_claimed_at: Date | null;
      delivery_state: string;
      legacy_due: boolean;
    }>(`
      SELECT
        consecutive_delivery_failures,
        delivery_claimed_at,
        delivery_state::text,
        (enabled = true AND next_send_at IS NOT NULL) AS legacy_due
      FROM ${identifier}.discord_price_report_settings
    `);

    expect(rows.rows).toEqual([
      {
        consecutive_delivery_failures: 0,
        delivery_claimed_at: null,
        delivery_state: "active",
        legacy_due: true,
      },
    ]);
  });
});
