ALTER TABLE user_connections ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;
ALTER TABLE user_connections ADD COLUMN IF NOT EXISTS github_connected_at TIMESTAMPTZ;
