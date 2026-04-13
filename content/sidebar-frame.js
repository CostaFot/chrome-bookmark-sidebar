// sidebar-frame.js — runs inside the extension-page iframe.
// This is a real extension page so chrome.* APIs and _favicon/ URLs work freely.

(async () => {
  'use strict';

  const DEFAULT_SETTINGS = {
    openFoldersByDefault: true,
    showBookmarkCounts: true,
    closeOnLinkClick: true,
    theme: 'mocha',
  };

  let settings = { ...DEFAULT_SETTINGS };
  let bookmarkTree = [];

  const treeContainer = document.getElementById('bms-tree-container');
  const searchInput   = document.getElementById('bms-search');
  const titleEl       = document.getElementById('bms-title');
  const closeBtn      = document.getElementById('bms-close');

  // ── Init ────────────────────────────────────────────────────────────────────

  try {
    settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    bookmarkTree = await chrome.bookmarks.getTree();
  } catch { /* stay with defaults */ }

  applyTheme();
  renderTree();

  // ── Theme ───────────────────────────────────────────────────────────────────

  function applyTheme() {
    const root = document.getElementById('bms-root');
    if (!root) return;
    root.dataset.theme = settings.theme || 'mocha';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderTree() {
    const query = searchInput?.value ?? '';
    renderBookmarkTree(bookmarkTree, treeContainer, query, settings, document);
    updateTitle();

    if (settings.closeOnLinkClick) {
      treeContainer.querySelectorAll('.bms-bookmark').forEach((a) => {
        a.addEventListener('click', () => {
          window.parent.postMessage({ type: 'BMS_CLOSE' }, '*');
        });
      });
    }
  }

  function updateTitle() {
    if (!titleEl) return;
    const roots = bookmarkTree[0]?.children ?? bookmarkTree;
    let total = 0;
    for (const r of roots) total += bmsCountBookmarks(r);
    titleEl.textContent = `${total} Bookmark${total !== 1 ? 's' : ''}`;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  searchInput?.addEventListener('input', renderTree);

  // ── Close button ─────────────────────────────────────────────────────────────

  closeBtn?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'BMS_CLOSE' }, '*');
  });

  // ── Messages from parent content script ─────────────────────────────────────

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'BMS_OPEN') {
      // Clear search on each open
      if (searchInput) searchInput.value = '';
      renderTree();
    }
  });

  // ── Live bookmark updates (direct listener — no background relay needed) ─────

  async function reloadBookmarks() {
    try {
      bookmarkTree = await chrome.bookmarks.getTree();
      renderTree();
    } catch { /* ignore */ }
  }

  chrome.bookmarks.onCreated.addListener(reloadBookmarks);
  chrome.bookmarks.onRemoved.addListener(reloadBookmarks);
  chrome.bookmarks.onChanged.addListener(reloadBookmarks);
  chrome.bookmarks.onMoved.addListener(reloadBookmarks);
  chrome.bookmarks.onChildrenReordered?.addListener(reloadBookmarks);
  chrome.bookmarks.onImportEnded.addListener(reloadBookmarks);

  // ── Live settings updates ────────────────────────────────────────────────────

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get(DEFAULT_SETTINGS).then((s) => {
      settings = s;
      applyTheme();
      renderTree();
    }).catch(() => {});
  });
})();
