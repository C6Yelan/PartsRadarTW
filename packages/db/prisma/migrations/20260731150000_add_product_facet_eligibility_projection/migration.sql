CREATE TABLE "product_facet_eligible_products" (
  "igrp" INTEGER NOT NULL,
  "tag" TEXT NOT NULL,
  "product_id" UUID NOT NULL,

  CONSTRAINT "product_facet_eligible_products_pkey"
    PRIMARY KEY ("igrp", "tag", "product_id"),
  CONSTRAINT "product_facet_eligible_products_product_id_fkey"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "product_facet_eligible_products_product_id_idx"
  ON "product_facet_eligible_products"("product_id");

COMMENT ON TABLE "product_facet_eligible_products" IS
  'Derived projection of active, included, priced products by supported public facet tag.';

CREATE FUNCTION "refresh_product_facet_eligible_product"("target_product_id" UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  DELETE FROM public.product_facet_eligible_products AS projection
  WHERE projection.product_id = target_product_id;

  INSERT INTO public.product_facet_eligible_products (igrp, tag, product_id)
  SELECT category.igrp, candidate.tag, product.id
  FROM public.products AS product
  INNER JOIN public.source_categories AS category
    ON category.id = product.source_category_id
  INNER JOIN public.current_prices AS current_price
    ON current_price.product_id = product.id
  CROSS JOIN (
    VALUES
      ('capacity_bucket:128'::text),
      ('capacity_bucket:240-256'::text),
      ('capacity_bucket:480-512'::text),
      ('capacity_bucket:about-1tb'::text),
      ('capacity_bucket:about-2tb'::text),
      ('capacity_bucket:4000'::text),
      ('capacity_bucket:8000'::text)
  ) AS candidate(tag)
  WHERE product.id = target_product_id
    AND category.igrp = 7
    AND category.enabled = TRUE
    AND product.is_active = TRUE
    AND product.is_excluded = FALSE
    AND product.filter_tags @> ARRAY[candidate.tag]::text[]
  ON CONFLICT DO NOTHING;
$function$;

CREATE FUNCTION "refresh_product_facet_eligible_category"("target_category_id" UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  DELETE FROM public.product_facet_eligible_products AS projection
  USING public.products AS product
  WHERE projection.product_id = product.id
    AND product.source_category_id = target_category_id;

  INSERT INTO public.product_facet_eligible_products (igrp, tag, product_id)
  SELECT category.igrp, candidate.tag, product.id
  FROM public.products AS product
  INNER JOIN public.source_categories AS category
    ON category.id = product.source_category_id
  INNER JOIN public.current_prices AS current_price
    ON current_price.product_id = product.id
  CROSS JOIN (
    VALUES
      ('capacity_bucket:128'::text),
      ('capacity_bucket:240-256'::text),
      ('capacity_bucket:480-512'::text),
      ('capacity_bucket:about-1tb'::text),
      ('capacity_bucket:about-2tb'::text),
      ('capacity_bucket:4000'::text),
      ('capacity_bucket:8000'::text)
  ) AS candidate(tag)
  WHERE product.source_category_id = target_category_id
    AND category.igrp = 7
    AND category.enabled = TRUE
    AND product.is_active = TRUE
    AND product.is_excluded = FALSE
    AND product.filter_tags @> ARRAY[candidate.tag]::text[]
  ON CONFLICT DO NOTHING;
$function$;

CREATE FUNCTION "sync_product_facet_eligible_product"()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.refresh_product_facet_eligible_product(NEW.id);
  RETURN NULL;
END;
$function$;

CREATE FUNCTION "sync_current_price_facet_eligibility"()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_product_facet_eligible_product(OLD.product_id);
  ELSE
    IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
      PERFORM public.refresh_product_facet_eligible_product(OLD.product_id);
    END IF;
    PERFORM public.refresh_product_facet_eligible_product(NEW.product_id);
  END IF;

  RETURN NULL;
END;
$function$;

CREATE FUNCTION "sync_product_facet_eligible_category"()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.refresh_product_facet_eligible_category(NEW.id);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER "products_sync_facet_eligibility"
AFTER INSERT OR UPDATE OF "source_category_id", "filter_tags", "is_active", "is_excluded"
ON "products"
FOR EACH ROW
EXECUTE FUNCTION "sync_product_facet_eligible_product"();

CREATE TRIGGER "current_prices_sync_facet_eligibility"
AFTER INSERT OR DELETE OR UPDATE OF "product_id"
ON "current_prices"
FOR EACH ROW
EXECUTE FUNCTION "sync_current_price_facet_eligibility"();

CREATE TRIGGER "source_categories_sync_facet_eligibility"
AFTER UPDATE OF "igrp", "enabled"
ON "source_categories"
FOR EACH ROW
WHEN (
  OLD."igrp" IS DISTINCT FROM NEW."igrp"
  OR OLD."enabled" IS DISTINCT FROM NEW."enabled"
)
EXECUTE FUNCTION "sync_product_facet_eligible_category"();

SELECT "refresh_product_facet_eligible_category"("id")
FROM "source_categories"
WHERE "igrp" = 7;

REVOKE ALL ON FUNCTION "refresh_product_facet_eligible_product"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "refresh_product_facet_eligible_category"(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION "sync_product_facet_eligible_product"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "sync_current_price_facet_eligibility"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "sync_product_facet_eligible_category"() FROM PUBLIC;
