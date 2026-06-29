using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLessonDurationPaymentRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PaymentRate45MinUsd",
                table: "scheduling_settings",
                type: "numeric(8,2)",
                precision: 8,
                scale: 2,
                nullable: false,
                defaultValue: 5m);

            migrationBuilder.AddColumn<decimal>(
                name: "PaymentRate60MinUsd",
                table: "scheduling_settings",
                type: "numeric(8,2)",
                precision: 8,
                scale: 2,
                nullable: false,
                defaultValue: 7m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaymentRate45MinUsd",
                table: "scheduling_settings");

            migrationBuilder.DropColumn(
                name: "PaymentRate60MinUsd",
                table: "scheduling_settings");
        }
    }
}
