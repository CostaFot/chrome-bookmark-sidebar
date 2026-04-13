// Background service worker — single source of truth for bookmarks and settings.
// Content scripts never call chrome.bookmarks directly; they message this worker.

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_BOOKMARKS') {
    chrome.bookmarks.getTree().then((tree) => {
      sendResponse({ tree });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_FAVICON') {
    fetchFaviconAsDataUrl(message.url).then(sendResponse);
    return true;
  }
});

// Fetches a favicon URL and returns it as a base64 data URI.
// Running in the service worker means:
//   • host_permissions bypass CORS — we can read any domain's response
//   • not subject to the host page's CSP — safe on Twitter, GitHub, etc.
async function fetchFaviconAsDataUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;
    // Strip params like "; charset=utf-8" — data URIs only accept a bare MIME type
    const mime = (res.headers.get('content-type') || 'image/x-icon').split(';')[0].trim();
    // btoa via Uint8Array — no FileReader needed in service workers
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

// ── Bookmark change listeners ────────────────────────────────────────────────

async function broadcastBookmarkUpdate() {
  let tree;
  try {
    tree = await chrome.bookmarks.getTree();
  } catch {
    return;
  }

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'BOOKMARKS_UPDATED',
      payload: { tree },
    }).catch(() => {
      // Tab may not have content script (chrome://, extension pages, etc.)
    });
  }
}

chrome.bookmarks.onCreated.addListener(broadcastBookmarkUpdate);
chrome.bookmarks.onRemoved.addListener(broadcastBookmarkUpdate);
chrome.bookmarks.onChanged.addListener(broadcastBookmarkUpdate);
chrome.bookmarks.onMoved.addListener(broadcastBookmarkUpdate);
chrome.bookmarks.onChildrenReordered.addListener(broadcastBookmarkUpdate);
chrome.bookmarks.onImportEnded.addListener(broadcastBookmarkUpdate);

// ── Settings change listener ─────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {});
    }
  });
});
