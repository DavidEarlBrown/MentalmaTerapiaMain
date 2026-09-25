/*
  # Link David Jones professional profile to browndavide80 user

  Sets professionals.user_id for David Jones to the public.users row whose
  username or email matches browndavide80. Idempotent: safe to re-run.
*/

UPDATE public.professionals p
SET user_id = u.id
FROM public.users u
WHERE p.name_en ILIKE '%David Jones%'
  AND (
    lower(u.username) = 'browndavide80'
    OR lower(u.email) LIKE '%browndavide80%'
  )
  AND (p.user_id IS DISTINCT FROM u.id);

-- Keep professional email in sync when missing
UPDATE public.professionals p
SET email = u.email
FROM public.users u
WHERE p.user_id = u.id
  AND p.name_en ILIKE '%David Jones%'
  AND (p.email IS NULL OR trim(p.email) = '');
