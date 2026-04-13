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

});

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
