# Bookmark Sidebar

A Chrome extension that shows your bookmarks in a slide-in sidebar when you hover near the edge of the screen.

- Hover the left (or right) edge of any tab to open the sidebar
- Sidebar overlays the page — no layout shift
- Real favicons from Chrome's internal cache
- Reads your existing Chrome bookmarks, syncs live when they change
- Search across all bookmarks instantly
- Fully local — no network requests, no analytics, no data leaves your browser

## Installation

### From a release (easiest)

1. Go to [Releases](../../releases) and download the latest `chrome-bookmark-sidebar-vX.X.zip`
2. Extract the zip
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (toggle in the top right)
5. Click **Load unpacked** and select the extracted folder
6. Hover the left edge of any tab

### From source

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select the repo folder

## Usage

- **Hover** the left (or right) screen edge → sidebar slides in after a short delay
- **Search** bookmarks using the search box at the top
- **Click** a folder to expand/collapse it
- **Click** a bookmark to open it in a new tab
- **✕** button or moving the mouse away closes the sidebar

## Configuration

Click the extension icon in Chrome's toolbar to open Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| Screen edge | Left | Which edge triggers the sidebar (Left or Right) |
| Hover delay | 300 ms | How long to hover before the sidebar opens |
| Sidebar width | 320 px | Width of the sidebar panel |
| Open folders by default | On | Whether folders start expanded |
| Show bookmark counts | On | Show total bookmark count badge on folders |
| Close on link click | On | Sidebar closes when you open a bookmark |

## Project structure

```
├── manifest.json               # Chrome extension manifest (MV3)
├── background/
│   └── service-worker.js       # Bookmark change broadcast to all tabs
├── content/
│   ├── sidebar.js              # Hover trigger, iframe injection, open/close logic
│   ├── sidebar-frame.html      # Extension-page iframe (full chrome.* API access)
│   ├── sidebar-frame.js        # Bookmark tree, search, live updates inside iframe
│   ├── bookmark-tree.js        # Recursive <details>/<a> tree renderer
│   └── sidebar.css             # Dark theme styles (scoped under #bms-root)
└── options/
    ├── options.html
    ├── options.js
    └── options.css
```

No build tools, no npm, no dependencies — plain HTML, CSS, and JavaScript.

## How favicons work

The sidebar renders inside an extension-page `<iframe>` (`sidebar-frame.html`). Because it is a real extension page it has full access to Chrome's internal `_favicon/` endpoint, which serves cached site icons at 16 × 16 px with no external network requests.

## Privacy

This extension only reads your Chrome bookmarks locally. It makes no external network requests, collects no data, and communicates with no third-party service. The source code is fully open for inspection.
