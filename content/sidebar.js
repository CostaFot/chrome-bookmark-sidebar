// sidebar.js — injected into every page.
// Manages the hover trigger strip, the sidebar panel, and lifecycle events.
// Depends on bookmark-tree.js being loaded first (renderBookmarkTree is in scope).

(function () {
  'use strict';

  // Guard against double-injection (e.g. if a page reloads the content script)
  if (document.getElementById('bms-root')) return;

  // ── State ──────────────────────────────────────────────────────────────────

  let settings = {
    edge: 'left',
    hoverDelay: 300,
    sidebarWidth: 320,
    openFoldersByDefault: true,
    showBookmarkCounts: true,
    closeOnLinkClick: true,
  };

  let bookmarkTree = [];
  let isOpen = false;
  let openTimer = null;
  let closeTimer = null;
  let mutationObserver = null;

  // ── DOM references (populated by injectDOM) ────────────────────────────────

  let root, sidebar, triggerStrip, treeContainer, searchInput, titleEl;

  // ── Initialization ─────────────────────────────────────────────────────────

  function init() {
    loadSettingsThenBookmarks();
    listenForMessages();
  }

  async function loadSettingsThenBookmarks() {
    // Load settings first so the sidebar is sized/positioned correctly before
    // the tree renders.
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (resp && resp.settings) settings = resp.settings;
    } catch {
      // Extension context may be invalidated on reload; ignore.
      return;
    }

    injectDOM();
    applySettings();
    watchForDOMWipe();

    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
      if (resp && resp.tree) {
        bookmarkTree = resp.tree;
        renderTree();
      }
    } catch {
      // Silently fail — sidebar will render empty.
    }
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

    // Width as CSS variable
    root.style.setProperty('--bms-width', `${settings.sidebarWidth}px`);

    const isRight = settings.edge === 'right';

    // Sidebar position
    sidebar.style.left = isRight ? 'auto' : '0';
    sidebar.style.right = isRight ? '0' : 'auto';
    sidebar.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    sidebar.classList.remove('bms-open'); // re-apply closed state for new edge

    // Box shadow direction
    sidebar.style.boxShadow = isRight
      ? '-4px 0 24px rgba(0,0,0,0.5)'
      : '4px 0 24px rgba(0,0,0,0.5)';

    // Trigger strip position
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
        a.addEventListener('click', () => {
          setTimeout(closeSidebar, 50);
        });
      });
    }
  }

  function updateTitle() {
    if (!titleEl || !bookmarkTree.length) return;
    const roots = bookmarkTree[0] && bookmarkTree[0].children
      ? bookmarkTree[0].children
      : bookmarkTree;
    let total = 0;
    for (const root of roots) {
      total += bmsCountBookmarks(root);
    }
    titleEl.textContent = `${total} Bookmark${total !== 1 ? 's' : ''}`;
  }

  function onSearchInput() {
    renderTree();
  }

  // ── Sidebar open/close ─────────────────────────────────────────────────────

  function openSidebar() {
    if (isOpen) return;
    isOpen = true;
    sidebar.classList.add('bms-open');
    // Neutralise any residual transform so CSS transition takes over cleanly
    sidebar.style.transform = '';
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    sidebar.classList.remove('bms-open');
    // Restore the off-screen transform for the active edge
    const isRight = settings.edge === 'right';
    sidebar.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    if (searchInput) searchInput.value = '';
    renderTree();
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
        renderTree();
      }

      if (message.type === 'SETTINGS_UPDATED') {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((resp) => {
          if (resp && resp.settings) {
            settings = resp.settings;
            applySettings();
            renderTree();
          }
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
        if (bookmarkTree.length) renderTree();
      }
    });
    mutationObserver.observe(document.body, { childList: true });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  init();
})();
