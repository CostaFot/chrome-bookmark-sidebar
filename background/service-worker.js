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
    // Fetch from the service worker — not subject to the host page's CSP.
    // Returns a data URI so content scripts can set img.src on any page.
    fetchFaviconDataUrl(message.faviconUrl).then(sendResponse);
    return true;
  }
});

async function fetchFaviconDataUrl(faviconUrl) {
  try {
    const response = await fetch(faviconUrl, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { dataUrl: null };
    const blob = await response.blob();
    if (!blob.size) return { dataUrl: null };

    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return { dataUrl: `data:${blob.type || 'image/x-icon'};base64,${btoa(binary)}` };
  } catch {
    return { dataUrl: null };
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
