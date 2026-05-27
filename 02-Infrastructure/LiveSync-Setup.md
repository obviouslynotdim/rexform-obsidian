# Self-hosted LiveSync — Setup Guide

> Ready-to-follow steps to connect Obsidian to your CouchDB on Railway

-----

## Prerequisites

- CouchDB deployed and running on Railway
- Obsidian open (browser via obsidian-remote or native app)
- Self-hosted LiveSync plugin installed

-----

## Step 1 — Initialize CouchDB (run once)

SSH into your **couch-db** service on Railway and run:

**Initialize single-node:**

```bash
curl -X POST http://localhost:5984/_cluster_setup \
  -u admin:obsidian123 \
  -H "Content-Type: application/json" \
  -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
```

Expected response:

```json
{"ok":true}
```

**Create the obsidian database:**

```bash
curl -X PUT http://localhost:5984/obsidian \
  -u admin:obsidian123
```

Expected response:

```json
{"ok":true}
```

**Fix CORS (all in one command):**

```bash
curl -X PUT http://localhost:5984/_node/nonode@nohost/_config/cors/origins -u admin:obsidian123 -H "Content-Type: application/json" -d '"*"' && \
curl -X PUT http://localhost:5984/_node/nonode@nohost/_config/cors/credentials -u admin:obsidian123 -H "Content-Type: application/json" -d '"true"' && \
curl -X PUT http://localhost:5984/_node/nonode@nohost/_config/cors/methods -u admin:obsidian123 -H "Content-Type: application/json" -d '"GET, PUT, POST, HEAD, DELETE"' && \
curl -X PUT http://localhost:5984/_node/nonode@nohost/_config/cors/headers -u admin:obsidian123 -H "Content-Type: application/json" -d '"accept, authorization, content-type, origin, referer"'
```

All four should return `""` — that means success.

-----

## Step 2 — Install LiveSync plugin

In Obsidian:

1. **Settings → Community plugins**
1. Turn off **Restricted mode**
1. Click **Browse** → search **Self-hosted LiveSync**
1. Click **Install** → **Enable**

-----

## Step 3 — Configure LiveSync

In Obsidian → **Settings → Self-hosted LiveSync**:

|Field        |Value                                       |
|-------------|--------------------------------------------|
|URI          |`https://couch-db-production.up.railway.app`|
|Username     |`admin`                                     |
|Password     |`obsidian123`                               |
|Database name|`obsidian`                                  |


> ⚠️ Use `admin` not `dbrexform` — regular users cannot configure the database

Click **Test Settings and Continue**.

-----

## Step 4 — Fix CouchDB issues (if any)

If the test shows issues, click **Detect and Fix CouchDB Issues** — LiveSync will auto-fix most CORS and configuration problems using the admin credentials.

After fixing, click **Test Settings and Continue** again.

-----

## Step 5 — Choose sync preset

LiveSync will ask you to choose a preset:

|Preset           |Best for                                          |
|-----------------|--------------------------------------------------|
|**LiveSync**     |Real-time sync — recommended                      |
|**Periodic sync**|Sync every X minutes — lower battery use on mobile|
|**Sync on save** |Sync only when you save a file                    |

Choose **LiveSync** for real-time sync across all devices.

-----

## Step 6 — Initial sync

After setup:

1. Click **Replicate now** to do the first full sync
1. Wait for it to complete — you’ll see a progress indicator
1. Your vault is now syncing to CouchDB ✅

-----

## Step 7 — Set up on other devices

Repeat **Steps 2–6** on every device (phone, laptop, desktop):

- Install Obsidian natively
- Install Self-hosted LiveSync plugin
- Use the **same CouchDB URL, username, password, and database name**
- Click **Replicate now** on first connect

All devices will stay in sync automatically from this point.

-----

## Multiple users — separate vaults

For each additional user, create a new database in CouchDB:

```bash
curl -X PUT http://localhost:5984/obsidian-username \
  -u admin:obsidian123
```

Each user sets their own **Database name** in LiveSync settings:

|User |Database name   |
|-----|----------------|
|You  |`obsidian`      |
|Alice|`obsidian-alice`|
|Bob  |`obsidian-bob`  |

Everyone points to the **same CouchDB URL** but uses their own database — vaults are completely separate.

-----

## Troubleshooting

|Error               |Cause                          |Fix                                     |
|--------------------|-------------------------------|----------------------------------------|
|`Access forbidden`  |Using non-admin credentials    |Use `admin` username                    |
|`CORS error`        |CORS not configured            |Run the CORS curl commands in Step 1    |
|`Database not found`|Database not created           |Run the `PUT /obsidian` curl command    |
|`Connection refused`|CouchDB not initialized        |Run full Step 1 again                   |
|`Sync conflict`     |Same file edited on two devices|LiveSync will flag it — resolve manually|

-----

## Security (recommended after setup)

Once everything is working, create a dedicated sync user instead of using admin:

```bash
curl -X PUT http://localhost:5984/_users/org.couchdb.user:syncuser \
  -u admin:obsidian123 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "syncuser",
    "password": "yourpassword",
    "roles": [],
    "type": "user"
  }'
```

Then grant access to the obsidian database:

```bash
curl -X PUT http://localhost:5984/obsidian/_security \
  -u admin:obsidian123 \
  -H "Content-Type: application/json" \
  -d '{"members":{"names":["syncuser"],"roles":[]},"admins":{"names":[],"roles":[]}}'
```

Update LiveSync settings to use `syncuser` instead of `admin`.