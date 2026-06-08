# REXFORM Notes — Technical Documentation

Multi-user, Obsidian-compatible note-taking platform with per-user CouchDB vaults, shared vault collaboration, and direct LiveSync support.

---

## Contents

| # | Document | Description |
|---|---|---|
| 1 | [Overview](overview.md) | System summary, tech stack |
| 2 | [Architecture](architecture.md) | Diagrams, request flows, data flows |
| 3 | [Services](services.md) | All 8 Railway services with config details |
| 4 | [Authentication](authentication.md) | Kratos, NextAuth, JWT, middleware |
| 5 | [Security](security.md) | Encryption layers, credential scoping |
| 6 | [Database Schema](database.md) | CouchDB document formats and conventions |
| 7 | [API Reference](api.md) | All API routes with request/response shapes |
| 8 | [Vault Management](vaults.md) | Vault lifecycle, creation, deletion |
| 9 | [Permissions](permissions.md) | Keto model, role capabilities |
| 10 | [Environment Variables](environment.md) | Complete env var reference per service |
| 11 | [Deployment Guide](deployment.md) | Step-by-step Railway deployment |
| 12 | [Limitations & Roadmap](limitations.md) | Known gaps, Phase 6 plans |

---

## Quick Reference

| Task | Where to look |
|---|---|
| How does login work? | [Authentication → Login Flow](authentication.md#login-flow-step-by-step) |
| Why does admin use the public CouchDB URL? | [Services → couch-db](services.md#couch-db) |
| Why do writes bypass Oathkeeper? | [Authentication → Oathkeeper](authentication.md#how-oathkeeper-validates-requests) |
| Note document format | [Database Schema → Note Parent Document](database.md#note-parent-document) |
| How are shared vault permissions checked? | [Permissions → API Route Check Flow](permissions.md#how-permissions-are-checked-in-api-routes) |
| LiveSync setup for users | [Vault Management → Credential Provisioning](vaults.md#per-user-couchdb-credential-provisioning) |
| Deploy a service | [Deployment Guide](deployment.md) |
| Add an env var | [Environment Variables](environment.md) |

---

## Repository Layout

```
rexform-obsidian/
├── app/                    Next.js 14 application
│   ├── app/                Pages and API routes (App Router)
│   │   ├── api/            API route handlers
│   │   ├── admin/          Admin panel pages
│   │   ├── dashboard/      Dashboard page
│   │   ├── notes/          Notes viewer/editor pages
│   │   └── settings/       Settings page
│   ├── components/         Shared UI components
│   ├── lib/                Server-side utilities
│   │   ├── auth.ts         NextAuth configuration
│   │   ├── vault.ts        Vault lifecycle + syncVaultSecurity
│   │   ├── couchdb.ts      CouchDB read/write helpers
│   │   ├── keto.ts         Keto permission helpers
│   │   ├── kratos.ts       Kratos API clients
│   │   ├── active-vault.ts resolveVault() central logic
│   │   └── couchdb-credentials.ts LiveSync credential provisioning
│   └── middleware.ts       Route protection (withAuth)
├── kratos/                 Ory Kratos config + identity schema
├── keto/                   Ory Keto config + Dockerfile
├── oathkeeper/             Oathkeeper config + access rules
└── docs/                   This documentation
```
