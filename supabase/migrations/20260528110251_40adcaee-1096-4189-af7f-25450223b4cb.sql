ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'full';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_access_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_access_mode_check CHECK (access_mode IN ('demo','full'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
BEGIN
  v_mode := COALESCE(NEW.raw_user_meta_data->>'access_mode', 'full');
  IF v_mode NOT IN ('demo','full') THEN
    v_mode := 'full';
  END IF;

  INSERT INTO public.profiles (user_id, access_mode)
  VALUES (NEW.id, v_mode)
  ON CONFLICT (user_id) DO UPDATE SET access_mode = EXCLUDED.access_mode;

  RETURN NEW;
END;
$function$;