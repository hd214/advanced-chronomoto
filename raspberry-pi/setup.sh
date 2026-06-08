#!/usr/bin/env bash
# Raspberry Pi setup: update system, install Chromium, deploy Chronomoto kiosk
# GPL-3.0-or-later — Copyright (C) 2026 hd214
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/raspberry-pi/setup.sh | sudo bash
#   — or —
#   sudo bash setup.sh
#
# Options (environment variables or chronomoto.conf):
#   KIOSK_USER=pi          Desktop login user (default: user running sudo, or 'pi')
#   INSTALL_DIR=/opt/...   Install location (default: /opt/advanced-chronomoto)
#   BOOT_DELAY=5           Seconds to wait before opening Chromium (default: 5)
#   SKIP_UPGRADE=1         Only apt update, skip full upgrade
#   REPO_URL=...           Git clone URL (default: this GitHub repo)
#
# Chronomoto content (see chronomoto.conf.example):
#   HIGHLIGHT_NO=214       Rider number to highlight in live iframe
#   TOP_URL=...            Live timing URL for top panel
#   BOTTOM_URL=...         Archive URL for bottom panel
#   ARCHIVE_TITLE=ARCHIVE  Badge label for archive panel
#   DEFAULT_SPLIT=60       Top panel height percent

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/hd214/advanced-chronomoto.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/advanced-chronomoto}"
BOOT_DELAY="${BOOT_DELAY:-5}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/chronomoto.conf}"

# Load kiosk content settings from conf file (env vars override file)
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi
HIGHLIGHT_NO="${HIGHLIGHT_NO:-214}"
TOP_URL="${TOP_URL:-https://live.chronomoto.com/mx/}"
BOTTOM_URL="${BOTTOM_URL:-https://live.chronomoto.com/archive}"
ARCHIVE_TITLE="${ARCHIVE_TITLE:-ARCHIVE}"
DEFAULT_SPLIT="${DEFAULT_SPLIT:-60}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash setup.sh"
  exit 1
fi

# Resolve kiosk user (who owns the graphical session)
if [[ -n "${KIOSK_USER:-}" ]]; then
  :
elif [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  KIOSK_USER="$SUDO_USER"
else
  KIOSK_USER="pi"
fi

if ! id "$KIOSK_USER" &>/dev/null; then
  echo "ERROR: User '$KIOSK_USER' does not exist. Set KIOSK_USER=yourusername"
  exit 1
fi

KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"

log() { echo "==> $*"; }

log "Chronomoto Pi kiosk setup"
log "  Install dir    : $INSTALL_DIR"
log "  Kiosk user     : $KIOSK_USER"
log "  Boot delay     : ${BOOT_DELAY}s"
log "  Top URL        : $TOP_URL"
log "  Archive title  : $ARCHIVE_TITLE"
log "  Highlight No.  : ${HIGHLIGHT_NO:-(disabled)}"

# ── System update / upgrade ──────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
log "Updating package lists..."
apt-get update -y

if [[ "${SKIP_UPGRADE:-}" != "1" ]]; then
  log "Upgrading installed packages (this may take several minutes)..."
  apt-get upgrade -y
  apt-get autoremove -y
else
  log "Skipping full upgrade (SKIP_UPGRADE=1)"
fi

# ── Packages ─────────────────────────────────────────────────────────────────
log "Installing Chromium and dependencies..."
apt-get install -y \
  chromium \
  git \
  unclutter \
  x11-xserver-utils \
  ca-certificates \
  unzip

# chromium-browser meta-package on older Pi OS
if ! command -v chromium &>/dev/null && ! command -v chromium-browser &>/dev/null; then
  apt-get install -y chromium-browser 2>/dev/null || true
fi

# ── Deploy Chronomoto ──────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Existing git checkout found at $INSTALL_DIR"
  # If there are local modifications, back up and clone fresh to avoid merge conflicts
  if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain)" ]]; then
    log "Local changes detected in $INSTALL_DIR — backing up and cloning fresh"
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%s)"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  else
    log "Updating existing install at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only origin main || git -C "$INSTALL_DIR" pull --ff-only || true
  fi
elif [[ -d "$INSTALL_DIR" ]]; then
  log "Backing up $INSTALL_DIR and cloning fresh..."
  mv "$INSTALL_DIR" "${INSTALL_DIR}.bak.$(date +%s)"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
  log "Cloning $REPO_URL -> $INSTALL_DIR..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# If setup was run from a local checkout, copy raspberry-pi scripts into install dir
if [[ "$SCRIPT_DIR" != "$INSTALL_DIR/raspberry-pi" && -f "$SCRIPT_DIR/kiosk.sh" ]]; then
  mkdir -p "$INSTALL_DIR/raspberry-pi"
  cp "$SCRIPT_DIR/kiosk.sh" \
     "$SCRIPT_DIR/chronomoto-kiosk.service" \
     "$SCRIPT_DIR/apply-config.sh" \
     "$SCRIPT_DIR/chronomoto.conf.example" \
     "$INSTALL_DIR/raspberry-pi/"
  [[ -d "$SCRIPT_DIR/extension-template" ]] && \
    cp -r "$SCRIPT_DIR/extension-template" "$INSTALL_DIR/raspberry-pi/"
fi

chmod +x "$INSTALL_DIR/raspberry-pi/kiosk.sh" \
         "$INSTALL_DIR/raspberry-pi/apply-config.sh" 2>/dev/null || true

# Apply TOP_URL, ARCHIVE_TITLE, HIGHLIGHT_NO, etc. to split-view + extension
export HIGHLIGHT_NO TOP_URL BOTTOM_URL ARCHIVE_TITLE DEFAULT_SPLIT
# Export filter settings so apply-config can write defaults into the extension
export CHRONOMOTO_FILTER_ENABLED="${CHRONOMOTO_FILTER_ENABLED:-}"
export CHRONOMOTO_FILTER_TEXT="${CHRONOMOTO_FILTER_TEXT:-}"
bash "$INSTALL_DIR/raspberry-pi/apply-config.sh" "$INSTALL_DIR"

# Attempt to download and unpack Tampermonkey into extension-built (optional)
EXT_DIR="${INSTALL_DIR}/raspberry-pi/extension-built"
mkdir -p "$EXT_DIR"
TM_ID="dhdgffkkebhmkfjojejmpbldmpobfkfo"
TM_CRX="$EXT_DIR/tamper.crx"
TM_EXT_DIR="$EXT_DIR/tampermonkey"
log "Attempting to download Tampermonkey extension (optional)"
curl -fsSL "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=99.0&x=id%3D${TM_ID}%26uc" -o "$TM_CRX" || true
if [[ -f "$TM_CRX" ]]; then
  if command -v bsdtar >/dev/null 2>&1; then
    mkdir -p "$TM_EXT_DIR" && bsdtar -xf "$TM_CRX" -C "$TM_EXT_DIR" || true
  elif command -v unzip >/dev/null 2>&1; then
    mkdir -p "$TM_EXT_DIR" && (cd "$TM_EXT_DIR" && unzip -q "$TM_CRX") || true
  else
    log "No extractor available to unpack CRX; Tampermonkey may not be installed"
  fi
  rm -f "$TM_CRX"
fi

# ── Environment for kiosk launcher ─────────────────────────────────────────────
cat > /etc/default/chronomoto-kiosk << EOF
# Chronomoto kiosk settings (edit and restart service)
CHRONOMOTO_INSTALL_DIR=$INSTALL_DIR
CHRONOMOTO_BOOT_DELAY=$BOOT_DELAY
CHRONOMOTO_HIGHLIGHT_NO=$HIGHLIGHT_NO
CHRONOMOTO_TOP_URL=$TOP_URL
CHRONOMOTO_BOTTOM_URL=$BOTTOM_URL
CHRONOMOTO_ARCHIVE_TITLE=$ARCHIVE_TITLE
CHRONOMOTO_DEFAULT_SPLIT=$DEFAULT_SPLIT
CHRONOMOTO_FILTER_ENABLED=${CHRONOMOTO_FILTER_ENABLED:-}
CHRONOMOTO_FILTER_TEXT=${CHRONOMOTO_FILTER_TEXT:-}
# CHRONOMOTO_KIOSK_URL=https://hd214.github.io/advanced-chronomoto/split-view/index.html
EOF

# Source defaults from kiosk.sh via wrapper
cat > /usr/local/bin/chronomoto-kiosk << 'WRAPPER'
#!/usr/bin/env bash
set -a
[[ -f /etc/default/chronomoto-kiosk ]] && source /etc/default/chronomoto-kiosk
set +a
exec /opt/advanced-chronomoto/raspberry-pi/kiosk.sh
WRAPPER
# Fix path in wrapper if custom install dir
sed -i "s|/opt/advanced-chronomoto|${INSTALL_DIR}|g" /usr/local/bin/chronomoto-kiosk
chmod +x /usr/local/bin/chronomoto-kiosk

# ── Disable screen blanking (X11 / LightDM) ───────────────────────────────────
mkdir -p /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/99-chronomoto-kiosk.conf << 'EOF'
[Seat:*]
xserver-command=X -s 0 -dpms
EOF

# ── systemd service ───────────────────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/chronomoto-kiosk.service"
sed -e "s|__KIOSK_USER__|${KIOSK_USER}|g" \
    -e "s|/opt/advanced-chronomoto|${INSTALL_DIR}|g" \
    "$INSTALL_DIR/raspberry-pi/chronomoto-kiosk.service" > "$SERVICE_FILE"

# Point service at wrapper (includes /etc/default env)
sed -i 's|ExecStart=.*|ExecStart=/usr/local/bin/chronomoto-kiosk|' "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable chronomoto-kiosk.service

chown -R root:root "$INSTALL_DIR"
chmod -R a+rX "$INSTALL_DIR"

log ""
log "Setup complete."
log ""
log "  Kiosk starts ${BOOT_DELAY}s after the desktop is ready."
log "  Split view file: ${INSTALL_DIR}/split-view/index.html"
log ""
log "  Commands:"
log "    sudo systemctl start chronomoto-kiosk    # start now"
log "    sudo systemctl stop chronomoto-kiosk     # stop kiosk"
log "    sudo systemctl status chronomoto-kiosk   # check status"
log "    sudo systemctl restart chronomoto-kiosk  # restart"
log ""
log "  Edit content (highlight No., URLs, archive title):"
log "    sudo nano ${INSTALL_DIR}/raspberry-pi/chronomoto.conf"
log "    sudo bash ${INSTALL_DIR}/raspberry-pi/apply-config.sh ${INSTALL_DIR}"
log "    sudo systemctl restart chronomoto-kiosk"
log ""
log "  Edit boot delay:"
log "    sudo nano /etc/default/chronomoto-kiosk"
log "    sudo systemctl restart chronomoto-kiosk"
log ""
log "  Reboot to start automatically:"
log "    sudo reboot"
log ""
log "TIP: Enable Desktop Autologin for user '$KIOSK_USER':"
log "     sudo raspi-config  -> System Options -> Boot / Auto Login -> Desktop Autologin"
