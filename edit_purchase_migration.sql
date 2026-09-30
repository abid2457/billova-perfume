-- ═══════════════════════════════════════════════════════════════
-- Edit Purchase Feature — Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. pgcrypto for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Settings table
CREATE TABLE IF NOT EXISTS settings (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key   text        UNIQUE NOT NULL,
  setting_value text        NOT NULL,
  updated_at    timestamptz DEFAULT now()
);

-- 3. Store hashed passcode 5121
INSERT INTO settings (setting_key, setting_value)
VALUES ('admin_edit_passcode', crypt('5121', gen_salt('bf')))
ON CONFLICT (setting_key)
DO UPDATE SET setting_value = crypt('5121', gen_salt('bf')), updated_at = now();

-- 4. Lock settings table — no direct reads from frontend
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_settings" ON settings;
CREATE POLICY "deny_settings" ON settings FOR ALL USING (false);

-- 5. Secure server-side verification function (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION verify_admin_passcode(input_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT setting_value INTO stored_hash
  FROM settings WHERE setting_key = 'admin_edit_passcode';
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN (crypt(input_passcode, stored_hash) = stored_hash);
END;
$$;

-- 6. Purchase edit audit log
CREATE TABLE IF NOT EXISTS purchase_edit_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id     uuid        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  edited_at       timestamptz DEFAULT now() NOT NULL,
  edited_by       text        NOT NULL DEFAULT 'admin',
  changes_summary text
);
CREATE INDEX IF NOT EXISTS idx_edit_logs_purchase ON purchase_edit_logs(purchase_id);
ALTER TABLE purchase_edit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_edit_logs" ON purchase_edit_logs;
CREATE POLICY "allow_edit_logs" ON purchase_edit_logs FOR ALL USING (true);

-- 7. Edit tracking columns on purchases
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS is_edited boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by text;
