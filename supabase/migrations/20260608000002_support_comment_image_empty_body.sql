-- Allow admin-authored support comments to have an empty body.
-- The application/RPC only uses this for comments that have one image attached.

alter table public.support_request_comments
  drop constraint if exists support_request_comments_body_check;

alter table public.support_request_comments
  add constraint support_request_comments_body_check
  check (
    length(body) between 1 and 2000
    or (author_role = 'admin' and length(body) = 0)
  );
