// sidebar.js — injected into every page.
// Manages the hover trigger strip, the sidebar panel, and lifecycle events.
// Depends on bookmark-tree.js being loaded first (renderBookmarkTree is in scope).

(function () {
  'use strict';

  // Guard against double-injection (e.g. if a page reloads the content script)
  if (document.getElementById('bms-root')) return;

  // ── State ──────────────────────────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    edge: 'left',
    hoverDelay: 300,
    sidebarWidth: 320,
    openFoldersByDefault: true,
    showBookmarkCounts: true,
    closeOnLinkClick: true,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let bookmarkTree = [];
  let bookmarksLoaded = false; // deferred until first sidebar open
  let isOpen = false;
  let openTimer = null;
  let closeTimer = null;
  let mutationObserver = null;

  // ── DOM references (populated by injectDOM) ────────────────────────────────

  let root, sidebar, triggerStrip, treeContainer, searchInput, titleEl;

  // ── Initialization ─────────────────────────────────────────────────────────
  // On page load: only read settings (direct storage call, no background
  // message) and inject the trigger strip. Bookmarks are fetched lazily on
  // first sidebar open.

  async function init() {
    try {
      settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    } catch {
      // Extension context invalidated (e.g. during reload) — bail out.
      return;
    }

    injectDOM();
    applySettings();
    listenForMessages();
    watchForDOMWipe();
  }

  // ── Lazy bookmark loading ──────────────────────────────────────────────────

  async function ensureBookmarksLoaded() {
    if (bookmarksLoaded) return;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
      if (resp && resp.tree) bookmarkTree = resp.tree;
    } catch {
      // Leave bookmarkTree empty; sidebar renders blank.
    }
    bookmarksLoaded = true;
  }

  // ── DOM injection ──────────────────────────────────────────────────────────

  function injectDOM() {
    root = document.createElement('div');
    root.id = 'bms-root';

    // Sidebar panel
    sidebar = document.createElement('div');
    sidebar.id = 'bms-sidebar';
    sidebar.setAttribute('role', 'complementary');
    sidebar.setAttribute('aria-label', 'Bookmark Sidebar');

    // Header
    const header = document.createElement('div');
    header.id = 'bms-header';

    titleEl = document.createElement('span');
    titleEl.id = 'bms-title';
    titleEl.textContent = 'Bookmarks';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'bms-close';
    closeBtn.setAttribute('aria-label', 'Close sidebar');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeSidebar);

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // Search
    const searchWrapper = document.createElement('div');
    searchWrapper.id = 'bms-search-wrapper';

    const searchIcon = document.createElement('span');
    searchIcon.id = 'bms-search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    searchIcon.textContent = '🔍';

    searchInput = document.createElement('input');
    searchInput.id = 'bms-search';
    searchInput.type = 'search';
    searchInput.placeholder = 'Search bookmarks…';
    searchInput.setAttribute('aria-label', 'Search bookmarks');
    searchInput.addEventListener('input', onSearchInput);

    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);

    // Tree container
    treeContainer = document.createElement('div');
    treeContainer.id = 'bms-tree-container';

    sidebar.appendChild(header);
    sidebar.appendChild(searchWrapper);
    sidebar.appendChild(treeContainer);

    // Trigger strip
    triggerStrip = document.createElement('div');
    triggerStrip.id = 'bms-trigger-strip';
    triggerStrip.setAttribute('aria-hidden', 'true');

    root.appendChild(sidebar);
    root.appendChild(triggerStrip);

    document.body.appendChild(root);

    // Event listeners
    triggerStrip.addEventListener('mouseenter', onStripEnter);
    triggerStrip.addEventListener('mouseleave', onStripLeave);
    sidebar.addEventListener('mouseenter', onSidebarEnter);
    sidebar.addEventListener('mouseleave', onSidebarLeave);
  }

  // ── Settings application ───────────────────────────────────────────────────

  function applySettings() {
    if (!root) return;

    root.style.setProperty('--bms-width', `${settings.sidebarWidth}px`);

    const isRight = settings.edge === 'right';

    sidebar.style.left = isRight ? 'auto' : '0';
    sidebar.style.right = isRight ? '0' : 'auto';
    sidebar.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    sidebar.classList.remove('bms-open');

    sidebar.style.boxShadow = isRight
      ? '-4px 0 24px rgba(0,0,0,0.5)'
      : '4px 0 24px rgba(0,0,0,0.5)';

    triggerStrip.style.left = isRight ? 'auto' : '0';
    triggerStrip.style.right = isRight ? '0' : 'auto';

    isOpen = false;
  }

  // ── Tree rendering ─────────────────────────────────────────────────────────

  function renderTree() {
    if (!treeContainer) return;
    const query = searchInput ? searchInput.value : '';
    renderBookmarkTree(bookmarkTree, treeContainer, query, settings);
    updateTitle();

    if (settings.closeOnLinkClick) {
      treeContainer.querySelectorAll('.bms-bookmark').forEach((a) => {
        a.addEventListener('click', () => setTimeout(closeSidebar, 50));
      });
    }
  }

  function updateTitle() {
    if (!titleEl) return;
    if (!bookmarkTree.length) {
      titleEl.textContent = 'Bookmarks';
      return;
    }
    const roots = bookmarkTree[0] && bookmarkTree[0].children
      ? bookmarkTree[0].children
      : bookmarkTree;
    let total = 0;
    for (const r of roots) total += bmsCountBookmarks(r);
    titleEl.textContent = `${total} Bookmark${total !== 1 ? 's' : ''}`;
  }

  function onSearchInput() {
    renderTree();
  }

  // ── Sidebar open/close ─────────────────────────────────────────────────────

  async function openSidebar() {
    if (isOpen) return;
    isOpen = true;

    // Fetch bookmarks on first open only
    await ensureBookmarksLoaded();
    renderTree();

    sidebar.classList.add('bms-open');
    sidebar.style.transform = '';
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    sidebar.classList.remove('bms-open');
    const isRight = settings.edge === 'right';
    sidebar.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    if (searchInput) searchInput.value = '';
  }

  // ── Hover logic ────────────────────────────────────────────────────────────

  function onStripEnter() {
    clearTimeout(closeTimer);
    if (isOpen) return;
    openTimer = setTimeout(openSidebar, settings.hoverDelay);
  }

  function onStripLeave() {
    clearTimeout(openTimer);
    if (!isOpen) return;
    closeTimer = setTimeout(closeSidebar, 300);
  }

  function onSidebarEnter() {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
  }

  function onSidebarLeave() {
    if (!isOpen) return;
    closeTimer = setTimeout(closeSidebar, 300);
  }

  // ── Message listener ───────────────────────────────────────────────────────

  function listenForMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'BOOKMARKS_UPDATED' && message.payload && message.payload.tree) {
        bookmarkTree = message.payload.tree;
        bookmarksLoaded = true;
        // Only re-render if the sidebar is currently visible
        if (isOpen) renderTree();
      }

      if (message.type === 'SETTINGS_UPDATED') {
        // Read updated settings directly from storage — no background round-trip
        chrome.storage.sync.get(DEFAULT_SETTINGS).then((s) => {
          settings = s;
          applySettings();
          if (isOpen) renderTree();
        }).catch(() => {});
      }
    });
  }

  // ── SPA guard — re-inject if body wipes #bms-root ─────────────────────────

  function watchForDOMWipe() {
    mutationObserver = new MutationObserver(() => {
      if (!document.getElementById('bms-root')) {
        injectDOM();
        applySettings();
        if (bookmarksLoaded) renderTree();
      }
    });
    mutationObserver.observe(document.body, { childList: true });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  init();
})();
