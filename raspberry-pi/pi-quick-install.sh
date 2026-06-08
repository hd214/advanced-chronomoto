#!/usr/bin/env bash
set -euo pipefail

# One-shot installer for Chronomoto kiosk on a fresh Raspberry Pi.
# Place this file on the Pi, edit the CONFIG below if desired, then run:
#   sudo bash pi-quick-install.sh
# or copy+run in one line via curl:
#   curl -fsSL https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/raspberry-pi/pi-quick-install.sh | sudo bash -s --

# --------------------
# CONFIG (edit or export env vars before running)
# --------------------
KIOSK_USER="${KIOSK_USER:-pi}"
INSTALL_DIR="${INSTALL_DIR:-/opt/advanced-chronomoto}"
BOOT_DELAY="${BOOT_DELAY:-5}"
HIGHLIGHT_NO="${HIGHLIGHT_NO:-214}"
REPO_URL="${REPO_URL:-https://github.com/hd214/advanced-chronomoto.git}"
BRANCH="${BRANCH:-main}"
# Set to 0 to allow full apt upgrade (may take long)
SKIP_UPGRADE="${SKIP_UPGRADE:-1}"

# --------------------
# Ensure running as root
# --------------------
if [[ $EUID -ne 0 ]]; then
  echo "This installer requires root; re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

log() { echo "==> [pi-quick-install] $*"; }

log "Starting Chronomoto one-shot installer"
log "KIOSK_USER=$KIOSK_USER INSTALL_DIR=$INSTALL_DIR BRANCH=$BRANCH HIGHLIGHT_NO=$HIGHLIGHT_NO"

# --------------------
# Minimal packages
# --------------------
log "Updating package lists and installing curl/git (non-interactive)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates || true

# Optional: avoid long full upgrades by default
if [[ "$SKIP_UPGRADE" != "1" ]]; then
  log "Running full upgrade (this may take several minutes)..."
  apt-get upgrade -y
  apt-get autoremove -y
else
  log "Skipping full upgrade (SKIP_UPGRADE=1)"
fi

# --------------------
# Clone repository
# --------------------
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Repository already present at $INSTALL_DIR — pulling latest ($BRANCH)"
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH" || true
  git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH" || git -C "$INSTALL_DIR" pull --ff-only || true
elif [[ -d "$INSTALL_DIR" ]]; then
  log "Backing up existing $INSTALL_DIR and cloning fresh"
  mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%s)"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
else
  log "Cloning $REPO_URL (branch $BRANCH) -> $INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

# Ensure the raspberry-pi scripts are present
if [[ ! -f "$INSTALL_DIR/raspberry-pi/setup.sh" ]]; then
  log "ERROR: expected $INSTALL_DIR/raspberry-pi/setup.sh not found"
  exit 1
fi

# --------------------
# Run upstream setup with provided env
# --------------------
export KIOSK_USER INSTALL_DIR BOOT_DELAY HIGHLIGHT_NO REPO_URL SKIP_UPGRADE
log "Running repository setup script (this requires network and may install packages)"
bash "$INSTALL_DIR/raspberry-pi/setup.sh"

log "One-shot installer finished."
log "To verify: sudo systemctl status chronomoto-kiosk"

exit 0
