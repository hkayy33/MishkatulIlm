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
