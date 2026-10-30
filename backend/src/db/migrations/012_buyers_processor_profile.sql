-- 012: one "Buyers/Processor" profile (owner request, v37)
-- ---------------------------------------------------------------------
-- The separate Processor profile is retired: processing is done by the single
-- "Buyers/Processor" profile (role_type 'buyer'). Any existing processor
-- account becomes a Buyers/Processor account, keeping its login and its
-- processing jobs (processor_jobs.processor_id still points at the same user).
-- Idempotent: safe to run on every boot. The 'processor' value stays in the
-- role CHECK only so old rows/history remain valid — no new ones can be made.
-- ---------------------------------------------------------------------
INSERT INTO buyer_profiles (user_id, buyer_type)
  SELECT u.id, 'individual' FROM users u
   WHERE u.role_type = 'processor'
     AND NOT EXISTS (SELECT 1 FROM buyer_profiles b WHERE b.user_id = u.id);
UPDATE users SET role_type = 'buyer' WHERE role_type = 'processor';
