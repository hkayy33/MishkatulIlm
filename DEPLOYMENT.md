# Deploy Al Usooliyyah Academy (Vercel + Fly.io)

| Component | Platform | URL example |
|-----------|----------|-------------|
| Angular app | **Vercel** | `https://your-app.vercel.app` |
| .NET API | **Fly.io** | `https://mishkatulilm-api.fly.dev` |
| Database & auth | **Supabase** | Postgres + Auth |

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Database** → Settings → Connection string (URI). Use this for `ConnectionStrings__DefaultConnection` on Fly (include password; `SSL Mode=Require`).
3. **Settings → API** → copy **Project URL** and **anon public** key (Vercel) and **service_role** key (Fly only).
4. **Authentication → URL configuration**:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**:  
     `https://your-app.vercel.app/auth/callback`  
     `http://localhost:4200/auth/callback` (local dev)

5. **Authentication → Email Templates → Confirm signup**:

   ```html
   <h2>Confirm your signup</h2>
   <p>Click the link below in the <strong>same browser</strong> you used to register:</p>
   <p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
   <p>If the link does not sign you in automatically, return to the site and log in with your password.</p>
   ```

   - **Confirmation link** — auto sign-in in the same browser (PKCE). Opening from a mail app may confirm the email but not start a session; log in with your password instead.

6. **Production checklist**
   - [ ] Fly `ConnectionStrings__DefaultConnection` → `db.kpvfrbgpbmlxkqqibpjp.supabase.co` (same project as auth)
   - [ ] Fly `Supabase__Url` → `https://kpvfrbgpbmlxkqqibpjp.supabase.co` (no `/rest/v1`)
   - [ ] Fly `Cors__AllowedOrigins__0` → `https://al-usooliyyah.vercel.app`
   - [ ] Vercel `API_BASE_URL` → `https://mishkatulilm-api.fly.dev`
   - [ ] Vercel `SUPABASE_URL` + `SUPABASE_ANON_KEY` for project `kpvfrbgpbmlxkqqibpjp`
   - [ ] Vercel `AUTH_REDIRECT_ORIGIN` → `https://al-usooliyyah.vercel.app`
   - [ ] Email template uses `{{ .ConfirmationURL }}` (not a custom `token_hash` link)
   - [ ] Test: register in browser → open email link **in that same browser** → lands on `/onboarding`

Run migrations once (from your machine with connection string set):

```bash
cd MishkatulIlm-Server
dotnet ef database update
```

Or rely on Fly starting the app (migrations run on startup when `DefaultConnection` is set).

---

## 2. Fly.io (API)

### Prerequisites

- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and logged in (`fly auth login`)

### First deploy

```bash
cd MishkatulIlm-Server
fly launch
# Choose app name (or keep mishkatulilm-api), region, do not add Postgres (use Supabase)
fly deploy
```

### Secrets

Set production secrets (see `.env.example`). Use the **project root** for `Supabase__Url` (e.g. `https://xxxx.supabase.co`) — not the REST API URL (`/rest/v1`).

```bash
fly secrets set \
  ConnectionStrings__DefaultConnection="Host=db....supabase.co;Database=postgres;Username=postgres;Password=...;SSL Mode=Require;Trust Server Certificate=true" \
  Supabase__Url="https://YOUR_PROJECT.supabase.co" \
  Supabase__ServiceRoleKey="YOUR_SERVICE_ROLE_KEY" \
  Admin__PromotedAdminEmails="admin@example.com" \
  Stripe__SecretKey="sk_live_..." \
  Stripe__WebhookSecret="whsec_..." \
  Stripe__ProductId="prod_..." \
  Stripe__ClientAppUrl="https://your-app.vercel.app" \
  Cors__AllowedOrigins__0="https://your-app.vercel.app"
```

For Vercel preview deployments, add preview origins:

```bash
fly secrets set Cors__AllowedOrigins__1="https://your-app-*.vercel.app"
```

Note: Fly may not support wildcards in CORS; add specific preview URLs or use a single production origin.

Check health:

```bash
curl https://YOUR_APP.fly.dev/health
curl https://YOUR_APP.fly.dev/health/db
```

### Stripe webhook

In Stripe Dashboard → Webhooks, endpoint:

`https://YOUR_APP.fly.dev/api/webhooks/stripe`

Use the signing secret as `Stripe__WebhookSecret`.

---

## 3. Vercel (Angular)

### Project settings

- **Root Directory**: `MishkatulIlm-Client`
- **Framework Preset**: Other (or leave default; `vercel.json` defines the build)
- **Build Command**: `npm run vercel-build` (from `vercel.json`)
- **Output Directory**: `dist/MishkatulIlm-Client/browser`

### Environment variables (Production)

| Variable | Example |
|----------|---------|
| `API_BASE_URL` | `https://mishkatulilm-api.fly.dev` |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_ANON_KEY` | anon key from Supabase |

Redeploy after changing env vars (they are baked in at build time).

### Local production build test

```bash
cd MishkatulIlm-Client
export API_BASE_URL=https://mishkatulilm-api.fly.dev
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_ANON_KEY=your_anon_key
npm run build:deploy
npx serve dist/MishkatulIlm-Client/browser
```

---

## 4. Local development

**API** (user secrets recommended):

```bash
cd MishkatulIlm-Server
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=..."
dotnet user-secrets set "Supabase:ServiceRoleKey" "..."
dotnet run
```

**Client**:

```bash
cd MishkatulIlm-Client
npm install
# Fill src/environments/environment.development.local.ts (created by postinstall)
npm start
```

---

## 5. Checklist before go-live

- [ ] Supabase redirect URLs include production Vercel URL
- [ ] Fly secrets set; `DevBootstrap:Enabled` is false in Production
- [ ] Vercel env vars set; app loads and calls Fly API (network tab)
- [ ] CORS on Fly includes your Vercel domain
- [ ] Stripe `ClientAppUrl` and webhook point to Vercel / Fly
- [ ] Admin email in `Admin__PromotedAdminEmails` for first admin user
