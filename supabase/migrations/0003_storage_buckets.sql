-- 0003_storage_buckets.sql
-- Storage buckets for site screenshots and call audio.
-- Both are private; only service-role reads/writes. Public dashboard fetches via signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('screenshots', 'screenshots', false, 5242880,  array['image/png','image/jpeg','image/webp']),
  ('call_audio',  'call_audio',  false, 52428800, array['audio/mpeg','audio/mp4','audio/wav','audio/ogg'])
on conflict (id) do nothing;

-- Lock down bucket access. Service-role bypasses RLS so no policies for normal roles.
-- (Default storage.objects RLS already denies everything without a matching policy.)
