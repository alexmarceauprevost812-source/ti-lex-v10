-- Generated pages: HTML pages created by agents, served via save-page edge function
CREATE TABLE IF NOT EXISTS public.generated_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  html_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_generated_pages_slug ON public.generated_pages(slug);
CREATE INDEX IF NOT EXISTS idx_generated_pages_user ON public.generated_pages(user_id);

ALTER TABLE public.generated_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pages"
  ON public.generated_pages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read by slug"
  ON public.generated_pages FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION increment_page_views(page_slug TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.generated_pages
  SET view_count = view_count + 1
  WHERE slug = page_slug;
$$;
