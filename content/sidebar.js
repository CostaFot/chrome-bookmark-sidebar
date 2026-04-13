// sidebar.js — injected into every page.
// The sidebar panel is rendered inside an about:blank iframe so it has no
// host-page CSP. This lets _favicon/ URLs work freely as img.src inside it.
// The trigger strip is a plain div in the main page (no images, no CSP concern).

(function () {
  'use strict';

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
  let bookmarksLoaded = false;
  let isOpen = false;
  let openTimer = null;
  let closeTimer = null;
  let mutationObserver = null;

  // ── DOM references ─────────────────────────────────────────────────────────

  // Main page elements
  let root, frame, triggerStrip;
  // Elements inside the iframe's document
  let iframeDoc, treeContainer, searchInput, titleEl;

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    try {
      settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    } catch {
      return;
    }
    injectDOM();
    applySettings();
    listenForMessages();
    watchForDOMWipe();
  }

  // ── Lazy bookmark load ─────────────────────────────────────────────────────

  async function ensureBookmarksLoaded() {
    if (bookmarksLoaded) return;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' });
      if (resp && resp.tree) bookmarkTree = resp.tree;
    } catch { /* leave empty */ }
    bookmarksLoaded = true;
  }

  // ── DOM injection ──────────────────────────────────────────────────────────

  function injectDOM() {
    // Wrapper in the main page (just for cleanup / mutation watching)
    root = document.createElement('div');
    root.id = 'bms-root';
    root.style.cssText = 'all:unset;display:block;pointer-events:none;';

    // ── Trigger strip (main page) ──────────────────────────────────────────
    triggerStrip = document.createElement('div');
    triggerStrip.id = 'bms-trigger-strip';
    triggerStrip.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:10px', 'height:100vh',
      'z-index:2147483646', 'background:transparent', 'pointer-events:auto',
    ].join(';');

    // ── Sidebar iframe (about:blank — no host-page CSP) ────────────────────
    frame = document.createElement('iframe');
    frame.id = 'bms-sidebar-frame';
    frame.setAttribute('aria-label', 'Bookmark Sidebar');
    frame.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:var(--bms-width,320px)', 'height:100vh',
      'border:none', 'z-index:2147483645',
      'box-shadow:4px 0 24px rgba(0,0,0,.5)',
      'transition:transform 200ms ease-in-out',
      'transform:translateX(-100%)',
      'pointer-events:auto',
    ].join(';');

    root.appendChild(triggerStrip);
    root.appendChild(frame);
    document.body.appendChild(root);

    // Write structure into the iframe's own document (no host CSP applies here)
    iframeDoc = frame.contentDocument;
    iframeDoc.open();
    iframeDoc.write('<!DOCTYPE html><html><head></head><body></body></html>');
    iframeDoc.close();

    // Inject CSS from the extension (web_accessible_resources makes this available)
    // Guard: chrome.runtime.id is falsy when the extension context is invalidated
    if (chrome.runtime?.id) {
      const link = iframeDoc.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/sidebar.css');
      iframeDoc.head.appendChild(link);
    }

    // Body resets for iframe context
    iframeDoc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;height:100vh;';

    // Root wrapper — CSS is scoped under #bms-root so this must exist in the iframe
    const iframeRoot = iframeDoc.createElement('div');
    iframeRoot.id = 'bms-root';
    iframeRoot.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;';
    iframeDoc.body.appendChild(iframeRoot);

    // ── Header ─────────────────────────────────────────────────────────────
    const header = iframeDoc.createElement('div');
    header.id = 'bms-header';

    titleEl = iframeDoc.createElement('span');
    titleEl.id = 'bms-title';
    titleEl.textContent = 'Bookmarks';

    const closeBtn = iframeDoc.createElement('button');
    closeBtn.id = 'bms-close';
    closeBtn.setAttribute('aria-label', 'Close sidebar');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeSidebar);

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // ── Search ─────────────────────────────────────────────────────────────
    const searchWrapper = iframeDoc.createElement('div');
    searchWrapper.id = 'bms-search-wrapper';

    const searchIcon = iframeDoc.createElement('span');
    searchIcon.id = 'bms-search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    searchIcon.textContent = '🔍';

    searchInput = iframeDoc.createElement('input');
    searchInput.id = 'bms-search';
    searchInput.type = 'search';
    searchInput.placeholder = 'Search bookmarks…';
    searchInput.setAttribute('aria-label', 'Search bookmarks');
    searchInput.addEventListener('input', onSearchInput);

    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);

    // ── Tree container ─────────────────────────────────────────────────────
    treeContainer = iframeDoc.createElement('div');
    treeContainer.id = 'bms-tree-container';

    iframeRoot.appendChild(header);
    iframeRoot.appendChild(searchWrapper);
    iframeRoot.appendChild(treeContainer);

    // Mouse events — listened on the iframe element from the parent page
    triggerStrip.addEventListener('mouseenter', onStripEnter);
    triggerStrip.addEventListener('mouseleave', onStripLeave);
    frame.addEventListener('mouseenter', onSidebarEnter);
    frame.addEventListener('mouseleave', onSidebarLeave);
  }

  // ── Settings application ───────────────────────────────────────────────────

  function applySettings() {
    if (!frame) return;
    const isRight = settings.edge === 'right';

    frame.style.setProperty('--bms-width', `${settings.sidebarWidth}px`);
    frame.style.width = `${settings.sidebarWidth}px`;
    frame.style.left = isRight ? 'auto' : '0';
    frame.style.right = isRight ? '0' : 'auto';
    frame.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    frame.style.boxShadow = isRight
      ? '-4px 0 24px rgba(0,0,0,.5)'
      : '4px 0 24px rgba(0,0,0,.5)';

    triggerStrip.style.left = isRight ? 'auto' : '0';
    triggerStrip.style.right = isRight ? '0' : 'auto';

    isOpen = false;
  }

  // ── Tree rendering ─────────────────────────────────────────────────────────

  function renderTree() {
    if (!treeContainer) return;
    const query = searchInput ? searchInput.value : '';
    renderBookmarkTree(bookmarkTree, treeContainer, query, settings, iframeDoc);
    updateTitle();

    if (settings.closeOnLinkClick) {
      treeContainer.querySelectorAll('.bms-bookmark').forEach((a) => {
        a.addEventListener('click', () => setTimeout(closeSidebar, 50));
      });
    }
  }

  function updateTitle() {
    if (!titleEl) return;
    if (!bookmarkTree.length) { titleEl.textContent = 'Bookmarks'; return; }
    const roots = bookmarkTree[0]?.children ?? bookmarkTree;
    let total = 0;
    for (const r of roots) total += bmsCountBookmarks(r);
    titleEl.textContent = `${total} Bookmark${total !== 1 ? 's' : ''}`;
  }

  function onSearchInput() { renderTree(); }

  // ── Open / close ───────────────────────────────────────────────────────────

  async function openSidebar() {
    if (isOpen) return;
    isOpen = true;
    await ensureBookmarksLoaded();
    renderTree();
    frame.style.transform = 'translateX(0)';
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    const isRight = settings.edge === 'right';
    frame.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
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

  // ── Messages ───────────────────────────────────────────────────────────────

  function listenForMessages() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'BOOKMARKS_UPDATED' && message.payload?.tree) {
        bookmarkTree = message.payload.tree;
        bookmarksLoaded = true;
        if (isOpen) renderTree();
      }
      if (message.type === 'SETTINGS_UPDATED') {
        chrome.storage.sync.get(DEFAULT_SETTINGS).then((s) => {
          settings = s;
          applySettings();
          if (isOpen) renderTree();
        }).catch(() => {});
      }
    });
  }

  // ── SPA guard ──────────────────────────────────────────────────────────────

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

  init();
})();
