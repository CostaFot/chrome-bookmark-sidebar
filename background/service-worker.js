// Background service worker — single source of truth for bookmarks and settings.
// Content scripts never call chrome.bookmarks directly; they message this worker.

const DEFAULT_SETTINGS = {
  edge: 'left',
  hoverDelay: 300,
  sidebarWidth: 320,
  openFoldersByDefault: true,
  showBookmarkCounts: true,
  closeOnLinkClick: true,
};

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_BOOKMARKS') {
    chrome.bookmarks.getTree().then((tree) => {
      sendResponse({ tree });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(DEFAULT_SETTINGS).then((settings) => {
      sendResponse({ settings });
    });
    return true;
  }

  if (message.type === 'GET_FAVICON') {
    fetchFaviconDataUrl(message.url).then(sendResponse);
    return true;
  }
});

async function fetchFaviconDataUrl(pageUrl) {
  try {
    const faviconUrl = chrome.runtime.getURL(
      `_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=16`
    );
    const response = await fetch(faviconUrl);
    if (!response.ok) return { dataUrl: null };

    const blob = await response.blob();
    // Service workers don't have FileReader; convert blob → base64 via ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return { dataUrl: `data:${blob.type};base64,${btoa(binary)}` };
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
