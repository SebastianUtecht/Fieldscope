# BioVisualizer

Interactive, client-side web app to visualize how papers connect between any two categories (columns) using a directed bipartite (Sankey) diagram. Designed to be hosted on GitHub Pages.

## Features

- Load an Excel file (`.xlsx`) directly in the browser (no server)
- Pick any two columns as Source and Target
- Directed bipartite visualization with minimal crossings (Sankey layout)
- Edge thickness and color reflect frequency (more common pairs are more prominent)
- Toggle to show reference numbers on edges
- Reference list at the bottom with stable numbering (1..M)

## Getting started

1. Place your Excel file at the repository root as `init_data.xlsx` (recommended) or click the file picker in the app to upload and view locally.
2. Open the app:
   - Via GitHub Pages (recommended): enable Pages (see below) and visit your site URL
   - Locally: open `index.html` in a modern browser (Chrome, Edge, Firefox)

When the app loads, it will automatically try to fetch `./init_data.xlsx`. If it's not found, use the file input to upload a dataset.

### Data format

- The first row is treated as the header
- Each subsequent row is one paper
- Columns can be anything (e.g., `Method`, `Question`, `Title`, `Authors`, `Year`)
- You will select any two columns as Source and Target when rendering

## GitHub Pages setup

1. Push this repository to GitHub
2. In your repo, go to Settings → Pages
3. Under "Build and deployment", set Source to `Deploy from a branch`
4. Choose the `main` branch, folder `/ (root)`, then Save
5. In a minute, your site will be published at `https://<your-username>.github.io/<repo-name>/`

If you later update `init_data.xlsx`, GitHub Pages will serve the latest file after the next commit is deployed.

## Usage tips

- Use the dropdowns to choose Source and Target columns. The Sankey diagram will update accordingly.
- Toggle "Show reference numbers on edges" to display which paper IDs contribute to each link.
- Hover an edge to see a tooltip with the pair, count, and reference numbers.
- The reference list at the bottom shows the mapping of paper ID → row (using best-effort fields like Title / Authors / Year if present).

## Known limitations

- Very long reference-number labels on edges can get crowded. Use hover tooltips or keep the toggle off when many papers map to one link.
- This app runs fully client-side. Large files (e.g., >10k rows) may render more slowly depending on your device.

## Development

No build tools required. All dependencies are loaded from CDNs.

- `index.html` — entry page and controls
- `styles.css` — styling
- `src/main.js` — data loading, controls wiring, and orchestration
- `src/sankeyGraph.js` — D3 Sankey rendering

You can serve locally with any static server, or simply open `index.html`.
