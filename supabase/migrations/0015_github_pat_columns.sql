-- Add GitHub PAT storage columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS github_username TEXT,
  ADD COLUMN IF NOT EXISTS github_pat TEXT;
