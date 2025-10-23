import { renderSankey } from './sankeyGraph.js';

const state = {
  rows: [],
  columns: [],
  sourceCol: null,
  targetCol: null,
  showRefNums: false,
  showCounts: true,
};

const els = {
  fileInput: document.getElementById('fileInput'),
  reloadBtn: document.getElementById('reloadBtn'),
  loadStatus: document.getElementById('loadStatus'),
  sourceSelect: document.getElementById('sourceSelect'),
  targetSelect: document.getElementById('targetSelect'),
  renderBtn: document.getElementById('renderBtn'),
  chart: document.getElementById('chart'),
  refList: document.getElementById('refList'),
  toggleRefNums: document.getElementById('toggleRefNums'),
  toggleCounts: document.getElementById('toggleCounts'),
  year: document.getElementById('year'),
};

els.year.textContent = new Date().getFullYear();

// Wire controls
els.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  els.loadStatus.textContent = `Reading ${file.name}…`;
  try {
    const rows = await readExcelFile(file);
    onDataLoaded(rows, `${file.name} loaded`);
  } catch (err) {
    console.error(err);
    els.loadStatus.textContent = `Failed to read file: ${err.message || err}`;
  }
});

els.reloadBtn.addEventListener('click', async () => {
  await tryLoadBuiltin();
});

els.renderBtn.addEventListener('click', () => {
  state.sourceCol = els.sourceSelect.value;
  state.targetCol = els.targetSelect.value;
  renderAll();
});

els.toggleRefNums.addEventListener('change', () => {
  state.showRefNums = els.toggleRefNums.checked;
  renderAll();
});

els.toggleCounts.addEventListener('change', () => {
  state.showCounts = els.toggleCounts.checked;
  renderAll();
});

window.addEventListener('resize', () => {
  // Debounce resize re-render
  clearTimeout(window.__bioVizResize);
  window.__bioVizResize = setTimeout(renderAll, 120);
});

// Attempt to fetch init_data.xlsx by default
tryLoadBuiltin();

async function tryLoadBuiltin() {
  els.loadStatus.textContent = 'Loading init_data.xlsx…';
  const paths = ['./init_data.xlsx', './data/init_data.xlsx'];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const wsName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { defval: '' });
      onDataLoaded(rows, `Loaded ${p}`);
      return;
    } catch (e) {
      // try next path
    }
  }
  els.loadStatus.textContent = 'No built-in init_data.xlsx found. Please upload a file.';
}

function onDataLoaded(rows, statusText = 'Data loaded') {
  state.rows = rows;
  state.columns = inferColumns(rows);
  els.loadStatus.textContent = `${statusText} (${rows.length} rows, ${state.columns.length} columns)`;
  populateSelect(els.sourceSelect, state.columns);
  populateSelect(els.targetSelect, state.columns);
  els.sourceSelect.disabled = false;
  els.targetSelect.disabled = false;
  els.renderBtn.disabled = false;

  // Default to first two columns if present
  state.sourceCol = state.columns[0] || null;
  state.targetCol = state.columns[1] || null;
  if (state.sourceCol) els.sourceSelect.value = state.sourceCol;
  if (state.targetCol) els.targetSelect.value = state.targetCol;

  // Build reference list mapping
  renderRefList(rows);
  renderAll();
}

function renderAll() {
  if (!state.rows.length || !state.sourceCol || !state.targetCol) {
    els.chart.innerHTML = placeholder('Load data and select columns to render.');
    return;
  }

  renderSankey(els.chart, state.rows, {
    sourceCol: state.sourceCol,
    targetCol: state.targetCol,
    showRefNums: state.showRefNums,
    showCounts: state.showCounts,
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
    o.value = opt; o.textContent = opt;
    selectEl.appendChild(o);
  }
}

function renderRefList(rows) {
  els.refList.innerHTML = '';
  const titleKey = preferKey(rows, ['Title', 'Paper', 'Reference', 'Citation', 'Name']);
  const authorKey = preferKey(rows, ['Authors', 'Author', 'First Author']);
  const yearKey = preferKey(rows, ['Year', 'Date']);

  rows.forEach((row, idx) => {
    const li = document.createElement('li');
    const num = idx + 1;
    const title = (row[titleKey] ?? '').toString().trim();
    const author = (row[authorKey] ?? '').toString().trim();
    const year = (row[yearKey] ?? '').toString().trim();

    const fallback = Object.entries(row)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${String(v).trim()}`)
      .join(' | ');

    li.textContent = title || author || year ? `${title}${title && author ? ' — ' : ''}${author}${year ? ` (${year})` : ''}` : fallback;
    els.refList.appendChild(li);
  });
}

function preferKey(rows, candidates) {
  if (!rows.length) return undefined;
  const keys = Object.keys(rows[0] || {});
  for (const c of candidates) if (keys.includes(c)) return c;
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
