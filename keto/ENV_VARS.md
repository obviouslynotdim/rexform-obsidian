# Keto Environment Variables

| Variable | Required | Description |
|---|---|---|
| `KETO_DATABASE_URL` | Yes | PostgreSQL DSN for Keto's relation store. Use the same Postgres instance as Kratos with a separate database named `keto`. Example: `postgres://user:pass@host:5432/keto?sslmode=disable` |
| `PORT` | No | Override the read port (default 4466). Railway sets this automatically — Keto reads it via the config. |

## Migration

After first deploy, run the migration command once via Railway's shell or a one-off job:

```
keto migrate sql -e --yes
```

This creates the `keto_relation_tuples` table in the `keto` database.

## Internal URLs (for Next.js app)

Set these in the `rexform-notes` service:

| Variable | Value |
|---|---|
| `KETO_READ_URL` | `http://keto.railway.internal:4466` |
| `KETO_WRITE_URL` | `http://keto.railway.internal:4467` |
