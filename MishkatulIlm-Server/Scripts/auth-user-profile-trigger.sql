-- Run in Supabase SQL Editor if EF migrations cannot create auth triggers.
-- Creates public.users rows when Supabase Auth inserts into auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb;
  fn text;
  ln text;
  onboarding_done boolean;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  fn := COALESCE(
    NULLIF(trim(meta ->> 'first_name'), ''),
    NULLIF(trim(meta ->> 'firstName'), ''),
    '');
  ln := COALESCE(
    NULLIF(trim(meta ->> 'last_name'), ''),
    NULLIF(trim(meta ->> 'lastName'), ''),
    '');
  onboarding_done := COALESCE((meta ->> 'onboarding_completed')::boolean, false);

  INSERT INTO public.users (
    "Id",
    "Email",
    "FirstName",
    "LastName",
    "CreatedAtUtc",
    "OnboardingCompleted",
    "IsAdmin"
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.email), ''), NEW.id::text || '@auth.local'),
    fn,
    ln,
    COALESCE(NEW.created_at, now()),
    onboarding_done,
    false
  )
  ON CONFLICT ("Id") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
