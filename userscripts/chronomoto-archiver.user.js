// ==UserScript==
// @name         Chronomoto Archiver
// @namespace    https://github.com/hd214/advanced-chronomoto
// @version      2.6
// @description  Auto-saves race results when finished; dashboard view + CSV export.
// @author       hd214
// @match        https://live.chronomoto.com/*
// @match        https://live.chronomoto.com/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/hd214/advanced-chronomoto
// @updateURL    https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-archiver.user.js
// @downloadURL  https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-archiver.user.js
// @license      GPL-3.0-or-later
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'chronomoto_archives';
  const POLL_MS     = 5000;
  const DASH_PATH   = /^\/archive\/?$/i;
  const path        = window.location.pathname;

  // CONFIG — edit this line after install
  // Note: at runtime this can be overridden by localStorage key
  // `chronomoto_filter_text` or by `cm-defaults.js` created during setup.
  const FILTER_TEXT = (function(){
    try {
      const v = (typeof window.CHRONOMOTO_FILTER_TEXT !== 'undefined') ? window.CHRONOMOTO_FILTER_TEXT : null;
      if (v) return v;
      const ls = (typeof localStorage !== 'undefined') ? localStorage.getItem('chronomoto_filter_text') : null;
      if (ls) return ls;
    } catch (e) {}
    return '';
  })();       // e.g. 'YT125 2T' — leave empty to save all races

  const FILTER_KEY  = 'chronomoto_filter_enabled';
  // Compatibility: prefer Greasemonkey/Tampermonkey storage if available,
  // otherwise fall back to localStorage so content-script builds work too.
  function gmGet(key, fallback) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(key, fallback); } catch (e) {}
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
  }
  function gmSet(key, val) {
    try { if (typeof GM_setValue === 'function') return GM_setValue(key, val); } catch (e) {}
    try { localStorage.setItem(key, val); } catch (e) {}
  }
  let filterEnabled = (gmGet(FILTER_KEY, 'false') === 'true');

  function loadArchives() {
    try { return JSON.parse(gmGet(STORAGE_KEY, '[]')); }
    catch { return []; }
  }
  function saveArchives(arr) {
    gmSet(STORAGE_KEY, JSON.stringify(arr));
  }

  // Truncate a session title to at most 2 dash-separated segments,
  // e.g. "Classic 4+ Kupa - Mért edzés 2 - Qualifying 2 (Qualifying)"
  //   → "Classic 4+ Kupa - Mért edzés 2"
  function truncateAtSecondDash(str) {
    const parts = str.split(' - ');
    if (parts.length <= 2) return str;
    return parts.slice(0, 2).join(' - ');
  }

  // Session-type keywords that identify a real session name (not category tabs)
  const SESSION_RE = /free\s*practice|qualifying|futam|race|edzés|training|warm.?up/i;
  // Category filter tab text to ignore — short tokens like "ALL", "Classic 4", "Classic 4+"
  const CAT_TAB_RE = /^(all|classic|formula|open|junior|senior|hobby|cup|kupa)[\s\d+]*$/i;

  function scrapeCategory() {
    // 1. Look for a dedicated session-info element by common selectors
    for (const sel of [
      '.session-name', '.session-title', '.race-name', '.race-title',
      '.event-name', '.event-title', '[class*="session"]', '[class*="race-info"]',
      '[id*="session"]', '[id*="race-name"]'
    ]) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const t = el.innerText.trim();
          if (t.length > 3 && t.length < 300 && !CAT_TAB_RE.test(t)) {
            return truncateAtSecondDash(t);
          }
        }
      } catch(e) {}
    }

    // 2. Scan ALL text nodes / visible text for a line that contains a session keyword
    //    AND looks like a title (has a dash separator or is reasonably long)
    //    Exclude lines that are just category filter tabs.
    const bodyText = document.body.innerText;
    const lines = bodyText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

    // First pass: prefer lines that have a dash (event - session format)
    for (const line of lines) {
      if (line.includes(' - ') && SESSION_RE.test(line) && line.length < 300
          && !/flag\s+status|kattints|pdf|copyright/i.test(line)) {
        return truncateAtSecondDash(line);
      }
    }

    // Second pass: accept session-keyword lines without a dash
    for (const line of lines) {
      if (SESSION_RE.test(line) && line.length > 4 && line.length < 200
          && !CAT_TAB_RE.test(line)
          && !/flag\s+status|kattints|pdf|copyright/i.test(line)) {
        return line;
      }
    }

    // 3. Try "Filter for Category" (only if non-ALL and not a tab list)
    const m1 = bodyText.match(/Filter for Category[:\s]+([^\n\r]+)/i);
    if (m1) {
      const val = m1[1].trim();
      if (val && val.toUpperCase() !== 'ALL' && !CAT_TAB_RE.test(val)) {
        return truncateAtSecondDash(val);
      }
    }

    // 4. Fall back: channel path + timestamp so each session is still unique
    const seg = window.location.pathname.replace(/\/+$/, '').split('/').pop() || 'session';
    const ts  = new Date().toISOString().slice(0, 16).replace('T', '_'); // "2026-06-13_14:16"
    return seg + '_' + ts;
  }

  function scrapeFlag() {
    const m = document.body.innerText.match(/Flag\s+status\s*:\s*([^\n\r\t]+)/i);
    return m ? m[1].trim() : '';
  }

  function scrapeTable() {
    const tables = [...document.querySelectorAll('table')];

    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')];
      if (rows.length < 3) continue;

      let headerRowIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const texts = [...rows[i].querySelectorAll('td,th')]
          .map(td => td.innerText.trim());
        if (texts.some(t => /^pos\.?$/i.test(t))) { headerRowIdx = i; break; }
      }
      if (headerRowIdx < 0) continue;

      const rawHeaders = [...rows[headerRowIdx].querySelectorAll('td,th')]
        .map(td => td.innerText.trim());
      const firstHeaderEmpty = rawHeaders[0] === '';

      const usefulIdx = rawHeaders
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h !== '')
        .map(({ i }) => i);
      const headers = usefulIdx.map(i => rawHeaders[i]);
      if (headers.length === 0) continue;

      const natHeaderIdx = headers.findIndex(h => /^nat\.?$/i.test(h));

      const dataRows = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const tds = [...rows[i].querySelectorAll('td')];
        if (tds.length === 0) continue;
        const cells = tds.map(td => td.innerText.trim());
        if (/flag\s+status/i.test(cells[0])) break;
        if (cells.every(c => c === '')) continue;

        let row;
        if (firstHeaderEmpty) {
          row = usefulIdx.map(idx => cells[idx] ?? '');
        } else {
          const shiftedTDs = tds.slice(1);
          const shifted    = cells.slice(1);
          row = usefulIdx.map((idx, pos) => {
            if (pos === natHeaderIdx) {
              const img = shiftedTDs[idx]?.querySelector('img');
              return img ? (img.alt || img.title || shifted[idx] || '') : (shifted[idx] ?? '');
            }
            return shifted[idx] ?? '';
          });
        }

        if (row.every(c => c === '')) continue;
        dataRows.push(row);
      }

      if (dataRows.length > 0) {
        return [{ headers, rows: dataRows, natHeaderIdx }];
      }
    }

    return [];
  }

  let alreadySaved = new Set();
  let lastSeenTitle = '';

  function checkAndSave() {
    const flag = scrapeFlag();

    // Detect session change: if the page title changed, a new session has
    // loaded — reset the saved-set so it can be captured when it finishes.
    const currentTitle = (document.title || '').trim();
    if (currentTitle && currentTitle !== lastSeenTitle) {
      console.log('[Chronomoto Archiver] New session detected:', currentTitle);
      alreadySaved.clear();
      lastSeenTitle = currentTitle;
    }

    if (!flag.toLowerCase().includes('finished')) return;

    const category = scrapeCategory();

    if (filterEnabled && FILTER_TEXT && !category.includes(FILTER_TEXT)) {
      console.log('[Chronomoto Archiver] Filter excluded:', category, '(does not contain:', FILTER_TEXT + ')');
      return;
    }

    const sessionKey = category + '||' + flag;
    if (alreadySaved.has(sessionKey)) return;
    alreadySaved.add(sessionKey);

    const tables = scrapeTable();
    if (tables.length === 0) return;

    const entry = {
      id:         Date.now(),
      category:   category,
      flagStatus: flag,
      savedAt:    new Date().toLocaleString('en-US'),
      tables:     tables,
    };

    const archives = loadArchives();
    archives.unshift(entry);
    saveArchives(archives);

    showToast('✅ Saved: ' + category);
    console.log('[Chronomoto Archiver] Saved:', entry);
    try {
      // Notify parent/split-view to refresh after a short delay
      const msg = { type: 'chronomoto:archived', timestamp: Date.now(), category };
      try { if (window && window.parent) window.parent.postMessage(msg, '*'); } catch (e) {}
      try { if (window && window.top && window.top !== window) window.top.postMessage(msg, '*'); } catch (e) {}
    } catch (e) {}
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '60px', right: '16px', zIndex: 99999,
      background: '#0a3d1f', color: '#00ff88', border: '1px solid #00ff88',
      borderRadius: '6px', padding: '10px 18px', fontFamily: 'monospace',
      fontSize: '13px', fontWeight: 'bold', boxShadow: '0 4px 20px #00000088',
      opacity: '1', transition: 'opacity 0.4s',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3500);
  }

  const BTN_ID = 'chronomoto-archive-btn';
  const FILTER_BTN_ID = 'chronomoto-filter-btn';

  function updateFilterBtn() {
    const fb = document.getElementById(FILTER_BTN_ID);
    if (!fb) return;
    if (filterEnabled && FILTER_TEXT) {
      fb.textContent = '🎯 ' + FILTER_TEXT;
      fb.style.color        = '#ffaa00';
      fb.style.borderColor  = '#884400';
      fb.style.background   = '#1a0800';
      fb.title = 'Filter ON – only "' + FILTER_TEXT + '" is saved. Click to disable.';
    } else if (filterEnabled && !FILTER_TEXT) {
      fb.textContent = '🎯 Filter ON';
      fb.style.color        = '#ffaa00';
      fb.style.borderColor  = '#884400';
      fb.style.background   = '#1a0800';
      fb.title = 'Filter ON but FILTER_TEXT is empty – all races saved. Edit script CONFIG or click to disable.';
    } else {
      fb.textContent = '⭕ Filter off';
      fb.style.color        = '#446688';
      fb.style.borderColor  = '#223344';
      fb.style.background   = '#0a0a0f';
      fb.title = 'Filter OFF – all races saved. Click to enable.';
    }
  }

  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;

    const fb = document.createElement('button');
    fb.id = FILTER_BTN_ID;
    Object.assign(fb.style, {
      position: 'fixed', bottom: '62px', right: '16px', zIndex: 2147483647,
      borderRadius: '5px', padding: '6px 14px', fontFamily: 'monospace',
      fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px',
      cursor: 'pointer', border: '2px solid',
      boxShadow: '0 2px 12px #00000066', display: 'block', width: 'auto',
    });
    fb.addEventListener('click', () => {
      filterEnabled = !filterEnabled;
      GM_setValue(FILTER_KEY, String(filterEnabled));
      updateFilterBtn();
      showToast(filterEnabled
        ? (FILTER_TEXT ? '🎯 Filter ON: ' + FILTER_TEXT : '🎯 Filter ON (set FILTER_TEXT in script CONFIG)')
        : '⭕ Filter OFF – saving all races');
    });
    document.body.appendChild(fb);
    updateFilterBtn();

    const btn = document.createElement('a');
    btn.id          = BTN_ID;
    btn.href        = 'https://live.chronomoto.com/archive';
    btn.target      = '_blank';
    btn.textContent = '📋 Archive';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '16px', right: '16px', zIndex: 2147483647,
      background: '#0a0a0f', color: '#ff4400', border: '2px solid #ff4400',
      borderRadius: '5px', padding: '8px 18px', fontFamily: 'monospace',
      fontSize: '13px', fontWeight: 'bold', textDecoration: 'none',
      cursor: 'pointer', boxShadow: '0 2px 16px #ff440044', letterSpacing: '1px',
      display: 'block',
    });
    btn.onmouseenter = () => btn.style.background = '#1a0a00';
    btn.onmouseleave = () => btn.style.background = '#0a0a0f';
    document.body.appendChild(btn);
  }

  function injectLiveButton() {
    ensureButton();
    const observer = new MutationObserver(() => ensureButton());
    observer.observe(document.body, { childList: true, subtree: false });
  }

  function renderDashboard() {
    document.title = 'Chronomoto Archive';

    document.head.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Chronomoto Archive</title>
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0b0d14;
          color: #c0c8d8;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .layout {
          display: flex;
          flex: 1;
          height: 100vh;
          overflow: hidden;
        }

        .main {
          flex: 1;
          overflow-x: auto;
          overflow-y: auto;
          border-right: 1px solid #1a1e2e;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        thead tr {
          background: #10131e;
          border-bottom: 1px solid #0044aa;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        thead th {
          padding: 7px 10px;
          text-align: left;
          color: #0088dd;
          font-weight: bold;
          white-space: nowrap;
          font-size: 13px;
        }
        tbody tr { border-bottom: 1px solid #12151f; transition: background 0.1s; }
        tbody tr:hover { background: #ffffff07; }
        tbody td { padding: 6px 10px; color: #a0aac0; white-space: nowrap; }

        td.col-pos { color: #0088dd !important; font-weight: bold; font-size: 15px; width: 44px; }
        td.col-dns { color: #334466 !important; }
        td.col-no  { color: #e0e8ff !important; font-weight: bold; width: 52px; }
        td.col-driver { color: #e0e8ff !important; }
        td.col-nat { font-size: 15px; letter-spacing: 1px; }

        tr.rank-1 td { background: #001428; }
        tr.rank-1 td.col-pos { color: #00ccff !important; }
        tr.rank-2 td { background: #000e1c; }
        tr.rank-3 td { background: #000a14; }

        .panel {
          width: 200px;
          flex-shrink: 0;
          background: #0e1018;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          border-left: 2px solid #0044aa;
        }

        .panel-section {
          padding: 8px 10px;
          border-bottom: 1px solid #1a1e2e;
        }

        .panel-label {
          font-size: 9px;
          letter-spacing: 2px;
          color: #2a3a60;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .race-btn {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          border-left: 2px solid transparent;
          color: #4a5a80;
          font-size: 11px;
          font-family: Arial, sans-serif;
          padding: 5px 8px;
          cursor: pointer;
          line-height: 1.3;
          transition: all 0.12s;
          margin-bottom: 2px;
          border-radius: 2px;
        }
        .race-btn:hover { color: #88aadd; background: #ffffff06; }
        .race-btn.active {
          border-left-color: #0077cc;
          color: #88ccff;
          background: #0044aa18;
        }
        .race-btn .rb-title { display: block; }
        .race-btn .rb-time  { display: block; font-size: 9px; color: #2a3a60; margin-top: 1px; }
        .race-btn.active .rb-time { color: #2a4a80; }

        .act-btn {
          display: block;
          width: 100%;
          text-align: left;
          font-family: Arial, sans-serif;
          font-size: 11px;
          padding: 5px 8px;
          border-radius: 2px;
          cursor: pointer;
          border: 1px solid;
          margin-bottom: 4px;
          transition: background 0.12s;
        }
        .act-btn.csv  { color: #0088dd; border-color: #003366; background: transparent; }
        .act-btn.csv:hover  { background: #0044aa22; }
        .act-btn.del  { color: #334; border-color: #1a1e2e; background: transparent; }
        .act-btn.del:hover  { color: #ff5555; border-color: #551111; }
        .act-btn.clear { color: #441111; border-color: #1a1e2e; background: transparent; }
        .act-btn.clear:hover { color: #ff4444; border-color: #441111; }

        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1e2440;
          font-size: 13px;
          text-align: center;
          padding: 20px;
          line-height: 1.6;
        }
      </style>
    `;

    document.body.innerHTML = `
      <div class="layout">
        <div class="main" id="main"></div>
        <div class="panel" id="panel"></div>
      </div>
    `;

    function countryFlag(code) {
      if (!code || code.length !== 2) return code || '';
      const c = code.toUpperCase();
      return String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
    }

    // Columns hidden in the archive view; data is still saved and exported via CSV
    const HIDDEN_COLS = /^(nat\.?|vehicle|class|pic\.?)$/i;

    function buildTableHTML(t) {
      if (!t || !t.rows || t.rows.length === 0) return '';
      const h = t.headers || [];

      // Build visibility mask: true = show this column
      const visible = h.map(hdr => !HIDDEN_COLS.test(hdr.trim()));
      const visibleH = h.filter((_, i) => visible[i]);

      const posIdx    = visibleH.findIndex(x => /^pos/i.test(x));
      const noIdx     = visibleH.findIndex(x => /^no\.?$/i.test(x));
      const driverIdx = visibleH.findIndex(x => /driver/i.test(x));

      // Map original natHeaderIdx to its position among visible columns
      const origNatIdx = t.natHeaderIdx >= 0 ? t.natHeaderIdx
                         : h.findIndex(x => /^nat\.?$/i.test(x));
      let natIdx = -1;
      if (origNatIdx >= 0 && visible[origNatIdx]) {
        let vi = 0;
        for (let i = 0; i < origNatIdx; i++) { if (visible[i]) vi++; }
        natIdx = vi;
      }

      const headHTML = visibleH.map(hdr => `<th>${hdr}</th>`).join('');
      const bodyHTML = t.rows.map((row, ri) => {
        const visibleRow = row.filter((_, i) => visible[i]);
        const posVal = posIdx >= 0 ? (visibleRow[posIdx] || '') : '';
        const isDNS  = /dns|dnf|dsq/i.test(posVal);
        const rankCls = isDNS ? '' : (['rank-1','rank-2','rank-3'][ri] || '');
        const cells = visibleRow.map((cell, ci) => {
          let cls = '';
          let display = cell;
          if      (ci === posIdx)    cls = isDNS ? 'col-pos col-dns' : 'col-pos';
          else if (ci === noIdx)     cls = 'col-no';
          else if (ci === driverIdx) cls = 'col-driver';
          else if (ci === natIdx && cell.length === 2) {
            display = countryFlag(cell) + '\u2009' + cell;
            cls = 'col-nat';
          }
          return `<td class="${cls}">${display}</td>`;
        }).join('');
        return `<tr class="${rankCls}">${cells}</tr>`;
      }).join('');

      return `<table><thead><tr>${headHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`;
    }

    let currentIdx = 0;

    function render() {
      const data = loadArchives();
      const main  = document.getElementById('main');
      const panel = document.getElementById('panel');

      let panelHTML = '';

      panelHTML += '<div class="panel-section"><div class="panel-label">Races</div>';
      if (data.length === 0) {
        panelHTML += '<div style="font-size:11px;color:#1e2440;line-height:1.5">No saved races yet.</div>';
      } else {
        data.forEach((entry, idx) => {
          const active = idx === currentIdx ? ' active' : '';
          panelHTML += `<button class="race-btn${active}" data-idx="${idx}">
            <span class="rb-title">${entry.category}</span>
            <span class="rb-time">${entry.savedAt}</span>
          </button>`;
        });
      }
      panelHTML += '</div>';

      if (data.length > 0) {
        panelHTML += `<div class="panel-section">
          <div class="panel-label">Actions</div>
          <button class="act-btn csv" id="btn-csv">⬇ Download CSV</button>
          <button class="act-btn del" id="btn-del">✕ Delete</button>
        </div>`;
      }

      panelHTML += `<div class="panel-section" style="margin-top:auto">
        <button class="act-btn clear" id="btn-clear">🗑 Delete all</button>
      </div>`;

      panel.innerHTML = panelHTML;

      if (data.length === 0) {
        main.innerHTML = '<div class="empty">The script saves automatically<br>when "Flag status: Finished"<br>appears on the live timing page.</div>';
      } else {
        if (currentIdx >= data.length) currentIdx = 0;
        const entry = data[currentIdx];
        main.innerHTML = (entry.tables || []).map(buildTableHTML).join('') ||
          '<div class="empty">No table data.</div>';
      }

      panel.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentIdx = +btn.dataset.idx;
          render();
        });
      });

      document.getElementById('btn-csv')?.addEventListener('click', () => {
        const entry = loadArchives()[currentIdx];
        if (!entry) return;
        const lines = [];
        entry.tables.forEach(t => {
          if (t.headers?.length) lines.push(t.headers.join(';'));
          t.rows.forEach(r => lines.push(r.join(';')));
          lines.push('');
        });
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
        a.download = 'chronomoto_' + entry.category.replace(/\s+/g,'_') + '_' + entry.id + '.csv';
        a.click();
      });

      document.getElementById('btn-del')?.addEventListener('click', () => {
        if (!confirm('Delete this race?')) return;
        const arr = loadArchives();
        arr.splice(currentIdx, 1);
        saveArchives(arr);
        currentIdx = Math.max(0, currentIdx - 1);
        render();
      });

      document.getElementById('btn-clear')?.addEventListener('click', () => {
        if (!confirm('Delete all saved results?')) return;
        saveArchives([]);
        currentIdx = 0;
        render();
      });
    }

    render();
  }

  if (DASH_PATH.test(path)) {
    renderDashboard();
  } else {
    injectLiveButton();
    setInterval(checkAndSave, POLL_MS);
  }

  GM_registerMenuCommand('📋 Open archive', () => {
    window.open('https://live.chronomoto.com/archive', '_blank');
  });

})();