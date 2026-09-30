-- =============================================
-- Client Handover: Clean Test/Demo Data
-- Run this in Supabase SQL Editor
-- =============================================
-- This script removes all transactional test data
-- while preserving master data (products, categories,
-- auth users, schema, policies, functions).
-- =============================================

-- Step 1: Delete purchase items first (child records)
DELETE FROM purchase_items;

-- Step 2: Delete purchases (references customers)
DELETE FROM purchases;

-- Step 3: Delete test customers
DELETE FROM customers;

-- Verify cleanup
SELECT 'purchase_items' AS table_name, COUNT(*) AS remaining FROM purchase_items
UNION ALL
SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'categories', COUNT(*) FROM categories;
