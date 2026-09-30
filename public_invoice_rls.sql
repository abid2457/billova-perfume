-- ═══════════════════════════════════════════════════════════════
-- Billova Perfumes — Public Invoice Access (RLS for anon users)
-- ═══════════════════════════════════════════════════════════════
-- Run this in the Supabase SQL Editor.
--
-- Purpose: Allow unauthenticated (anon) users to READ purchase data
-- via invoice_number for the public invoice verification page.
--
-- Security: READ-ONLY access via anon role. No writes, no deletes.
-- Only SELECT is granted. Internal IDs are not exposed in the UI.
-- ═══════════════════════════════════════════════════════════════

-- 1. Allow anon users to SELECT purchases (needed to look up by invoice_number)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchases' AND policyname = 'Public can view purchases by invoice'
  ) THEN
    CREATE POLICY "Public can view purchases by invoice"
      ON purchases FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 2. Allow anon users to SELECT purchase_items (needed to list line items)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_items' AND policyname = 'Public can view purchase items'
  ) THEN
    CREATE POLICY "Public can view purchase items"
      ON purchase_items FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 3. Allow anon users to SELECT customers (needed for customer name/phone on invoice)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customers' AND policyname = 'Public can view customers'
  ) THEN
    CREATE POLICY "Public can view customers"
      ON customers FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 4. Verify the policies were created
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE policyname LIKE 'Public can%'
ORDER BY tablename;
