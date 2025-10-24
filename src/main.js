import { renderSankey } from './sankeyGraph.js';

const state = {
  rows: [],
  columns: [],
  sourceCol: null,
  targetCol: null,
  showRefNums: true,
};

const els = {
  sourceSelect: document.getElementById('sourceSelect'),
  targetSelect: document.getElementById('targetSelect'),
  chart: document.getElementById('chart'),
  refList: document.getElementById('refList'),
  toggleRefNums: document.getElementById('toggleRefNums'),
  year: document.getElementById('year'),
};

els.year.textContent = new Date().getFullYear();

// Wire controls

els.sourceSelect.addEventListener('change', () => {
  state.sourceCol = els.sourceSelect.value;
  renderAll();
});

els.targetSelect.addEventListener('change', () => {
  state.targetCol = els.targetSelect.value;
  renderAll();
});

els.toggleRefNums.addEventListener('change', () => {
  state.showRefNums = els.toggleRefNums.checked;
  renderAll();
});

// Edge counts feature removed; no handler needed.

window.addEventListener('resize', () => {
  // Debounce resize re-render
  clearTimeout(window.__bioVizResize);
  window.__bioVizResize = setTimeout(renderAll, 120);
});

// Attempt to fetch init_data.xlsx by default
tryLoadBuiltin();

async function tryLoadBuiltin() {
  const paths = ['./data.xlsx', './init_data.xlsx', './data/data.xlsx'];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const wsName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { defval: '' });
      onDataLoaded(rows);
      return;
    } catch (e) {
      // try next path
    }
  }
  // If no dataset found, show a neutral placeholder without naming files
  els.chart.innerHTML = placeholder('No dataset found. Add a .xlsx file to the repository and reload.');
}

function onDataLoaded(rows) {
  state.rows = rows;
  state.columns = inferColumns(rows);
  const selectable = filterSelectableColumns(state.columns);
  populateSelect(els.sourceSelect, selectable);
  populateSelect(els.targetSelect, selectable);
  els.sourceSelect.disabled = false;
  els.targetSelect.disabled = false;
  // Reflect default toggle state in UI
  if (els.toggleRefNums) els.toggleRefNums.checked = state.showRefNums;

  // Choose more interesting defaults if available (e.g., Stage in gastrulation → 1D/2D/3D)
  const [defSrc, defTgt] = chooseDefaultColumns(selectable);
  state.sourceCol = defSrc || selectable[0] || null;
  state.targetCol = defTgt || selectable[1] || null;
  if (state.sourceCol) els.sourceSelect.value = state.sourceCol;
  if (state.targetCol) els.targetSelect.value = state.targetCol;

  // Build reference list mapping
  renderRefList(rows);
  renderAll();
}

function renderAll() {
  if (!state.rows.length || !state.sourceCol || !state.targetCol) {
    els.chart.innerHTML = placeholder('Select source and target columns to visualize.');
    return;
  }

  renderSankey(els.chart, state.rows, {
    sourceCol: state.sourceCol,
    targetCol: state.targetCol,
    showRefNums: state.showRefNums,
  });
}

function placeholder(text) {
  return `<div style="display:grid;place-items:center;height:100%;color:#94a3b8">${text}</div>`;
}

function inferColumns(rows) {
  if (!rows || !rows.length) return [];
  const keys = Object.keys(rows[0] || {});
  return keys;
}

function populateSelect(selectEl, options) {
  selectEl.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = formatColumnLabel(opt);
    selectEl.appendChild(o);
  }
}

function renderRefList(rows) {
  els.refList.innerHTML = '';
  const titleKey = preferKey(rows, ['Title', 'Paper', 'Reference', 'Citation', 'Name']);
  const authorKey = preferKey(rows, ['Authors', 'Author', 'First Author', 'PI', 'Principal Investigator']);
  const yearKey = preferKey(rows, ['Year', 'Date', 'Publication Year', 'Year Published']);

  rows.forEach((row, idx) => {
    const li = document.createElement('li');
    let title = coerceStr(row[titleKey]);
    let author = coerceStr(row[authorKey]);
    let year = coerceStr(row[yearKey]);

    // Cleanups
    author = author.replace(/^\s*(?:PI\s*:\s*)/i, '').trim();
    if (!isYearStr(year)) year = '';
    if (!isMeaningful(author)) author = '';
    if (!isMeaningful(title)) title = '';

    // If Authors contains multiple names, pick the first
    if (author.includes(';') || author.includes(',')) {
      const first = author.split(/[;,]/)[0].trim();
      if (isMeaningful(first)) author = first;
    }

    // Fallbacks: if nothing meaningful, attempt to derive from first few fields
    if (!author || !title) {
      const entries = Object.entries(row)
        .filter(([k, v]) => k !== undefined && k !== null)
        .map(([k, v]) => coerceStr(v))
        .filter(v => isMeaningful(v));
      if (!author && entries.length) author = entries[0];
      if (!title && entries.length > 1) title = entries[1];
      if (!year) {
        const y = entries.find(isYearStr) || '';
        if (y) year = y;
      }
    }

    const fields = [author, title, year].filter(Boolean);
    li.textContent = fields.join(', ').trim();
    els.refList.appendChild(li);
  });

  // If nothing rendered (unexpected), show a minimal note to aid debugging
  if (!els.refList.children.length) {
    const li = document.createElement('li');
    li.textContent = 'No sources found in dataset.';
    els.refList.appendChild(li);
  }
}

function preferKey(rows, candidates) {
  if (!rows.length) return undefined;
  const keys = Object.keys(rows[0] || {});
  if (!keys.length) return undefined;
  // Exact (case-insensitive)
  const lowerMap = new Map(keys.map(k => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const k = lowerMap.get(String(c).toLowerCase());
    if (k) return k;
  }
  // Fuzzy includes (case-insensitive)
  const lowers = keys.map(k => k.toLowerCase());
  for (const c of candidates) {
    const cl = String(c).toLowerCase();
    const idx = lowers.findIndex(k => k.includes(cl));
    if (idx !== -1) return keys[idx];
  }
  return undefined;
}

async function readExcelFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows;
}

function coerceStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isYearStr(v) {
  return /^\d{4}$/.test(String(v).trim());
}

function isMeaningful(v) {
  const t = String(v || '').trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return false; // pure numbers are not meaningful for author/title
  // ignore very short tokens
  return t.replace(/[^A-Za-z]+/g, '').length >= 2;
}

// Filter out numbering/id columns from dropdowns
function filterSelectableColumns(columns){
  return (columns || []).filter(c => !isArticleNumberColumn(c));
}

function isArticleNumberColumn(name){
  const n = String(name || '').toLowerCase().trim();
  const bads = [
    'article number','articlenumber','article no','article #','article id',
    'reference number','ref number','refno','ref id','reference id',
    'id','number','index','row','row id','rowid','paper id'
  ];
  return bads.some(b => n === b || n.includes(b));
}

// Display helper for dropdown labels: strip leading numbers and capitalize first letter
function formatColumnLabel(name){
  let s = String(name || '');
  // Remove leading numbering like "1.", "2)", "3-", "4:"
  s = s.replace(/^\s*\d+\s*[\.\-\):]\s*/,'');
  s = s.replace(/_/g,' ').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Pick defaults: prefer a source containing both 'stage' and 'gastrulation', and a target mentioning 1D/2D/3D or dimensionality
function chooseDefaultColumns(columns){
  if (!columns || !columns.length) return [null, null];
  const lowers = columns.map(c => (c || '').toString().toLowerCase());
  const findIndex = (pred) => lowers.findIndex(pred);
  const hasAny = (...subs) => (k) => subs.some(sub => k.includes(sub));

  let srcIdx = findIndex(k => k.includes('stage') && k.includes('gastrulation'));
  if (srcIdx === -1) srcIdx = findIndex(k => k.includes('stage in gastrulation'));

  let tgtIdx = findIndex(hasAny('1d','2d','3d','dimensional','dimension'));

  if (srcIdx === -1 && tgtIdx === -1) return [columns[0] || null, columns[1] || null];
  if (srcIdx === -1) srcIdx = lowers.findIndex((_, i) => i !== tgtIdx);
  if (tgtIdx === -1) tgtIdx = lowers.findIndex((_, i) => i !== srcIdx);
  if (srcIdx === -1 || tgtIdx === -1) return [columns[0] || null, columns[1] || null];
  if (srcIdx === tgtIdx) {
    const alt = lowers.findIndex((_, i) => i !== srcIdx);
    if (alt !== -1) tgtIdx = alt;
  }
  return [columns[srcIdx], columns[tgtIdx]];
}
