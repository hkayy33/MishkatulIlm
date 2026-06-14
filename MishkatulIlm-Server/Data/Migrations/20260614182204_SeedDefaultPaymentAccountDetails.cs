using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class SeedDefaultPaymentAccountDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE scheduling_settings
                SET "PaymentAccountName" = 'TestTest',
                    "PaymentAccountNumber" = '000000000',
                    "PaymentSortCode" = '00-00-00',
                    "UpdatedAtUtc" = NOW() AT TIME ZONE 'UTC'
                WHERE "Id" = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE scheduling_settings
                SET "PaymentAccountName" = '',
                    "PaymentAccountNumber" = '',
                    "PaymentSortCode" = '',
                    "UpdatedAtUtc" = NOW() AT TIME ZONE 'UTC'
                WHERE "Id" = 1
                  AND "PaymentAccountName" = 'TestTest'
                  AND "PaymentAccountNumber" = '000000000'
                  AND "PaymentSortCode" = '00-00-00';
                """);
        }
    }
}
