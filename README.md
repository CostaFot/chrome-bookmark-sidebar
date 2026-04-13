# Bookmark Sidebar

A Chrome extension that shows your bookmarks in a slide-in sidebar when you hover near the edge of the screen.

- Hover the left (or right) edge of any tab to open the sidebar
- Sidebar overlays the page — no layout shift
- Reads your existing Chrome bookmarks, syncs live when they change
- Search across all bookmarks instantly
- Fully local — no network requests, no analytics, no data leaves your browser

## Installation

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select this folder
5. Hover the left edge of any tab

## Usage

- **Hover** the left screen edge → sidebar slides in
- **Search** bookmarks using the search box at the top
- **Click** a folder to expand/collapse it
- **Click** a bookmark to open it in a new tab
- **✕** button or moving the mouse away closes the sidebar

## Configuration

Click the extension icon in Chrome's toolbar to open Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| Screen edge | Left | Which edge triggers the sidebar (Left or Right) |
| Hover delay | 300ms | How long to hover before the sidebar opens |
| Sidebar width | 320px | Width of the sidebar panel |
| Open folders by default | On | Whether folders start expanded |
| Show bookmark counts | On | Show total bookmark count badge on folders |
| Close on link click | On | Sidebar closes when you open a bookmark |

## Project structure

```
├── manifest.json               # Chrome extension manifest (MV3)
├── background/
│   └── service-worker.js       # Bookmark fetching and live change broadcast
├── content/
│   ├── bookmark-tree.js        # Recursive bookmark tree renderer
│   ├── sidebar.js              # Hover trigger, sidebar lifecycle, search
│   └── sidebar.css             # Dark theme styles (scoped, no host-page leakage)
└── options/
    ├── options.html
    ├── options.js
    └── options.css
```

No build tools, no dependencies — plain HTML, CSS, and JavaScript.

## Privacy

This extension only reads your Chrome bookmarks locally. It does not make any network requests, collect any data, or communicate with any external service. The source code is fully open for inspection.
