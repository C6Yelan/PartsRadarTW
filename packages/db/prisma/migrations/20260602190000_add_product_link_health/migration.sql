-- CreateEnum
CREATE TYPE "product_link_kind" AS ENUM ('source', 'introduction');

-- CreateEnum
CREATE TYPE "product_link_health_status" AS ENUM ('ok', 'broken', 'temporary_error');

-- CreateTable
CREATE TABLE "product_link_health" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "link_kind" "product_link_kind" NOT NULL,
    "url" TEXT NOT NULL,
    "status" "product_link_health_status" NOT NULL,
    "http_status" INTEGER,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "last_ok_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_link_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_link_health_status_idx" ON "product_link_health"("status");

-- CreateIndex
CREATE INDEX "product_link_health_checked_at_idx" ON "product_link_health"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_link_health_product_id_link_kind_key" ON "product_link_health"("product_id", "link_kind");

-- AddForeignKey
ALTER TABLE "product_link_health" ADD CONSTRAINT "product_link_health_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
