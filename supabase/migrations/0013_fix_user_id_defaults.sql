-- Fix: user_id columns need DEFAULT auth.uid() so PostgREST INSERTs
-- work without explicitly passing user_id in the body.
-- The RLS policies already require auth.uid() = user_id.

ALTER TABLE conversations ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE conversations ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE messages ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE messages ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE projects ALTER COLUMN user_id SET DEFAULT auth.uid();
-- projects already had NOT NULL from 0012
