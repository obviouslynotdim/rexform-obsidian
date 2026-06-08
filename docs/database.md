# Database Schema

All data is stored in Apache CouchDB 3. There is no relational database for application data.

---

## Note Parent Document

Every note has a parent document that acts as the index entry.

```json
{
  "_id": "My Note.md",
  "_rev": "3-abc123...",
  "path": "My Note.md",
  "type": "plain",
  "title": "My Note",
  "mtime": 1748980000000,
  "children": ["My Note.md_c0"]
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | string | Filename with `.md` extension (`My Note.md`, `Projects/Report.md`) |
| `_rev` | string | CouchDB revision — managed by CouchDB |
| `path` | string | Same as `_id` — full path including any folder prefix |
| `type` | string | Always `"plain"` for app-created notes |
| `title` | string | Display title (filename without `.md`) |
| `mtime` | number | Unix timestamp in milliseconds — last modified time |
| `children` | string[] | Array of chunk document IDs |

---

## Note Chunk Document

Note content is stored in a separate chunk document.

```json
{
  "_id": "My Note.md_c0",
  "_rev": "2-def456...",
  "data": "# My Note\n\nNote content in Markdown..."
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | string | Parent `_id` + `_c<index>` suffix |
| `_rev` | string | CouchDB revision |
| `data` | string | Full Markdown content |

**Chunk naming:** `<parent._id>_c<index>` where index starts at 0. App-created notes always have exactly one chunk (`_c0`). Multi-chunk notes from Obsidian LiveSync may have `_c0`, `_c1`, etc.

---

## Chunk Reassembly

`assembleNoteContent()` in `lib/couchdb.ts`:

1. Fetch the parent document
2. Read `parent.children`: `["My Note.md_c0", "My Note.md_c1", ...]`
3. If `children.length === 0`: content is in `parent.body` or `parent.content` directly
4. Otherwise: fetch each chunk in order, extract `chunk.data`
5. Concatenate all `data` values in order → full note content
6. Strip YAML frontmatter (`stripFrontmatter()`)

---

## `_security` Document

Every vault has a `_security` document at `/<vaultName>/_security`.

**Personal vault (before LiveSync provisioning):**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": [], "roles": [] }
}
```

**Personal vault (after LiveSync provisioning):**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": ["957e5bcc-eb3f-442d-b5ec-0f47cac3282c"], "roles": [] }
}
```

**Shared vault (synced from Keto by `syncVaultSecurity()`):**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": ["user-id-1", "user-id-2", "user-id-3"], "roles": [] }
}
```

---

## `_users` Document (LiveSync Credentials)

Document path: `/_users/org.couchdb.user:<userId>`

```json
{
  "_id": "org.couchdb.user:957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "_rev": "1-xxx",
  "name": "957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "password": "a3f8...",
  "roles": [],
  "type": "user",
  "livesync_password": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5"
}
```

| Field | Notes |
|---|---|
| `_id` | `org.couchdb.user:` prefix + Kratos identity UUID |
| `name` | Kratos identity UUID — used as CouchDB username for LiveSync |
| `password` | Written as plaintext; CouchDB immediately replaces it with a bcrypt hash |
| `livesync_password` | Plaintext copy, stored separately so the app can retrieve and display it in Settings |
| `roles` | Empty — no special CouchDB roles granted |
| `type` | Always `"user"` |

---

## Shared Vault Metadata Document

Each shared vault contains one metadata document:

```json
{
  "_id": "rexform-metadata",
  "vaultName": "Team Research",
  "createdBy": "957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "createdAt": 1748980000000
}
```

---

## Database Naming Conventions

| Pattern | Example | Owner |
|---|---|---|
| `obsidian` | `obsidian` | Admin user (`ADMIN_USER_ID`) |
| `vault-<userId>` | `vault-957e5bcc-eb3f-442d-b5ec-0f47cac3282c` | Regular user |
| `vault-shared-<16 hex>` | `vault-shared-a1b2c3d4e5f6a7b8` | Shared vault (Keto-governed) |
| `_users` | `_users` | CouchDB system — stores LiveSync credentials |

---

## `isVaultNote` Filter

Before any document list is returned to the UI, documents pass through `isVaultNote()` in `lib/couchdb.ts`. A document qualifies as a user note only if:

- Not deleted (`_deleted !== true`)
- `_id` does not start with `docs/`, `node_modules/`, `h:`, or `_`
- `_id` is not `rexform-metadata`
- `doc.type === 'plain'` OR `doc.path` ends with `.md`

This filter prevents LiveSync internal documents (`h:` prefix), VitePress remnants (`docs/` prefix), and system documents from appearing in the notes list.
