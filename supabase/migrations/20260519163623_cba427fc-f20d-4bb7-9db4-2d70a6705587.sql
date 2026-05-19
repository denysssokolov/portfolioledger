ALTER TABLE public.snapshots ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;
ALTER TABLE public.snapshots ALTER COLUMN amount_now SET DEFAULT 0;