-- ═══════════════════════════════════════════════════════════════
-- PASSCODE FIX — Run this in Supabase SQL Editor
-- Root cause: SECURITY DEFINER function had search_path = public
-- which blocked access to pgcrypto (installed in 'extensions' schema).
-- ═══════════════════════════════════════════════════════════════

-- 1. Recreate the function with the correct search_path
CREATE OR REPLACE FUNCTION verify_admin_passcode(input_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- 2. Re-insert the passcode hash (in case the first INSERT also failed)
--    This uses the now-correct extensions.crypt via search_path
INSERT INTO settings (setting_key, setting_value)
VALUES ('admin_edit_passcode', crypt('5121', gen_salt('bf')))
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = crypt('5121', gen_salt('bf')),
  updated_at = now();

-- 3. Quick sanity-check — should return TRUE
SELECT verify_admin_passcode('5121') AS should_be_true;
