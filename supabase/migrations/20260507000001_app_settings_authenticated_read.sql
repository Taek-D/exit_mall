-- Tighten app_settings read policy: was `using (true)` which allowed anon role to
-- read bank account info via the public anon key. Restrict to authenticated role.
-- Admin write policy (`app_settings_admin_write`) is unchanged and still grants
-- admins full access (FOR ALL covers SELECT for admin role too).

drop policy if exists app_settings_read on public.app_settings;

create policy app_settings_read on public.app_settings
  for select
  to authenticated
  using (true);
