-- ============================================================================
-- Discovered during manual QA: the column-pinning trigger blocked the
-- post-submit storage rename from persisting canonical paths, because
-- inbound-request.ts performs the rename + UPDATE outside any RPC context
-- (so the `app.inbound_rpc=true` flag bypass does not apply).
--
-- Storage RLS still enforces that the owner can only reference paths under
-- their own user_id/ folder, so allowing storage-path updates by the owner
-- while status='open' is safe and matches spec intent.
-- ============================================================================

create or replace function public.inbound_requests_pin_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return NEW; end if;
  if coalesce(current_setting('app.inbound_rpc', true), '') = 'true' then
    return NEW;
  end if;

  -- Identity / lifecycle pins (always)
  NEW.user_id := OLD.user_id;
  NEW.status := OLD.status;
  NEW.last_comment_at := OLD.last_comment_at;
  NEW.last_comment_by_role := OLD.last_comment_by_role;
  NEW.user_last_read_at := OLD.user_last_read_at;
  NEW.admin_last_read_at := OLD.admin_last_read_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.created_at := OLD.created_at;

  -- excel_storage_path / excel_original_name / image_paths: allowed while
  -- the row is still 'open' (so the action layer can rename _pending_ paths
  -- to canonical paths). Storage RLS bounds the writable path to the owner's
  -- own folder, so this can't be used to point at someone else's file.
  if OLD.status <> 'open' then
    NEW.excel_storage_path := OLD.excel_storage_path;
    NEW.excel_original_name := OLD.excel_original_name;
    NEW.image_paths := OLD.image_paths;
  end if;

  return NEW;
end; $$;
