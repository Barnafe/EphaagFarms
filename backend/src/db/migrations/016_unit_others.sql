-- 016: "Others" as a unit for declared and listed produce. Safe to run on every boot.
ALTER TABLE farmer_products DROP CONSTRAINT IF EXISTS farmer_products_unit_check;
ALTER TABLE farmer_products ADD CONSTRAINT farmer_products_unit_check
  CHECK (unit IN ('kg','tons','bags','tubers','crates','baskets','others'));
ALTER TABLE farmer_declarations DROP CONSTRAINT IF EXISTS farmer_declarations_unit_check;
ALTER TABLE farmer_declarations ADD CONSTRAINT farmer_declarations_unit_check
  CHECK (unit IN ('kg','tons','bags','tubers','crates','baskets','others'));
