# Limitations & Roadmap

## Known Limitations

| Limitation | Details |
|---|---|
| **Email verification not enforced** | Kratos verification flow is configured but users are not blocked from the app until they verify. `courier.smtp` points to a placeholder SMTP server — no emails send in production. |
| **No production SMTP** | Password recovery and email verification are non-functional until a real provider (e.g. SendGrid, Postmark) is configured in `kratos/kratos.yml`. |
| **`obsidian-remote` is single-user** | KasmVNC provides one browser session. Multiple users cannot have separate browser Obsidian instances. This service is admin-only tooling. |
| **Kratos session token not refreshed** | `kratosSessionToken` in the NextAuth JWT is not refreshed when it expires. Long-lived sessions may experience 401s from Oathkeeper on admin vault reads. Writes and all user-vault operations are unaffected. |
| **Search is a full scan, not indexed** | `/api/search` matches title, path, and body content, but by scanning `_all_docs` per query — no CouchDB Mango index or external search service. Body matching also reads inline `body`/`content`/`text` fields only, so multi-chunk LiveSync notes may not match on content. |
| **Folder rename doesn't rewrite wikilinks** | Renaming a single note rewrites `[[links]]` to it (best-effort, background), but renaming or moving a *folder* does not — links using folder-qualified paths can break. |
| **Single admin account** | `ADMIN_USER_ID` is one UUID. There is no multi-admin role system. All admin panel access is gated on this single identity. |
| **Notes not encrypted at rest** | Notes are stored as plaintext JSON in CouchDB. Enabling Obsidian LiveSync's E2E encryption would break the web editor and server-side search. |
| **Vault-level permissions only** | Access control is per-vault. There is no per-note ACL — all notes in a shared vault share the same role. |
| **No rate limiting** | API routes have no rate limiting. An authenticated user could hammer the CouchDB proxy. |
| **Single Keto instance** | If Keto goes down, shared vault permission checks fall back gracefully to the active vault cookie, but membership changes fail. |

---

## Shipped Since This List Was First Written (Phases 6–23)

Web workspace with tabs and resizable panels, sidebar file tree with folders/drag-and-drop/context menus, CodeMirror 6 Live Preview + Source editor modes, wikilinks with autocomplete + backlinks + D3 knowledge graph, Ctrl+K full-text quick switcher, YAML frontmatter round-trip + Properties panel, collapsible headings, Mermaid diagrams, onboarding flow, settings modal with i18n (en/kh), community plugin system, and native plugins: Kanban boards, Calendar, GitLab Work Items, LiveSync.

---

## Planned Work

| Feature | Description |
|---|---|
| **Production SMTP** | Connect Kratos courier to a real email provider; enforce email verification before vault access |
| **Indexed search** | Replace the per-query `_all_docs` scan with a CouchDB Mango index or an external search service; assemble chunked note bodies |
| **Multi-admin support** | Replace single `ADMIN_USER_ID` with a Keto-backed `admin` role |
| **Rate limiting** | Add rate limiting middleware on auth routes and write-heavy API routes |
| **Per-user obsidian-remote** | Provision a separate `linuxserver/obsidian` container per user, each mounted to their vault. Currently blocked by Railway's dynamic service provisioning complexity. |
| **CM6 Live Preview Phase B** | Deeper WYSIWYG behaviours deferred from the initial Live Preview work |
| **Backlinks panel in right sidebar** | Backlinks currently render as a right-panel tab; richer unlinked-mentions view deferred |

---

## Security Hardening Checklist

Before exposing this to external users:

- [ ] Rotate all default secrets — `NEXTAUTH_SECRET`, `COUCHDB_ADMIN_PASSWORD`, `SECRETS_DEFAULT`, `SECRETS_COOKIE` must all be unique, randomly generated values
- [ ] Configure a real SMTP provider and enforce email verification
- [ ] Add rate limiting to `/api/auth/*` and note write routes
- [ ] Confirm Keto Write API (port 4467) and Kratos Admin API (port 4434) are not publicly accessible — they should only be reachable on Railway's internal network
- [ ] Decide whether storing `livesync_password` in plaintext in the `_users` document is acceptable for your threat model
- [ ] Consider LiveSync E2E encryption if note confidentiality from the server operator is a hard requirement — with the understanding that this disables the web editor and server-side search
