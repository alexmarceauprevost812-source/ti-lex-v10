-- 0021: Revoke anon execution on SECURITY DEFINER functions that modify data.
-- All are called exclusively via Edge Functions with service_role key.
-- service_role bypasses these grants, so no breakage.

REVOKE EXECUTE ON FUNCTION public.sync_stripe_to_plan()
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.track_message_usage(uuid, integer, integer, text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_message(uuid, text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.append_audit_log(uuid, uuid, uuid, text, jsonb)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.verify_scan_authorization(uuid, text, text)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.check_quota(uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.check_user_quota(uuid)
  FROM anon;
