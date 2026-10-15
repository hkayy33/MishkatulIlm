using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MishkatulIlm_Server.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261014000000_AddStripeStatementPaymentFields")]
public sealed class AddStripeStatementPaymentFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // StripeCheckoutSessionId is added in 20261007174549_AddStripeCheckoutSessionId.
        migrationBuilder.Sql(
            """
            ALTER TABLE payment_submissions
            ADD COLUMN IF NOT EXISTS "StripePaymentIntentId" character varying(255);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "StripePaymentIntentId", table: "payment_submissions");
    }
}
