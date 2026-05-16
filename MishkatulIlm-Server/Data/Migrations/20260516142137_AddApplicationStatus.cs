using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApplicationStatus",
                table: "users",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "PENDING");

            migrationBuilder.Sql(
                """
                UPDATE public.users
                SET "ApplicationStatus" = 'PENDING'
                WHERE "ApplicationStatus" = '' OR "ApplicationStatus" IS NULL;

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
                    "ApplicationStatus",
                    "IsAdmin"
                  )
                  VALUES (
                    NEW.id,
                    COALESCE(NULLIF(trim(NEW.email), ''), NEW.id::text || '@auth.local'),
                    fn,
                    ln,
                    COALESCE(NEW.created_at, now()),
                    onboarding_done,
                    'PENDING',
                    false
                  )
                  ON CONFLICT ("Id") DO NOTHING;

                  RETURN NEW;
                END;
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApplicationStatus",
                table: "users");
        }
    }
}
