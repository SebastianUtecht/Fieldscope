// Sankey rendering module
// Exports: renderSankey(containerEl, rows, config)
// config: { sourceCol, targetCol, showRefNums, showCounts }

// Ensure access to global D3 from classic <script> tags, even inside ES modules
const d3g = (typeof window !== 'undefined' ? window.d3 : undefined) || (typeof globalThis !== 'undefined' ? globalThis.d3 : undefined);

export function renderSankey(containerEl, rows, config = {}) {
  const {
    sourceCol,
    targetCol,
    showRefNums = false,
    showCounts = true,
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

  // Color scale by weight
  const weightMax = d3g.max(graph.links, d => d.value) || 1;
  const color = d3g.scaleSequential(d3g.interpolateTurbo)
    .domain([1, Math.max(3, weightMax)]);

  // Links
  const link = svg.append("g")
    .attr("fill", "none")
    .attr("stroke-opacity", 0.85)
    .selectAll("g")
    .data(graph.links)
    .join("g")
    .attr("class", "link-group");

  const linkPath = d3g.sankeyLinkHorizontal();

  link.append("path")
    .attr("class", "link")
    .attr("id", (d, i) => `link-${i}`)
    .attr("d", linkPath)
    .attr("stroke", d => color(d.value))
    .attr("stroke-width", d => Math.max(1.5, d.width));

  // Optional count labels centered on link
  if (showCounts) {
    link.append("text")
      .attr("class", "link-label count-label")
      .attr("dy", "-0.3em")
      .append("textPath")
      .attr("href", (d, i) => `#link-${i}`)
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle")
      .text(d => d.value);
  }

  // Optional reference numbers along links
  if (showRefNums) {
    link.append("text")
      .attr("class", "link-label ref-label")
      .attr("dy", showCounts ? "1.2em" : "-0.3em")
      .append("textPath")
      .attr("href", (d, i) => `#link-${i}`)
      .attr("startOffset", "50%")
      .attr("text-anchor", "middle")
      .text(d => {
        const key = `${d.source.name}|||${d.target.name}`;
        const ids = byLinkKey.get(key)?.refIds || [];
        return ids.join(", ");
      });
  }

  // Hover tooltip with full details
  const tooltip = d3g.select("#tooltip");
  link.on("mouseenter", function (event, d) {
      const key = `${d.source.name}|||${d.target.name}`;
      const entry = byLinkKey.get(key);
      const ids = entry?.refIds || [];
      const html = `
        <div><strong>${d.source.name}</strong> → <strong>${d.target.name}</strong></div>
        <div>Count: ${d.value}</div>
        <div>Refs: ${ids.join(', ') || '—'}</div>
      `;
      tooltip.html(html).style("opacity", 1);
    })
    .on("mousemove", function (event) {
      const [x, y] = d3g.pointer(event);
      tooltip.style("left", (x + 20) + "px").style("top", (y + 20) + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    });

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
    .append("title")
    .text(d => `${d.name}\nTotal: ${d.value || 0}`);

  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y1 + d.y0) / 2)
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.name);
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
