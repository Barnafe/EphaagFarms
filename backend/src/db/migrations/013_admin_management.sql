-- 013: one MAIN admin who alone adds and removes other admins.
-- Registration can no longer create an admin. The seeded admin is the main
-- admin; it promotes existing accounts to admin (and removes them again).
-- Every other admin keeps every admin feature except adding/removing admins.
-- Safe to run on every boot.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_main_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- The role an account had before it was promoted, so removing the admin
-- gives them their old account back.
ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_role_type TEXT;

-- A database that already has admins and no main admin: the earliest-created
-- admin (the seeded one) becomes the main admin.
UPDATE users SET is_main_admin = TRUE
 WHERE id = (SELECT id FROM users WHERE role_type = 'admin' ORDER BY created_at ASC, id ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM users WHERE is_main_admin);

-- At most one main admin, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS users_single_main_admin ON users ((TRUE)) WHERE is_main_admin;
