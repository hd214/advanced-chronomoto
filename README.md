# Advanced Chronomoto

Browser tools for [live.chronomoto.com](https://live.chronomoto.com) — row highlighting, automatic result archiving, and a live/archive split view.

## What's included

| Tool | Type | What it does |
|------|------|--------------|
| **Row Highlighter** | Userscript | Highlights a rider row by number; click any No. cell to select |
| **Archiver** | Userscript | Saves final results when a race finishes; dashboard + CSV export at `/archive` |
| **Split View** | Web page | Live timing (top) + archive (bottom) in one resizable window |

## Quick install (recommended)

1. Install a userscript manager:
   - **[Tampermonkey](https://www.tampermonkey.net/)** — Chrome, Edge, Firefox, Safari, Opera
   - **[Violentmonkey](https://violentmonkey.github.io/)** — Chrome, Firefox, Edge (alternative)

2. Open the **[install page](https://hd214.github.io/advanced-chronomoto/install.html)** (or open `install.html` locally after cloning).

3. Click **Install with Tampermonkey** for each script and confirm the prompt.

4. Open **[Split View](https://hd214.github.io/advanced-chronomoto/split-view/index.html)** — no extension needed.

> **GitHub Pages:** After the first push, enable Pages in repo **Settings → Pages → Deploy from branch `main` / root**. The install page will be at `https://hd214.github.io/advanced-chronomoto/install.html`.

## Supported browsers

| Browser | Tampermonkey | Violentmonkey |
|---------|:------------:|:-------------:|
| Chrome | ✓ | ✓ |
| Microsoft Edge | ✓ | ✓ |
| Firefox | ✓ | ✓ |
| Opera | ✓ | — |
| Safari | ✓ | — |

Split View works in any modern browser (no extension required).

## Manual install

### Tampermonkey

1. Click the Tampermonkey icon → **Dashboard**.
2. Click **Utilities** tab (or **+** → **Install from URL**).
3. Paste one of these URLs and confirm:

```
https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-highlight.user.js
https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-archiver.user.js
```

### Violentmonkey

1. Click the Violentmonkey icon → **+** (Create script).
2. Choose **Install from URL** and paste a raw script URL from above.

### Split View (no extension)

- **Online:** [split-view/index.html](https://hd214.github.io/advanced-chronomoto/split-view/index.html)
- **Local:** clone this repo and open `split-view/index.html` in your browser.

## Customization (2-minute setup)

After installing, customize each script by editing the `CONFIG` block at the top.

### Row Highlighter — default rider number

1. Tampermonkey → Dashboard → click **Chronomoto – Row Highlighter** → Edit.
2. Find the CONFIG section near the top:

```js
// CONFIG — edit this line after install
const DEFAULT_NO = '';        // e.g. '214'
```

3. Set your number, e.g. `const DEFAULT_NO = '214';`
4. Save (Ctrl+S). Reload the timing page.

You can also type a number in the floating panel on the page, or click any No. cell in the results table.

### Archiver — category filter

1. Tampermonkey → Dashboard → click **Chronomoto Archiver** → Edit.
2. Find the CONFIG section:

```js
// CONFIG — edit this line after install
const FILTER_TEXT = '';       // e.g. 'YT125 2T' — leave empty to save all races
```

3. To save only one category, set e.g. `const FILTER_TEXT = 'YT125 2T';`
4. Save and reload. Use the **Filter** button (bottom-right on live pages) to toggle filtering on/off without editing the script.

By default the filter is **off** and all finished races are saved.

### Split View — URLs

Edit the CONFIG block in `split-view/index.html`:

```js
const TOP_URL    = 'https://live.chronomoto.com/mx/';
const BOTTOM_URL = 'https://live.chronomoto.com/archive';
```

Change `TOP_URL` if you follow a different timing path (e.g. `/ax/`).

## Usage

### Row Highlighter

- A small panel appears top-right on live timing pages.
- Enter a rider number or click a No. cell in the table.
- Green dot = row found; red dot = not found.
- The highlighted row scrolls into view automatically.

### Archiver

- On any live timing page, the script polls every 5 seconds.
- When **Flag status: Finished** appears, results are saved locally (Tampermonkey storage).
- A toast confirms each save. Use the **Archive** button (bottom-right) to open the dashboard.
- Visit [live.chronomoto.com/archive](https://live.chronomoto.com/archive) to browse saved races, download CSV, or delete entries.

### Split View

- Top panel: live timing. Bottom panel: archive dashboard.
- Drag the divider to resize, or use snap buttons (50/50, 60/40, etc.).
- **↺** reloads a panel; **↗ open** opens that URL in a new tab.

## Updating scripts

Both userscripts include `@updateURL` headers. Tampermonkey checks for updates automatically (Dashboard → check interval in settings).

To update manually, open the install page and click **Install with Tampermonkey** again, or re-paste the raw URL.

## Repository structure

```
advanced-chronomoto/
├── README.md
├── install.html                         # one-click installer
├── split-view/
│   └── index.html                       # live + archive split view
└── userscripts/
    ├── chronomoto-highlight.user.js
    └── chronomoto-archiver.user.js
```

## License

Use and modify freely. Not affiliated with Chronomoto / live.chronomoto.com.
