-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — Row Level Security (RLS) Verification & Setup
-- Run this in the Supabase SQL Editor to verify/enable RLS.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Enable RLS on all tables (idempotent — safe to re-run)
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_items ENABLE ROW LEVEL SECURITY;

-- Step 2: Create policies (only if they don't already exist)

-- CUSTOMERS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Authenticated users can view customers') THEN
    CREATE POLICY "Authenticated users can view customers" ON customers FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Authenticated users can insert customers') THEN
    CREATE POLICY "Authenticated users can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Authenticated users can update customers') THEN
    CREATE POLICY "Authenticated users can update customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Authenticated users can delete customers') THEN
    CREATE POLICY "Authenticated users can delete customers" ON customers FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- PRODUCTS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Authenticated users can view products') THEN
    CREATE POLICY "Authenticated users can view products" ON products FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Authenticated users can insert products') THEN
    CREATE POLICY "Authenticated users can insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Authenticated users can update products') THEN
    CREATE POLICY "Authenticated users can update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Authenticated users can delete products') THEN
    CREATE POLICY "Authenticated users can delete products" ON products FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- CATEGORIES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can view categories') THEN
    CREATE POLICY "Authenticated users can view categories" ON categories FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can insert categories') THEN
    CREATE POLICY "Authenticated users can insert categories" ON categories FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can update categories') THEN
    CREATE POLICY "Authenticated users can update categories" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can delete categories') THEN
    CREATE POLICY "Authenticated users can delete categories" ON categories FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- PURCHASES
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Authenticated users can view purchases') THEN
    CREATE POLICY "Authenticated users can view purchases" ON purchases FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Authenticated users can insert purchases') THEN
    CREATE POLICY "Authenticated users can insert purchases" ON purchases FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Authenticated users can update purchases') THEN
    CREATE POLICY "Authenticated users can update purchases" ON purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'Authenticated users can delete purchases') THEN
    CREATE POLICY "Authenticated users can delete purchases" ON purchases FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- PURCHASE_ITEMS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'Authenticated users can view purchase_items') THEN
    CREATE POLICY "Authenticated users can view purchase_items" ON purchase_items FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'Authenticated users can insert purchase_items') THEN
    CREATE POLICY "Authenticated users can insert purchase_items" ON purchase_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'Authenticated users can update purchase_items') THEN
    CREATE POLICY "Authenticated users can update purchase_items" ON purchase_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_items' AND policyname = 'Authenticated users can delete purchase_items') THEN
    CREATE POLICY "Authenticated users can delete purchase_items" ON purchase_items FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Step 3: Verify RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'products', 'categories', 'purchases', 'purchase_items')
ORDER BY tablename;

-- Step 4: List all policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers', 'products', 'categories', 'purchases', 'purchase_items')
ORDER BY tablename, cmd;
