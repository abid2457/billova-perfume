-- ═══════════════════════════════════════════════════════════════
-- PASSCODE UPDATE — Run this in Supabase SQL Editor
-- Sets the admin edit passcode to 9789 and ensures proper security
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure verify_admin_passcode function uses proper search_path
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

-- 2. Function to allow authenticated admins to update passcode
CREATE OR REPLACE FUNCTION update_admin_passcode(new_passcode text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO settings (setting_key, setting_value, updated_at)
  VALUES ('admin_edit_passcode', crypt(new_passcode, gen_salt('bf')), now())
  ON CONFLICT (setting_key)
  DO UPDATE SET
    setting_value = crypt(new_passcode, gen_salt('bf')),
    updated_at = now();

  RETURN TRUE;
END;
$$;

-- 3. Set the new passcode: 9789
INSERT INTO settings (setting_key, setting_value, updated_at)
VALUES ('admin_edit_passcode', crypt('9789', gen_salt('bf')), now())
ON CONFLICT (setting_key)
DO UPDATE SET
  setting_value = crypt('9789', gen_salt('bf')),
  updated_at = now();

-- 4. Verify that 9789 works (should return TRUE)
SELECT verify_admin_passcode('9789') AS passcode_9789_is_valid;
