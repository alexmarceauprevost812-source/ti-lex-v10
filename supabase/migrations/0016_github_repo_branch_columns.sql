-- Add columns to store selected GitHub repo and branch per user
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS github_repo         TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS github_branch       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS github_repo_owner   TEXT DEFAULT NULL;
