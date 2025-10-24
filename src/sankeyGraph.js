// Sankey rendering module
// Exports: renderSankey(containerEl, rows, config)
// config: { sourceCol, targetCol, showRefNums }

// Ensure access to global D3 from classic <script> tags, even inside ES modules
const d3g = (typeof window !== 'undefined' ? window.d3 : undefined) || (typeof globalThis !== 'undefined' ? globalThis.d3 : undefined);

export function renderSankey(containerEl, rows, config = {}) {
  const {
    sourceCol,
    targetCol,
    showRefNums = false,
  } = config;

  if (!sourceCol || !targetCol) {
    containerEl.innerHTML = placeholder("Select source and target columns to render.");
    return; 
  }

  const width = containerEl.clientWidth || 800;
  const height = containerEl.clientHeight || 480;

  const { graph, byLinkKey, refCountMax } = buildGraph(rows, sourceCol, targetCol);
  if (!graph.links.length) {
    containerEl.innerHTML = placeholder("No connections found. Check the selected columns for empty values.");
    return;
  }

  // Clear container and add SVG
  containerEl.innerHTML = "";
  const svg = d3g.select(containerEl)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const defs = svg.append("defs");

  // Sankey setup
  if (!d3g) {
    containerEl.innerHTML = placeholder("D3 not available. Check script includes.");
    return;
  }

  const sankey = d3g.sankey()
    .nodeId(d => d.id)
    .nodeAlign(d3g.sankeyCenter)
    .nodeWidth(14)
    .nodePadding(14)
    .extent([[20, 20], [width - 20, height - 20]])
    .iterations(40);

  // Compute layout
  sankey(graph);

  // Link color rules
  const BASE_COLOR = '#e36414';     // main connection color
  const DEGENERATE_COLOR = '#9a031e'; // for multiplicity (>1 between same pair)
  const linkColor = (d) => (d.value > 1 ? DEGENERATE_COLOR : BASE_COLOR);

  // Links
  const link = svg.append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 1)
    .selectAll("g")
    .data(graph.links)
    .join("g")
    .attr("class", "link-group");

  const linkPath = d3g.sankeyLinkHorizontal();

  link.append("path")
    .attr("class", "link")
    .attr("id", (d, i) => `link-${i}`)
    .attr("d", linkPath)
    .attr("stroke", d => linkColor(d))
    .attr("stroke-width", d => Math.max(2, d.width));

  // Optional reference numbers along links (rendered as individual tokens)
  const tooltip = d3g.select("#tooltip");
  if (showRefNums) {
    let selectedRefId = null;
    let hoverRefId = null;
    const refMeta = buildRefMeta(rows);
    const labels = link.append("text")
      .attr("class", "link-label ref-label")
      .attr("dy", "0.35em");

    const tp = labels.append("textPath")
      .attr("href", (d, i) => `#link-${i}`)
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle");

    tp.each(function(d){
      const key = `${d.source.name}|||${d.target.name}`;
      const ids = byLinkKey.get(key)?.refIds || [];
      const sel = d3g.select(this);
      sel.selectAll('tspan')
        .data(ids)
        .join('tspan')
        .attr('class', 'ref-token')
        .attr('dx', (r, i) => (i === 0 ? 0 : 8))
        .text(r => r)
        .on('mouseenter', function(event, r){
          const info = formatRefDetails(rows, r, refMeta);
          tooltip.html(info).style('opacity', 1);
          const [x, y] = d3g.pointer(event);
          tooltip.style('left', (x + 20) + 'px').style('top', (y + 20) + 'px');
          // Hovering clears any previously selected ref permanently
          selectedRefId = null;
          hoverRefId = r;
          updateHighlights();
        })
        .on('mousemove', function(event){
          const [x, y] = d3g.pointer(event);
          tooltip.style('left', (x + 20) + 'px').style('top', (y + 20) + 'px');
        })
        .on('mouseleave', function(event, r){
          tooltip.style('opacity', 0);
          hoverRefId = null;
          updateHighlights();
        })
        .on('click', function(event, r){
          // Persist highlight and scroll to source list entry
          setSelectedRef(r);
          const li = document.querySelector(`#refList li:nth-child(${r})`);
          if (li) {
            li.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
    });

    function setSelectedRef(id){
      selectedRefId = id;
      updateHighlights();
    }

    function clearAllHighlights(){
      try {
        document.querySelectorAll('#refList li.active-ref').forEach(el => el.classList.remove('active-ref'));
      } catch {}
    }

    function updateHighlights(){
      const active = hoverRefId ?? selectedRefId;
      clearAllHighlights();
      if (active != null) highlightRefListItem(active, true);
    }
  }

  // Edge hover tooltip disabled (info shown on ref tokens only)

  // Nodes
  const node = svg.append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g")
    .attr("class", "node");

  node.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => Math.max(8, d.y1 - d.y0))
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => d.side === 'left' ? '#0b3743' : '#3b0a29')
    .attr("stroke", '#071b21')
    .append("title")
    .text(d => `${d.name}\nTotal: ${d.value || 0}`);

  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.name);

  // Enable vertical drag within the column to manually reduce crossings
  const nodePad = 14; // keep in sync with sankey.nodePadding()

  function updateNodes() {
    svg.selectAll('g.node')
      .select('rect')
      .attr('y', d => d.y0);
    svg.selectAll('g.node')
      .select('text')
      .attr('y', d => (d.y0 + d.y1) / 2);
  }

  const drag = d3g.drag()
    .on("start", function (event, d) {
      d3g.select(this).raise();
      // Cache column peers and heights
      const peers = graph.nodes.filter(n => n.side === d.side && n.id !== d.id)
        .sort((a, b) => a.y0 - b.y0);
      const heights = new Map(graph.nodes.map(n => [n.id, Math.max(8, n.y1 - n.y0)]));
      this.__peers = peers;
      this.__heights = heights;
    })
    .on("drag", function (event, d) {
      const nodeHeight = Math.max(8, d.y1 - d.y0);
      const minY = 20;
      const maxY = height - 20 - nodeHeight;
      const newY0 = Math.max(minY, Math.min(maxY, event.y));
      const newCenter = newY0 + nodeHeight / 2;

      // Determine insertion index among peers based on center
      const peers = this.__peers || [];
      const heights = this.__heights || new Map();
      const centers = peers.map(p => (p.y0 + p.y1) / 2);
      let insertIdx = 0;
      while (insertIdx < centers.length && centers[insertIdx] < newCenter) insertIdx++;

      // Pack peers to create space where dragged node would land
      let y = 20;
      for (let i = 0; i < peers.length; i++) {
        if (i === insertIdx) {
          y += nodeHeight + nodePad; // reserve space for dragged node
        }
        const p = peers[i];
        const h = heights.get(p.id) || Math.max(8, p.y1 - p.y0);
        p.y0 = y;
        p.y1 = y + h;
        y += h + nodePad;
      }

      // Position dragged node at pointer Y (freeform while dragging)
      d.y0 = newY0;
      d.y1 = newY0 + nodeHeight;

      updateNodes();
      sankey.update(graph);
      svg.selectAll('path.link').attr('d', linkPath);

      this.__insertIdx = insertIdx;
    })
    .on("end", function (event, d) {
      // Snap: finalize order and fully pack including dragged node
      const peers = this.__peers || [];
      const heights = this.__heights || new Map();
      const nodeHeight = heights.get(d.id) || Math.max(8, d.y1 - d.y0);
      const insertIdx = this.__insertIdx ?? 0;

      const ordered = peers.slice();
      ordered.splice(insertIdx, 0, d);

      let y = 20;
      for (const n of ordered) {
        const h = heights.get(n.id) || Math.max(8, n.y1 - n.y0);
        n.y0 = y;
        n.y1 = y + h;
        y += h + nodePad;
      }

      updateNodes();
      sankey.update(graph);
      svg.selectAll('path.link').attr('d', linkPath);
    });

  node.call(drag);
}

function buildGraph(rows, sourceCol, targetCol) {
  // Build unique nodes for both columns
  const sources = new Map();
  const targets = new Map();

  const byLinkKey = new Map(); // key: src|||tgt -> { count, refIds }

  const getVal = (row, col) => safeStr(row[col]);

  rows.forEach((row, idx) => {
    const s = getVal(row, sourceCol);
    const t = getVal(row, targetCol);
    if (!s || !t) return;

    if (!sources.has(s)) sources.set(s, { id: `S:${s}`, name: s, side: "left" });
    if (!targets.has(t)) targets.set(t, { id: `T:${t}`, name: t, side: "right" });

    const key = `${s}|||${t}`;
    const entry = byLinkKey.get(key) || { count: 0, refIds: [] };
    entry.count += 1;
    entry.refIds.push(idx + 1); // reference numbering starts at 1
    byLinkKey.set(key, entry);
  });

  const nodes = [...sources.values(), ...targets.values()];

  const links = [];
  for (const [key, { count }] of byLinkKey.entries()) {
    const [s, t] = key.split("|||");
    const sId = `S:${s}`;
    const tId = `T:${t}`;
    // Use node ids to match nodeId accessor in sankey
    links.push({
      source: sId,
      target: tId,
      value: count,
    });
  }

  const graph = { nodes: nodes.map(d => ({ ...d })), links };
  const refCountMax = d3g.max(links, d => d.value) || 1;
  return { graph, byLinkKey, refCountMax };
}

function placeholder(text) {
  return `<div style="display:grid;place-items:center;height:100%;color:#94a3b8">${text}</div>`;
}

function safeStr(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
}

// Helpers for reference token tooltip and highlighting
function buildRefMeta(rows){
  const keys = Object.keys(rows[0] || {});
  const prefer = (cands) => {
    const lowerMap = new Map(keys.map(k => [k.toLowerCase(), k]));
    for (const c of cands){
      const k = lowerMap.get(String(c).toLowerCase());
      if (k) return k;
    }
    const lowers = keys.map(k => k.toLowerCase());
    for (const c of cands){
      const cl = String(c).toLowerCase();
      const idx = lowers.findIndex(k => k.includes(cl));
      if (idx !== -1) return keys[idx];
    }
    return undefined;
  };
  return {
    titleKey: prefer(['Title','Paper','Reference','Citation','Name']),
    authorKey: prefer(['Authors','Author','First Author','PI','Principal Investigator']),
    yearKey: prefer(['Year','Date','Publication Year','Year Published'])
  };
}

function formatRefDetails(rows, id, meta){
  const row = rows[id - 1] || {};
  let title = safeStr(row[meta.titleKey]);
  let author = safeStr(row[meta.authorKey]);
  let year = safeStr(row[meta.yearKey]);
  author = author.replace(/^\s*(?:PI\s*:\s*)/i, '').trim();
  if (!/^\d{4}$/.test(year)) year = '';
  if (author.includes(';') || author.includes(',')) {
    const first = author.split(/[;,]/)[0].trim();
    if (first) author = first;
  }
  const fields = [author, title, year].filter(Boolean);
  const text = fields.join(', ');
  return `<div>${id}. ${text}</div>`;
}

function highlightRefListItem(id, on){
  try {
    const li = document.querySelector(`#refList li:nth-child(${id})`);
    if (li){
      if (on) li.classList.add('active-ref');
      else li.classList.remove('active-ref');
    }
  } catch {}
}
