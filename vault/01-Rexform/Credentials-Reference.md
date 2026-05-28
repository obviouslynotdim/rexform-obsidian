---
tags:
  - credentials
  - setup
  - rexform
date: '2026-05-26'
---
# Rexform Group — Credentials Reference

> Actual token values should be stored in a password manager (e.g. Bitwarden, 1Password).  
> This note only documents what credentials are needed and where to configure them.

---

## GitLab

| Field | Value |
|-------|-------|
| Personal Access Token | *store in password manager* — needs `api` scope |
| Project ID | `82295211` |
| Base URL | `https://gitlab.com` |
| Branch | `main` |

**Where to use:** Obsidian → Settings → Git File Sync → Service: GitLab

---

## GitHub

| Field | Value |
|-------|-------|
| Personal Access Token | *store in password manager* — needs `repo` scope |
| Owner | your GitHub username |
| Branch | `main` |

**Where to use:** Obsidian → Settings → Git File Sync → Service: GitHub

---

## Generating New Tokens

**GitLab:**
1. `gitlab.com` → Settings → Access Tokens → Personal access tokens
2. Select **Legacy** → enable `api` scope → Generate

**GitHub:**
1. `github.com` → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Enable `repo` scope → Generate

---

> ⚠️ If any token was previously stored in plain text in this vault, revoke and regenerate it immediately.


> ⚠️ **Tokens have been removed from this note.** Store all secrets in your password manager and retrieve them from there when needed. The tokens that were here have been exposed — **revoke and regenerate them immediately.**

| Credential | Password Manager Entry |
|-----------|----------------------|
| GitLab Personal Access Token | "Rexform GitLab PAT" |
| GitLab Project ID | `82295211` |
| GitHub Personal Access Token | "Rexform GitHub PAT" |
