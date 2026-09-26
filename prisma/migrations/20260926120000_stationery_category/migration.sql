-- =============================================================================
--  Pros-Link — "Office Supplies" becomes "Stationery & Papers"
--
--  Data only. The seed never overwrites a category staff may have edited, so
--  the new name reaches an existing database here. Only values still exactly
--  as seeded are changed: a name or description set in Admin → Categories is
--  left alone. The slug stays `office-supplies`, so products, leads and the
--  assistant's menu keep pointing at the same category.
-- =============================================================================

UPDATE "product_categories"
SET "name" = 'Stationery & Papers', "updatedAt" = CURRENT_TIMESTAMP
WHERE "department" = 'PROSLINK' AND "slug" = 'office-supplies' AND "name" = 'Office Supplies';

UPDATE "product_categories"
SET "description" = 'Stationery, paper and day-to-day office supplies.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "department" = 'PROSLINK' AND "slug" = 'office-supplies' AND "description" = 'Paper and day-to-day office supplies.';
