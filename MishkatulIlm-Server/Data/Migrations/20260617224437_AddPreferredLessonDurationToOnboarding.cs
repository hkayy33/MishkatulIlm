using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPreferredLessonDurationToOnboarding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PreferredLessonDuration",
                table: "student_onboarding_profiles",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PreferredLessonDuration",
                table: "student_onboarding_profiles");
        }
    }
}
