# Al Usooliyyah Academy

Islamic learning platform — Angular client and ASP.NET Core API.

## Deploy (Vercel + Fly.io)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full steps:

- **Vercel** — `MishkatulIlm-Client` (static Angular app)
- **Fly.io** — `MishkatulIlm-Server` (API + EF migrations)
- **Supabase** — Postgres, Auth, JWKS

Copy [.env.example](./.env.example) for required environment variables.

## Local development

```bash
# API
cd MishkatulIlm-Server && dotnet user-secrets init && dotnet run

# Client (separate terminal)
cd MishkatulIlm-Client && npm install && npm start
```

Use `dotnet user-secrets` and `environment.development.local.ts` for keys (see DEPLOYMENT.md).

## Lesson blocks and automatic rollover

Students are booked in **4-week blocks** at the same weekly times. When a block ends:

1. The student sees **no upcoming lessons** until the next block is booked.
2. During the **5-day payment window** before the due date, they can open **Payments** and submit their bank transfer.
3. The statement covers the **full next 4-week block** (not just lessons in one calendar month).
4. An admin approves the payment in **Manage payments**.
5. The API books the next block automatically (also retried on portal load and hourly in the background).

If the usual time slot is no longer free, the student sees a **lesson booking issue** message and should request a schedule change. Admins see rollover outcome text when approving a payment.

### Local rollover demo (development only)

Reset a demo student with a completed block and open payment window:

```bash
curl -X POST http://localhost:5198/api/dev/rollover-demo/setup
```

| Role    | Email                           | Password       |
|---------|----------------------------------|----------------|
| Student | `rollover.demo@local.test`       | `DemoPass123!` |
| Admin   | `admin.rollover.demo@local.test` | `DemoPass123!` |

Requires `DevBootstrap:Enabled` (default in Development) and `Supabase:ServiceRoleKey` in user secrets.

## Tests

```bash
cd MishkatulIlm-Server.Tests && dotnet test
cd MishkatulIlm-Client && npm test
```
