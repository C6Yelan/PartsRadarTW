import { Prisma, type PrismaClient } from "@prisma/client";

interface CandidateHeavyFixtureContext {
  boundedCandidates: number;
  candidateLimit: number;
  categoryId: string;
  client: PrismaClient;
  crawlRunId: string;
  highHistoryObservationsPerProduct: number;
  now: Date;
  pageSize: number;
  prefix: string;
}

export async function seedCandidateHeavyFixture({
  boundedCandidates,
  candidateLimit,
  categoryId,
  client,
  crawlRunId,
  highHistoryObservationsPerProduct,
  now,
  pageSize,
  prefix,
}: CandidateHeavyFixtureContext): Promise<void> {
  const candidateCount = candidateLimit + 1;
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.products (
      id, source_category_id, ibuy_token, name, normalized_name, vendor_slug, vendor_name,
      filter_tags, source_url, is_active, is_excluded, first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      ${categoryId}::uuid,
      ${prefix} || '-token-' || sequence_number::text,
      'Movement product ' || sequence_number::text,
      'movement product ' || sequence_number::text,
      CASE WHEN sequence_number <= ${boundedCandidates} THEN 'bounded' ELSE 'overflow' END,
      'Movement vendor',
      ARRAY['gpu_chip:nvidia', CASE WHEN sequence_number % 2 = 0 THEN 'vram:12gb' ELSE 'vram:8gb' END]::text[],
      'https://example.invalid/' || sequence_number::text,
      sequence_number < ${candidateCount},
      FALSE,
      ${now}::timestamptz - interval '60 days',
      ${now}::timestamptz,
      ${now}::timestamptz,
      ${now}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':baseline:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      1000,
      'TWD'::public.currency,
      ${now}::timestamptz - interval '40 days',
      ${crawlRunId}::uuid,
      ${now}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
    UNION ALL
    SELECT
      pg_catalog.md5(${prefix} || ':current:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      1000 + CASE WHEN sequence_number % 3 = 0 THEN -100 WHEN sequence_number % 3 = 1 THEN 100 ELSE 0 END,
      'TWD'::public.currency,
      ${now}::timestamptz - interval '1 hour',
      ${crawlRunId}::uuid,
      ${now}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.current_prices (
      product_id, price_snapshot_id, last_seen_at, price_changed_at, updated_at
    )
    SELECT
      pg_catalog.md5(${prefix} || ':product:' || sequence_number::text)::uuid,
      pg_catalog.md5(${prefix} || ':current:' || sequence_number::text)::uuid,
      ${now}::timestamptz - interval '30 minutes',
      ${now}::timestamptz - interval '1 hour',
      ${now}::timestamptz
    FROM pg_catalog.generate_series(1, ${candidateCount}) AS sequence_number
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    )
    SELECT
      pg_catalog.md5(
        ${prefix} || ':history:' || product_number::text || ':' || observation_number::text
      )::uuid,
      pg_catalog.md5(${prefix} || ':product:' || product_number::text)::uuid,
      1000 + observation_number,
      'TWD'::public.currency,
      ${now}::timestamptz - interval '29 days' + observation_number * interval '1 minute',
      ${crawlRunId}::uuid,
      ${now}::timestamptz
    FROM pg_catalog.generate_series(1, ${pageSize}) AS product_number
    CROSS JOIN pg_catalog.generate_series(1, ${highHistoryObservationsPerProduct})
      AS observation_number
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.price_snapshots AS snapshot
    SET price = CASE
      WHEN snapshot.id = pg_catalog.md5(
        ${prefix} || ':baseline:' || parity_case.product_number::text
      )::uuid THEN parity_case.baseline_price
      ELSE parity_case.current_price
    END
    FROM (
      VALUES
        (9, 160, 137),
        (10, 160, 183),
        (11, 32, 33),
        (12, 32, 31),
        (13, 6, 7),
        (14, 6, 5),
        (15, 100, 100),
        (16, 1000, 1100),
        (17, 2000, 2200),
        (18, 1000, 900),
        (19, 2000, 1800)
    ) AS parity_case(product_number, baseline_price, current_price)
    WHERE snapshot.id IN (
      pg_catalog.md5(
        ${prefix} || ':baseline:' || parity_case.product_number::text
      )::uuid,
      pg_catalog.md5(
        ${prefix} || ':current:' || parity_case.product_number::text
      )::uuid
    )
      AND snapshot.price IS DISTINCT FROM CASE
        WHEN snapshot.id = pg_catalog.md5(
          ${prefix} || ':baseline:' || parity_case.product_number::text
        )::uuid THEN parity_case.baseline_price
        ELSE parity_case.current_price
      END
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.price_snapshots
    SET price = 0
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:4')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:5')::uuid
      AND id <> pg_catalog.md5(${prefix} || ':current:5')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.current_prices
    SET last_seen_at = ${now}::timestamptz - interval '1 hour'
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:5')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:6')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    UPDATE public.current_prices
    SET last_seen_at = ${now}::timestamptz - interval '31 days'
    WHERE product_id = pg_catalog.md5(${prefix} || ':product:7')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    DELETE FROM public.price_snapshots
    WHERE id = pg_catalog.md5(${prefix} || ':baseline:8')::uuid
  `);
  await client.$executeRaw(Prisma.sql`
    INSERT INTO public.price_snapshots (
      id, product_id, price, currency, captured_at, crawl_run_id, created_at
    ) VALUES
      (
        '00000000-0000-4000-8000-000000000008'::uuid,
        pg_catalog.md5(${prefix} || ':product:8')::uuid,
        800,
        'TWD'::public.currency,
        ${now}::timestamptz - interval '40 days',
        ${crawlRunId}::uuid,
        ${now}::timestamptz
      ),
      (
        'ffffffff-ffff-4fff-bfff-ffffffffff08'::uuid,
        pg_catalog.md5(${prefix} || ':product:8')::uuid,
        500,
        'TWD'::public.currency,
        ${now}::timestamptz - interval '40 days',
        ${crawlRunId}::uuid,
        ${now}::timestamptz
      )
  `);
}
