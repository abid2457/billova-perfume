-- =====================================================
-- Billova Perfumes Purchase History Tracker
-- Supabase Database Setup
-- =====================================================
-- Run this SQL in Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── CUSTOMERS TABLE ───
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);

-- ─── PRODUCTS TABLE ───
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ─── PURCHASES TABLE ───
CREATE TABLE IF NOT EXISTS purchases (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_customer ON purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);

-- ─── PURCHASE ITEMS TABLE ───
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);

-- ─── ROW LEVEL SECURITY ───
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- Customers
CREATE POLICY "Authenticated users can view customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customers" ON customers FOR DELETE TO authenticated USING (true);

-- Products
CREATE POLICY "Authenticated users can view products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products" ON products FOR DELETE TO authenticated USING (true);

-- Purchases
CREATE POLICY "Authenticated users can view purchases" ON purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchases" ON purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchases" ON purchases FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete purchases" ON purchases FOR DELETE TO authenticated USING (true);

-- Purchase Items
CREATE POLICY "Authenticated users can view purchase items" ON purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchase items" ON purchase_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchase items" ON purchase_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete purchase items" ON purchase_items FOR DELETE TO authenticated USING (true);

-- ─── REALTIME (safe — skips if already added) ───
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE customers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE products;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE purchase_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SAMPLE DATA ───
INSERT INTO customers (customer_name, phone_number) VALUES
  ('Aarav Sharma', '9876543210'),
  ('Priya Patel', '9123456780'),
  ('Rohan Mehta', '9988776655'),
  ('Ananya Iyer', '9001122334'),
  ('Vikram Singh', '9555666777'),
  ('Neha Gupta', '9333222111'),
  ('Karan Verma', '9876123456'),
  ('Sneha Reddy', '9090909090')
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO products (product_name, category, selling_price) VALUES
  ('Oud Royale 50ml', 'Oud', 2400),
  ('Rose Attar 12ml', 'Attar', 650),
  ('Bleu de Chanel Inspired 100ml', 'Inspired', 1850),
  ('Musk Al Tahara 6ml', 'Musk', 320),
  ('Jasmine Oil 12ml', 'Essential Oil', 540),
  ('Stronger With You Inspired 100ml', 'Inspired', 1950),
  ('Sandalwood Attar 12ml', 'Attar', 720),
  ('Amber Oud 50ml', 'Oud', 2100),
  ('Mukhallat Special 12ml', 'Mukhallat', 880),
  ('White Musk 6ml', 'Musk', 290),
  ('Oud Cambodi 12ml', 'Oud', 1450),
  ('Jannat ul Firdous 12ml', 'Attar', 480)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  c1_id UUID; c2_id UUID; c3_id UUID; p_id UUID;
BEGIN
  SELECT id INTO c1_id FROM customers WHERE phone_number = '9876543210';
  SELECT id INTO c2_id FROM customers WHERE phone_number = '9123456780';
  SELECT id INTO c3_id FROM customers WHERE phone_number = '9988776655';

  IF c1_id IS NOT NULL THEN
    INSERT INTO purchases (id, customer_id, purchase_date, total_amount, payment_method)
    VALUES (uuid_generate_v4(), c1_id, NOW(), 3700, 'Cash') RETURNING id INTO p_id;
    INSERT INTO purchase_items (purchase_id, product_name, quantity, unit_price, total) VALUES
      (p_id, 'Oud Royale 50ml', 1, 2400, 2400), (p_id, 'Rose Attar 12ml', 2, 650, 1300);

    INSERT INTO purchases (id, customer_id, purchase_date, total_amount, payment_method)
    VALUES (uuid_generate_v4(), c1_id, NOW() - INTERVAL '3 days', 1950, 'UPI') RETURNING id INTO p_id;
    INSERT INTO purchase_items (purchase_id, product_name, quantity, unit_price, total) VALUES
      (p_id, 'Stronger With You Inspired 100ml', 1, 1950, 1950);
  END IF;

  IF c2_id IS NOT NULL THEN
    INSERT INTO purchases (id, customer_id, purchase_date, total_amount, payment_method)
    VALUES (uuid_generate_v4(), c2_id, NOW(), 1850, 'Cash') RETURNING id INTO p_id;
    INSERT INTO purchase_items (purchase_id, product_name, quantity, unit_price, total) VALUES
      (p_id, 'Bleu de Chanel Inspired 100ml', 1, 1850, 1850);
  END IF;

  IF c3_id IS NOT NULL THEN
    INSERT INTO purchases (id, customer_id, purchase_date, total_amount, payment_method)
    VALUES (uuid_generate_v4(), c3_id, NOW() - INTERVAL '1 day', 1500, 'Card') RETURNING id INTO p_id;
    INSERT INTO purchase_items (purchase_id, product_name, quantity, unit_price, total) VALUES
      (p_id, 'Musk Al Tahara 6ml', 3, 320, 960), (p_id, 'Jasmine Oil 12ml', 1, 540, 540);
  END IF;
END $$;
