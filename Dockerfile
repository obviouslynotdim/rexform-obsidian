# ============================================================
# Obsidian Remote — Railway Custom Dockerfile
# Base: lscr.io/linuxserver/obsidian:latest
# ============================================================

FROM lscr.io/linuxserver/obsidian:latest

# ── Labels ──────────────────────────────────────────────────
LABEL maintainer="your-name"
LABEL description="Self-hosted Obsidian on Railway with LiveSync support"

# ── Display & UI defaults ────────────────────────────────────
# Wayland modern display stack (better performance)
# Set to false to fall back to X11 on older hardware
ENV PIXELFLUX_WAYLAND=true

# Run without window borders (clean PWA-style look)
ENV NO_DECOR=true

# Disable gamepad support (not needed for note-taking)
ENV NO_GAMEPAD=true

# Window title shown in browser tab
ENV TITLE=Obsidian

# ── Timezone ─────────────────────────────────────────────────
# Set your local timezone
ENV TZ=Asia/Phnom_Penh

# ── User permissions ─────────────────────────────────────────
# Match these to your Railway volume ownership
ENV PUID=1000
ENV PGID=1000

# ── Authentication ───────────────────────────────────────────
# Uncomment and set values, or override via Railway variables
# ENV CUSTOM_USER=yourusername
# ENV PASSWORD=yourpassword

# ── Optional: Resolution lock ────────────────────────────────
# Uncomment to fix resolution (useful for consistent layouts)
# ENV SELKIES_MANUAL_WIDTH=1920
# ENV SELKIES_MANUAL_HEIGHT=1080

# ── Optional: Language ───────────────────────────────────────
# Uncomment to set a non-English locale
# ENV LC_ALL=zh_CN.UTF-8

# ── Ports ────────────────────────────────────────────────────
# 3000 = HTTP (Railway domain points here by default)
# 3001 = HTTPS (recommended — required for full functionality)
EXPOSE 3000
EXPOSE 3001

# ── Volume ───────────────────────────────────────────────────
# /config holds vault, plugins, and all Obsidian settings
# Mount your Railway persistent volume here
VOLUME /config

# ============================================================
# Railway deployment notes:
#
# 1. Set domain port to 3001 (HTTPS) in Railway → Networking
# 2. Attach persistent volume mounted at /config
# 3. Set CUSTOM_USER and PASSWORD in Railway Variables
# 4. On first visit, click Advanced → Proceed past cert warning
# 5. After CouchDB is initialized, install Self-hosted LiveSync
#    plugin and point it to your couch-db Railway service URL
# ============================================================
