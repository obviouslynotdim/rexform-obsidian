# Limitations & Roadmap

## Known Limitations

| Limitation | Details |
|---|---|
| **Email verification not enforced** | Kratos verification flow is configured but users are not blocked from the app until they verify. `courier.smtp` points to a placeholder SMTP server — no emails send in production. |
| **No production SMTP** | Password recovery and email verification are non-functional until a real provider (e.g. SendGrid, Postmark) is configured in `kratos/kratos.yml`. |
| **`obsidian-remote` is single-user** | KasmVNC provides one browser session. Multiple users cannot have separate browser Obsidian instances. This service is admin-only tooling. |
| **Kratos session token not refreshed** | `kratosSessionToken` in the NextAuth JWT is not refreshed when it expires. Long-lived sessions may experience 401s from Oathkeeper on admin vault reads. Writes and all user-vault operations are unaffected. |
| **Search is a full scan, not indexed** | `/api/search` matches title, path, and body content (chunked LiveSync notes are assembled from the same `_all_docs` response), but every query scans the whole vault — no CouchDB Mango index or external search service. The scan is also capped at 1,000 docs (notes + chunks combined). |
| **Wikilink rewriting is best-effort** | Renames and moves (note or folder) rewrite affected `[[links]]` in a background pass that is not transactional: it scans up to 5,000 docs, skips docs on write conflicts, and can be cut short if the serverless runtime terminates after the response. |
| **Single admin account** | `ADMIN_USER_ID` is one UUID. There is no multi-admin role system. All admin panel access is gated on this single identity. |
| **Notes not encrypted at rest** | Notes are stored as plaintext JSON in CouchDB. Enabling Obsidian LiveSync's E2E encryption would break the web editor and server-side search. |
| **Vault-level permissions only** | Access control is per-vault. There is no per-note ACL — all notes in a shared vault share the same role. |
| **Rate limiting is in-memory, per-IP** | Middleware enforces per-IP windows (10 auth POSTs/min, 120 auth GETs/min, 600 API writes/min) but counters live in process memory — they reset on redeploy and would need a shared store (Redis) with multiple instances. Per-IP keys also mean users behind one NAT share a bucket, and there is no per-account lockout. |
| **Single Keto instance** | If Keto goes down, shared vault permission checks fall back gracefully to the active vault cookie, but membership changes fail. |

---

## Shipped Since This List Was First Written (Phases 6–23)

Web workspace with tabs and resizable panels, sidebar file tree with folders/drag-and-drop/context menus, CodeMirror 6 Live Preview + Source editor modes, wikilinks with autocomplete + backlinks + D3 knowledge graph, Ctrl+K full-text quick switcher, YAML frontmatter round-trip + Properties panel, collapsible headings, Mermaid diagrams, onboarding flow, settings modal with i18n (en/kh), community plugin system, and native plugins: Kanban boards, Calendar, GitLab Work Items, LiveSync, PDF Export, Speech (read aloud + dictation).

---

## Planned Work

| Feature | Description |
|---|---|
| **Production SMTP** | Connect Kratos courier to a real email provider; enforce email verification before vault access |
| **Indexed search** | Replace the per-query `_all_docs` scan with a CouchDB Mango index or an external search service; lift the 1,000-doc scan cap |
| **Multi-admin support** | Replace single `ADMIN_USER_ID` with a Keto-backed `admin` role |
| **Per-account login lockout** | Complement the per-IP rate limit with per-identity attempt tracking (survives IP rotation; needs a shared store) |
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
