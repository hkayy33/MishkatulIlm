using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFlutterwavePaymentFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE users ADD COLUMN IF NOT EXISTS "FlutterwaveCustomerId" character varying(64);
                ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS "FlutterwaveCheckoutSessionId" character varying(64);
                ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS "FlutterwaveTransactionId" character varying(64);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FlutterwaveCustomerId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "FlutterwaveCheckoutSessionId",
                table: "payment_submissions");

            migrationBuilder.DropColumn(
                name: "FlutterwaveTransactionId",
                table: "payment_submissions");
        }
    }
}
