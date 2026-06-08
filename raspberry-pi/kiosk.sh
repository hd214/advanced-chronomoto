#!/usr/bin/env bash
# Chronomoto split-view kiosk launcher (GPL-3.0-or-later)
# Copyright (C) 2026 hd214

set -euo pipefail

INSTALL_DIR="${CHRONOMOTO_INSTALL_DIR:-/opt/advanced-chronomoto}"
BOOT_DELAY="${CHRONOMOTO_BOOT_DELAY:-5}"
SPLIT_PAGE="${INSTALL_DIR}/split-view/index.html"

# Optional: set CHRONOMOTO_KIOSK_URL to use GitHub Pages instead of local file
if [[ -n "${CHRONOMOTO_KIOSK_URL:-}" ]]; then
  KIOSK_URL="$CHRONOMOTO_KIOSK_URL"
elif [[ -f "$SPLIT_PAGE" ]]; then
  KIOSK_URL="file://${SPLIT_PAGE}"
else
  KIOSK_URL="https://hd214.github.io/advanced-chronomoto/split-view/index.html"
fi

log() { echo "[chronomoto-kiosk] $*"; }

sleep "$BOOT_DELAY"

# Hide mouse cursor after 3s idle (optional, skip if missing)
if command -v unclutter >/dev/null 2>&1; then
  pkill -x unclutter 2>/dev/null || true
  unclutter -idle 3 -root &
fi

# Disable screen blanking on X11 (no-op on pure Wayland)
if [[ -n "${DISPLAY:-}" ]] && command -v xset >/dev/null 2>&1; then
  xset s off     2>/dev/null || true
  xset -dpms     2>/dev/null || true
  xset s noblank 2>/dev/null || true
fi

CHROMIUM=""
for bin in chromium chromium-browser google-chrome stable; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROMIUM="$bin"
    break
  fi
done

if [[ -z "$CHROMIUM" ]]; then
  log "ERROR: Chromium not found. Run setup.sh first."
  exit 1
fi

# Kill any existing kiosk instance for a clean restart
pkill -f "${CHROMIUM}.*--kiosk" 2>/dev/null || true
sleep 1

log "Opening kiosk: $KIOSK_URL"

CHROMIUM_ARGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-restore-session-state
  --no-first-run
  --start-fullscreen
  --check-for-update-interval=31536000
  --disable-features=TranslateUI
  --disable-pinch
  --overscroll-history-navigation=0
  --autoplay-policy=no-user-gesture-required
)

EXT_DIR="${INSTALL_DIR}/raspberry-pi/extension-built"
if [[ -f "${EXT_DIR}/manifest.json" ]]; then
  log "Loading highlight extension${CHRONOMOTO_HIGHLIGHT_NO:+ (No. ${CHRONOMOTO_HIGHLIGHT_NO})}"
  CHROMIUM_ARGS+=(--load-extension="$EXT_DIR")
fi

exec "$CHROMIUM" "${CHROMIUM_ARGS[@]}" "$KIOSK_URL"
