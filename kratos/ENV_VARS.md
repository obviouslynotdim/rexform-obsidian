# Environment Variables

## Next.js (rexform-notes service)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_KRATOS_PUBLIC_URL` | Kratos public API URL (browser-visible) | `https://rexform-kratos.up.railway.app` |
| `KRATOS_ADMIN_URL` | Kratos admin API URL (internal Railway network) | `http://kratos.railway.internal:4434` |
| `NEXTAUTH_URL` | Full URL of the Next.js app | `https://rexform-notes-production.up.railway.app` |
| `NEXTAUTH_SECRET` | Random 32-byte secret for JWT signing | see generation command below |

## Kratos (rexform-kratos service)

| Variable | Description | Example |
|---|---|---|
| `DSN` | Database connection string (Postgres recommended) | `postgres://user:pass@host:5432/kratos` |
| `KRATOS_PUBLIC_URL` | Publicly accessible Kratos URL | `https://rexform-kratos.up.railway.app` |
| `KRATOS_ADMIN_URL` | Internal admin URL | `http://kratos.railway.internal:4434` |
| `FRONTEND_URL` | Next.js app URL for CORS + redirects | `https://rexform-notes-production.up.railway.app` |
| `SMTP_CONNECTION_URI` | SMTP for email verification/recovery | `smtps://user:pass@smtp.example.com:465` |
| `SMTP_FROM_ADDRESS` | Sender address for Kratos emails | `noreply@rexform.io` |

## Secret generation (PowerShell)

```powershell
# NEXTAUTH_SECRET
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))

# KRATOS DSN — provision a Postgres service in Railway, copy the DATABASE_URL
```
