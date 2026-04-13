// bookmark-tree.js — recursive bookmark tree renderer.
// Loaded before sidebar.js; exposes renderBookmarkTree into the shared content
// script scope (no module system needed).

/**
 * Counts all bookmark URLs (non-folders) under a node, recursively.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @returns {number}
 */
function bmsCountBookmarks(node) {
  if (!node.children) return 1; // it's a URL bookmark
  let count = 0;
  for (const child of node.children) {
    count += bmsCountBookmarks(child);
  }
  return count;
}

/**
 * Returns true if the node or any of its descendants match the query.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @param {string} query — lower-cased search string
 * @returns {boolean}
 */
function bmsNodeMatches(node, query) {
  if (node.url) {
    return (
      (node.title || '').toLowerCase().includes(query) ||
      node.url.toLowerCase().includes(query)
    );
  }
  if (!node.children) return false;
  return node.children.some((child) => bmsNodeMatches(child, query));
}

/**
 * Renders a single BookmarkTreeNode as a DOM element.
 * Returns the element, or null if it should be filtered out by the query.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @param {string} query — lower-cased search string ('' means no filter)
 * @param {object} settings
 * @param {boolean} isTopLevel
 * @returns {HTMLElement|null}
 */
function bmsRenderNode(node, query, settings, isTopLevel) {
  if (query && !bmsNodeMatches(node, query)) return null;

  // ── Folder ───────────────────────────────────────────────────────────────
  if (!node.url) {
    const details = document.createElement('details');
    details.className = 'bms-folder';

    // Force open when: top-level, searching, or openFoldersByDefault
    const shouldOpen = isTopLevel || query || settings.openFoldersByDefault;
    if (shouldOpen) details.open = true;

    const summary = document.createElement('summary');

    const arrow = document.createElement('span');
    arrow.className = 'bms-folder-icon';
    arrow.setAttribute('aria-hidden', 'true');

    const folderIcon = document.createElement('span');
    folderIcon.className = 'bms-folder-emoji';
    folderIcon.setAttribute('aria-hidden', 'true');
    folderIcon.textContent = '📁';

    const name = document.createElement('span');
    name.className = 'bms-folder-name';
    name.textContent = node.title || 'Bookmarks';

    summary.appendChild(arrow);
    summary.appendChild(folderIcon);
    summary.appendChild(name);

    if (settings.showBookmarkCounts && node.children) {
      const count = bmsCountBookmarks(node);
      const badge = document.createElement('span');
      badge.className = 'bms-folder-count';
      badge.textContent = count;
      summary.appendChild(badge);
    }

    details.appendChild(summary);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'bms-folder-children';

    if (node.children) {
      for (const child of node.children) {
        const childEl = bmsRenderNode(child, query, settings, false);
        if (childEl) childrenContainer.appendChild(childEl);
      }
    }

    details.appendChild(childrenContainer);
    return details;
  }

  // ── Bookmark link ────────────────────────────────────────────────────────
  const a = document.createElement('a');
  a.className = 'bms-bookmark';
  a.href = node.url;
  a.title = node.title || node.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const favicon = document.createElement('img');
  favicon.className = 'bms-favicon';
  favicon.width = 16;
  favicon.height = 16;
  favicon.loading = 'lazy';
  favicon.dataset.faviconUrl = node.url;
  favicon.style.display = 'none'; // hidden until loaded by loadFavicons()

  // Show emoji fallback while the real favicon loads
  a.classList.add('bms-no-favicon');

  const title = document.createElement('span');
  title.className = 'bms-bookmark-title';
  title.textContent = node.title || node.url;

  a.appendChild(favicon);
  a.appendChild(title);
  return a;
}

/**
 * Renders the full bookmark tree into containerEl.
 * @param {chrome.bookmarks.BookmarkTreeNode[]} tree — result of chrome.bookmarks.getTree()
 * @param {HTMLElement} containerEl
 * @param {string} query — search query string ('' means show all)
 * @param {object} settings
 */
function renderBookmarkTree(tree, containerEl, query, settings) {
  containerEl.innerHTML = '';
  const q = (query || '').trim().toLowerCase();

  // Chrome's getTree() returns a single synthetic root node (id "0").
  // Its children are the real top-level folders: Bookmarks Bar, Other Bookmarks, etc.
  const roots = (tree[0] && tree[0].children) ? tree[0].children : tree;

  if (q) {
    // Search mode: show a flat search-results style with folder context
    for (const root of roots) {
      const el = bmsRenderNode(root, q, settings, true);
      if (el) containerEl.appendChild(el);
    }

    if (containerEl.children.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bms-empty';
      empty.textContent = 'No bookmarks match your search.';
      containerEl.appendChild(empty);
    }
  } else {
    // Normal mode: render each top-level folder
    for (const root of roots) {
      const el = bmsRenderNode(root, '', settings, true);
      if (el) containerEl.appendChild(el);
    }
  }
}

/**
 * Fetches real favicons for all bookmark links in the container via the
 * background service worker (which has extension context to access _favicon/).
 * Results are cached in faviconCache (Map<url, dataUrl|null>) to avoid
 * redundant fetches across re-renders.
 * @param {HTMLElement} container
 * @param {Map<string, string|null>} faviconCache
 */
async function loadFavicons(container, faviconCache) {
  const imgs = Array.from(container.querySelectorAll('img.bms-favicon[data-favicon-url]'));
  if (!imgs.length) return;

  // Group img elements by URL so duplicate bookmarks share one fetch
  const urlToImgs = new Map();
  for (const img of imgs) {
    const url = img.dataset.faviconUrl;
    if (!urlToImgs.has(url)) urlToImgs.set(url, []);
    urlToImgs.get(url).push(img);
  }

  await Promise.all([...urlToImgs.entries()].map(async ([url, imgEls]) => {
    // Use cached result if available
    let dataUrl = faviconCache.has(url) ? faviconCache.get(url) : undefined;

    if (dataUrl === undefined) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_FAVICON', url });
        dataUrl = resp && resp.dataUrl ? resp.dataUrl : null;
      } catch {
        dataUrl = null;
      }
      faviconCache.set(url, dataUrl);
    }

    for (const img of imgEls) {
      const link = img.closest('.bms-bookmark');
      if (dataUrl) {
        img.src = dataUrl;
        img.style.display = '';
        link?.classList.remove('bms-no-favicon');
      }
      // If null, leave the emoji fallback in place (bms-no-favicon stays)
    }
  }));
}
