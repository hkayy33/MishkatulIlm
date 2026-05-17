using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAuthUserCreatedTrigger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
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
                  onboarding_done := COALESCE(
                    (meta ->> 'onboarding_completed')::boolean,
                    false);

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

                INSERT INTO public.users (
                  "Id",
                  "Email",
                  "FirstName",
                  "LastName",
                  "CreatedAtUtc",
                  "OnboardingCompleted",
                  "IsAdmin"
                )
                SELECT
                  u.id,
                  COALESCE(NULLIF(trim(u.email), ''), u.id::text || '@auth.local'),
                  COALESCE(
                    NULLIF(trim(u.raw_user_meta_data ->> 'first_name'), ''),
                    NULLIF(trim(u.raw_user_meta_data ->> 'firstName'), ''),
                    ''),
                  COALESCE(
                    NULLIF(trim(u.raw_user_meta_data ->> 'last_name'), ''),
                    NULLIF(trim(u.raw_user_meta_data ->> 'lastName'), ''),
                    ''),
                  COALESCE(u.created_at, now()),
                  COALESCE((u.raw_user_meta_data ->> 'onboarding_completed')::boolean, false),
                  false
                FROM auth.users u
                WHERE NOT EXISTS (
                  SELECT 1 FROM public.users p WHERE p."Id" = u.id)
                  AND NOT EXISTS (
                    SELECT 1
                    FROM public.users p2
                    WHERE lower(p2."Email") = lower(
                      COALESCE(NULLIF(trim(u.email), ''), u.id::text || '@auth.local')));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
                DROP FUNCTION IF EXISTS public.handle_new_auth_user();
                """);
        }
    }
}
