// bookmark-tree.js — recursive bookmark tree renderer.
// All elements are created with the `doc` parameter (the iframe's document)
// so they live in the about:blank iframe context, which has no host-page CSP.
// This means chrome.runtime.getURL('_favicon/...') works freely as img.src.

/**
 * Counts all bookmark URLs (non-folders) under a node, recursively.
 */
function bmsCountBookmarks(node) {
  if (!node.children) return 1;
  let count = 0;
  for (const child of node.children) count += bmsCountBookmarks(child);
  return count;
}

/**
 * Returns true if the node or any descendant matches the query string.
 */
function bmsNodeMatches(node, query) {
  if (node.url) {
    return (node.title || '').toLowerCase().includes(query) ||
           node.url.toLowerCase().includes(query);
  }
  return node.children?.some((c) => bmsNodeMatches(c, query)) ?? false;
}

/**
 * Renders a single BookmarkTreeNode as a DOM element.
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 * @param {string} query — lower-cased search string
 * @param {object} settings
 * @param {boolean} isTopLevel
 * @param {Document} doc — the iframe's document (no host-page CSP)
 * @returns {HTMLElement|null}
 */
function bmsRenderNode(node, query, settings, isTopLevel, doc) {
  if (query && !bmsNodeMatches(node, query)) return null;

  // ── Folder ───────────────────────────────────────────────────────────────
  if (!node.url) {
    const details = doc.createElement('details');
    details.className = 'bms-folder';
    if (isTopLevel || query || settings.openFoldersByDefault) details.open = true;

    const summary = doc.createElement('summary');

    const arrow = doc.createElement('span');
    arrow.className = 'bms-folder-icon';
    arrow.setAttribute('aria-hidden', 'true');

    const folderIcon = doc.createElement('span');
    folderIcon.className = 'bms-folder-emoji';
    folderIcon.setAttribute('aria-hidden', 'true');
    folderIcon.textContent = '📁';

    const name = doc.createElement('span');
    name.className = 'bms-folder-name';
    name.textContent = node.title || 'Bookmarks';

    summary.appendChild(arrow);
    summary.appendChild(folderIcon);
    summary.appendChild(name);

    if (settings.showBookmarkCounts && node.children) {
      const badge = doc.createElement('span');
      badge.className = 'bms-folder-count';
      badge.textContent = bmsCountBookmarks(node);
      summary.appendChild(badge);
    }

    details.appendChild(summary);

    const children = doc.createElement('div');
    children.className = 'bms-folder-children';
    for (const child of (node.children || [])) {
      const el = bmsRenderNode(child, query, settings, false, doc);
      if (el) children.appendChild(el);
    }
    details.appendChild(children);
    return details;
  }

  // ── Bookmark link ────────────────────────────────────────────────────────
  const a = doc.createElement('a');
  a.className = 'bms-bookmark';
  a.href = node.url;
  a.title = node.title || node.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const favicon = doc.createElement('img');
  favicon.className = 'bms-favicon';
  favicon.width = 16;
  favicon.height = 16;
  favicon.loading = 'lazy';

  // Running inside an extension-page iframe — chrome.runtime works freely.
  // No web_accessible_resources needed; extension pages access _favicon/ natively.
  favicon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`;
  favicon.onerror = () => {
    favicon.style.display = 'none';
    a.classList.add('bms-no-favicon');
  };

  const title = doc.createElement('span');
  title.className = 'bms-bookmark-title';
  title.textContent = node.title || node.url;

  a.appendChild(favicon);
  a.appendChild(title);
  return a;
}

/**
 * Renders the full bookmark tree into containerEl.
 * @param {chrome.bookmarks.BookmarkTreeNode[]} tree
 * @param {HTMLElement} containerEl
 * @param {string} query
 * @param {object} settings
 * @param {Document} doc — the iframe's document
 */
function renderBookmarkTree(tree, containerEl, query, settings, doc) {
  containerEl.innerHTML = '';
  const q = (query || '').trim().toLowerCase();
  const roots = tree[0]?.children ?? tree;

  for (const root of roots) {
    const el = bmsRenderNode(root, q, settings, true, doc);
    if (el) containerEl.appendChild(el);
  }

  if (q && containerEl.children.length === 0) {
    const empty = doc.createElement('div');
    empty.className = 'bms-empty';
    empty.textContent = 'No bookmarks match your search.';
    containerEl.appendChild(empty);
  }
}
