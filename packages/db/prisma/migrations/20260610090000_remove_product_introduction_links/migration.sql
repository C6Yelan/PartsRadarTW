DELETE FROM "product_link_health"
WHERE "link_kind" = 'introduction';

ALTER TABLE "products"
DROP COLUMN "introduction_url";

CREATE TYPE "product_link_kind_new" AS ENUM ('source');

ALTER TABLE "product_link_health"
ALTER COLUMN "link_kind" TYPE "product_link_kind_new"
USING "link_kind"::text::product_link_kind_new;

DROP TYPE "product_link_kind";
ALTER TYPE "product_link_kind_new" RENAME TO "product_link_kind";
