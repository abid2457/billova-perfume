-- =============================================
-- Categories Table Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Create the categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can manage categories"
  ON categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Seed existing categories from products table (optional - keeps existing data)
INSERT INTO categories (category_name)
SELECT DISTINCT category
FROM products
WHERE category IS NOT NULL AND category != ''
ON CONFLICT (category_name) DO NOTHING;
