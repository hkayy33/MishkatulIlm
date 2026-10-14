using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MishkatulIlm_Server.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261014000000_AddStripeStatementPaymentFields")]
public sealed class AddStripeStatementPaymentFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "StripeCheckoutSessionId",
            table: "payment_submissions",
            type: "character varying(255)",
            maxLength: 255,
            nullable: true);
        migrationBuilder.AddColumn<string>(
            name: "StripePaymentIntentId",
            table: "payment_submissions",
            type: "character varying(255)",
            maxLength: 255,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "StripeCheckoutSessionId", table: "payment_submissions");
        migrationBuilder.DropColumn(name: "StripePaymentIntentId", table: "payment_submissions");
    }
}
