// ==UserScript==
// @name         Chronomoto – Row Highlighter
// @namespace    https://github.com/hd214/advanced-chronomoto
// @version      6.1
// @description  Highlights the row matching a rider number (No. column = col[2]).
// @author       hd214
// @match        https://live.chronomoto.com/*
// @exclude      https://live.chronomoto.com/archive*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @homepageURL  https://github.com/hd214/advanced-chronomoto
// @updateURL    https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-highlight.user.js
// @downloadURL  https://raw.githubusercontent.com/hd214/advanced-chronomoto/main/userscripts/chronomoto-highlight.user.js
// @license      GPL-3.0-or-later
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'cm_highlight_no';
  const POLL_MS     = 700;
  const HL_BG       = '#FFD600';
  const HL_FG       = '#000000';
  const HL_BORDER   = '3px solid #FF3300';

  // CONFIG — edit this line after install
  const DEFAULT_NO = '';        // e.g. '214'

  const NO_COL_INDEX = 2;

  const panel = document.createElement('div');
  panel.id = 'cm-hl-panel';
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', right: '8px', zIndex: '2147483647',
    background: 'rgba(15,15,15,0.93)', color: '#fff',
    padding: '8px 14px', borderRadius: '8px',
    fontFamily: 'monospace', fontSize: '14px',
    boxShadow: '0 2px 14px rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', gap: '8px',
    userSelect: 'none', pointerEvents: 'auto',
  });

  const lbl = document.createElement('span');
  lbl.textContent = '🏁 No:';

  const input = document.createElement('input');
  Object.assign(input.style, {
    width: '62px', padding: '4px 8px', borderRadius: '4px',
    border: '2px solid #FFD600', background: '#111',
    color: '#FFD600', fontSize: '15px',
    fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center',
  });
  input.type = 'text';
  input.placeholder = 'e.g. 214';
  input.value = GM_getValue(STORAGE_KEY, DEFAULT_NO);

  const dot = document.createElement('span');
  dot.textContent = '⬤';
  dot.style.color = '#555';
  dot.title = 'Status';

  panel.append(lbl, input, dot);
  document.body.appendChild(panel);

  function setStatus(found) {
    dot.style.color = found ? '#00E676' : '#FF1744';
    dot.title = found ? '✓ Found' : '✗ Not found';
  }

  function clearHighlights() {
    document.querySelectorAll('[data-cm-hl]').forEach(el => {
      el.removeAttribute('data-cm-hl');
      ['background','background-color','color','outline','box-shadow','font-weight']
        .forEach(p => el.style.removeProperty(p));
    });
  }

  function highlightRow(tr) {
    const mark = el => {
      el.setAttribute('data-cm-hl', '1');
      el.style.setProperty('background',       HL_BG,  'important');
      el.style.setProperty('background-color', HL_BG,  'important');
      el.style.setProperty('color',            HL_FG,  'important');
      el.style.setProperty('font-weight',      'bold', 'important');
    };
    mark(tr);
    tr.style.setProperty('outline',    HL_BORDER,                 'important');
    tr.style.setProperty('box-shadow', '0 0 0 2px #FF3300 inset', 'important');
    tr.querySelectorAll('td, td *').forEach(mark);
  }

  function cellText(td) {
    return (td.innerText || td.textContent || '').trim();
  }

  function getDataTable() {
    const tables = document.querySelectorAll('table');
    for (const t of tables) {
      const rows = t.querySelectorAll('tr');
      if (rows.length < 5) continue;
      for (let ri = 0; ri < Math.min(rows.length, 6); ri++) {
        const cells = rows[ri].querySelectorAll('td');
        if (cells.length < 4) continue;
        const val = cellText(cells[NO_COL_INDEX]);
        if (/^\d+$/.test(val)) return t;
      }
    }
    return null;
  }

  function applyHighlight(rawTarget) {
    clearHighlights();
    const target = (rawTarget || '').trim();
    if (!target) { setStatus(false); return; }

    const table = getDataTable();
    if (!table) { setStatus(false); return; }

    let found = false;

    table.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 4) return;
      if (!cells[NO_COL_INDEX]) return;

      const val = cellText(cells[NO_COL_INDEX]);
      if (val === target) {
        highlightRow(tr);
        found = true;
      }
    });

    setStatus(found);

    if (found) {
      const el = document.querySelector('tr[data-cm-hl]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  document.addEventListener('click', e => {
    const td = e.target.closest('td');
    if (!td) return;
    const tr = td.closest('tr');
    if (!tr) return;

    const cells = Array.from(tr.querySelectorAll('td'));
    if (cells.length < 4) return;
    if (cells.indexOf(td) !== NO_COL_INDEX) return;

    const val = cellText(td);
    if (!val || !/^\d+$/.test(val)) return;

    input.value = val;
    GM_setValue(STORAGE_KEY, val);
    applyHighlight(val);
  }, true);

  input.addEventListener('input', () => {
    const v = input.value.trim();
    GM_setValue(STORAGE_KEY, v);
    applyHighlight(v);
  });

  let busy = false;
  function scheduleApply() {
    if (busy) return;
    busy = true;
    requestAnimationFrame(() => {
      applyHighlight(GM_getValue(STORAGE_KEY, DEFAULT_NO));
      busy = false;
    });
  }

  new MutationObserver(scheduleApply).observe(document.body, {
    childList: true, subtree: true, characterData: true
  });
  setInterval(scheduleApply, POLL_MS);

  const init = GM_getValue(STORAGE_KEY, DEFAULT_NO);
  if (init) {
    input.value = init;
    setTimeout(() => applyHighlight(init), 1000);
    setTimeout(() => applyHighlight(init), 2500);
  }

})();
