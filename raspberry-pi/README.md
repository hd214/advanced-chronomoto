# Raspberry Pi Kiosk

Turn a Raspberry Pi into a **fullscreen Chronomoto display**: live timing on top, archive on bottom (split view), with no browser toolbar.

## What the setup does

1. `apt update` and `apt upgrade`
2. Installs **Chromium**, git, and screen helpers
3. Clones [advanced-chronomoto](https://github.com/hd214/advanced-chronomoto) to `/opt/advanced-chronomoto`
4. Registers a **systemd service** that opens Chromium in **kiosk mode** after a **5 second** delay
5. Enables a **systemd service** for autostart on boot

> **Note:** The Pi kiosk runs the **Split View** page. Tampermonkey userscripts are for desktop browsers; the Pi shows the embedded live + archive iframes.

## Requirements

- Raspberry Pi 3/4/5 (or Zero 2 W) with Raspberry Pi OS (Desktop)
- Network (for live.chronomoto.com iframes)
- **Desktop Autologin** recommended — enable in `raspi-config`

## Configure before install

Copy the example config and edit your settings:

```bash
cd advanced-chronomoto/raspberry-pi
cp chronomoto.conf.example chronomoto.conf
nano chronomoto.conf
```

| Variable | Example | Description |
|----------|---------|-------------|
| `HIGHLIGHT_NO` | `214` | Rider number highlighted in live timing (empty = off) |
| `TOP_URL` | `https://live.chronomoto.com/mx/` | Top iframe — live timing |
| `BOTTOM_URL` | `https://live.chronomoto.com/archive` | Bottom iframe — archive |
| `ARCHIVE_TITLE` | `ARCHIVE` | Label on the archive badge in the top bar |
| `DEFAULT_SPLIT` | `60` | Top panel height % (60 = 60/40 split) |

Or pass variables directly:

```bash
sudo HIGHLIGHT_NO=214 TOP_URL=https://live.chronomoto.com/mx/ ARCHIVE_TITLE=RACES bash setup.sh
```

## One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/raspberry-pi/setup.sh | sudo bash
```

Or clone the repo and run locally:

```bash
git clone https://github.com/hd214/advanced-chronomoto.git
cd advanced-chronomoto/raspberry-pi
cp chronomoto.conf.example chronomoto.conf   # optional: edit first
sudo bash setup.sh
```

Then reboot:

```bash
sudo reboot
```

## Configuration

### Content (URLs, highlight, archive title)

Edit `chronomoto.conf` on the Pi:

```bash
sudo nano /opt/advanced-chronomoto/raspberry-pi/chronomoto.conf
```

Apply and restart:

```bash
sudo bash /opt/advanced-chronomoto/raspberry-pi/apply-config.sh /opt/advanced-chronomoto
sudo systemctl restart chronomoto-kiosk
```

This updates `split-view/config.js` and rebuilds the highlight extension.

### Boot delay

Edit `/etc/default/chronomoto-kiosk`:

```bash
sudo nano /etc/default/chronomoto-kiosk
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CHRONOMOTO_BOOT_DELAY` | `5` | Seconds to wait before opening Chromium |
| `CHRONOMOTO_INSTALL_DIR` | `/opt/advanced-chronomoto` | Repo install path |
| `CHRONOMOTO_KIOSK_URL` | *(local file)* | Override URL (e.g. GitHub Pages) |

After changes:

```bash
sudo systemctl restart chronomoto-kiosk
```

## Service commands

```bash
sudo systemctl start chronomoto-kiosk    # start now
sudo systemctl stop chronomoto-kiosk     # stop
sudo systemctl restart chronomoto-kiosk  # restart
sudo systemctl status chronomoto-kiosk   # status
sudo journalctl -u chronomoto-kiosk -f # logs
```

## Setup options

Run with environment variables:

```bash
sudo KIOSK_USER=myuser BOOT_DELAY=10 bash setup.sh
```

| Variable | Default | Description |
|----------|---------|-------------|
| `KIOSK_USER` | sudo user or `pi` | Linux user that runs the desktop session |
| `INSTALL_DIR` | `/opt/advanced-chronomoto` | Clone destination |
| `BOOT_DELAY` | `5` | Passed to kiosk launcher |
| `SKIP_UPGRADE=1` | off | Skip `apt upgrade` (faster re-runs) |

## Enable autologin (important)

Without autologin, the kiosk service may start before anyone logs in:

```bash
sudo raspi-config
```

Go to **System Options → Boot / Auto Login → Desktop Autologin**, select your user, finish, reboot.

## Troubleshooting

### Black screen after boot

- Wait 30s — first boot after upgrade can be slow.
- Check logs: `sudo journalctl -u chronomoto-kiosk -b`
- Start manually: `sudo systemctl start chronomoto-kiosk`

### Chromium not found

```bash
sudo apt install chromium
sudo systemctl restart chronomoto-kiosk
```

### Browser shows but not fullscreen

Ensure no other Chromium window opened first. Restart:

```bash
sudo systemctl restart chronomoto-kiosk
```

### Wayland vs X11 (Pi OS Bookworm+)

If kiosk fails on Wayland, switch to X11 in `raspi-config` → **Advanced Options → Wayland → X11**, then reboot.

### Update Chronomoto files

```bash
sudo git -C /opt/advanced-chronomoto pull
sudo systemctl restart chronomoto-kiosk
```

Or re-run setup (also upgrades system packages):

```bash
curl -fsSL https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/raspberry-pi/setup.sh | sudo bash
```

## License

GPL-3.0-or-later — see [LICENSE](../LICENSE).
