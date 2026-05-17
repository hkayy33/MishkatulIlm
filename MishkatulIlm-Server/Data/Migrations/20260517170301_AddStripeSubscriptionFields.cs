using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MishkatulIlm_Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeSubscriptionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LastStripeInvoiceId",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeCustomerId",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "StripeSubscriptionCancelAtPeriodEnd",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "StripeSubscriptionId",
                table: "users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StripeSubscriptionPeriodEndUtc",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeSubscriptionStatus",
                table: "users",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastStripeInvoiceId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StripeCustomerId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StripeSubscriptionCancelAtPeriodEnd",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StripeSubscriptionId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StripeSubscriptionPeriodEndUtc",
                table: "users");

            migrationBuilder.DropColumn(
                name: "StripeSubscriptionStatus",
                table: "users");
        }
    }
}
