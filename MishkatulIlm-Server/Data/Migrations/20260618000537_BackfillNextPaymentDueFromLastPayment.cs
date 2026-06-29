using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class BackfillNextPaymentDueFromLastPayment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                UPDATE users
                SET "NextPaymentDueUtc" = ("LastPaymentAtUtc" AT TIME ZONE 'UTC')::date + INTERVAL '1 month'
                WHERE "LastPaymentAtUtc" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data-only correction; no schema rollback.
        }
    }
}
