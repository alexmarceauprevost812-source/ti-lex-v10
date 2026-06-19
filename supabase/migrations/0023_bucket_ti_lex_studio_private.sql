-- 0023: Make ti-lex-studio bucket private + tighten read policy
-- No frontend code uses this bucket — safe to apply standalone.

UPDATE storage.buckets SET public = false WHERE id = 'ti-lex-studio';

DROP POLICY IF EXISTS "ti_lex_studio_read" ON storage.objects;

CREATE POLICY "ti_lex_studio_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ti-lex-studio'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
