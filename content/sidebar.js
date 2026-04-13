// sidebar.js — injected into every page.
// Injects a hover trigger strip and an extension-page iframe sidebar.
// The iframe loads content/sidebar-frame.html — a real extension page —
// so chrome.* APIs and _favicon/ URLs work freely inside it without any
// web_accessible_resources tricks.

(function () {
  'use strict';

  if (document.getElementById('bms-root')) return;

  // ── State ──────────────────────────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    edge: 'left',
    hoverDelay: 300,
    sidebarWidth: 320,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let isOpen = false;
  let openTimer = null;
  let closeTimer = null;

  let root, frame, triggerStrip;

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    if (!chrome.runtime?.id) return;
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

  // ── DOM injection ──────────────────────────────────────────────────────────

  function injectDOM() {
    if (!chrome.runtime?.id) return;

    root = document.createElement('div');
    root.id = 'bms-root';
    root.style.cssText = 'all:unset;display:block;pointer-events:none;';

    // Hover trigger strip (10 px edge zone)
    triggerStrip = document.createElement('div');
    triggerStrip.id = 'bms-trigger-strip';
    triggerStrip.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:10px', 'height:100vh',
      'z-index:2147483646', 'background:transparent', 'pointer-events:auto',
    ].join(';');

    // Sidebar iframe — loads the extension page so chrome.* APIs work freely
    frame = document.createElement('iframe');
    frame.id = 'bms-sidebar-frame';
    frame.setAttribute('aria-label', 'Bookmark Sidebar');
    frame.src = chrome.runtime.getURL('content/sidebar-frame.html');
    frame.style.cssText = [
      'position:fixed', 'top:0', 'left:0',
      'width:320px', 'height:100vh',
      'border:none', 'z-index:2147483645',
      'box-shadow:4px 0 24px rgba(0,0,0,.5)',
      'transition:transform 200ms ease-in-out',
      'transform:translateX(-100%)',
      'pointer-events:auto',
    ].join(';');

    root.appendChild(triggerStrip);
    root.appendChild(frame);
    document.body.appendChild(root);

    // Receive close signal from iframe
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'BMS_CLOSE') closeSidebar();
    });

    triggerStrip.addEventListener('mouseenter', onStripEnter);
    triggerStrip.addEventListener('mouseleave', onStripLeave);
    frame.addEventListener('mouseenter', onSidebarEnter);
    frame.addEventListener('mouseleave', onSidebarLeave);
  }

  // ── Settings application ───────────────────────────────────────────────────

  function applySettings() {
    if (!frame) return;
    const isRight = settings.edge === 'right';

    frame.style.width = `${settings.sidebarWidth}px`;
    frame.style.left  = isRight ? 'auto' : '0';
    frame.style.right = isRight ? '0' : 'auto';
    frame.style.transform  = isRight ? 'translateX(100%)' : 'translateX(-100%)';
    frame.style.boxShadow  = isRight
      ? '-4px 0 24px rgba(0,0,0,.5)'
      : '4px 0 24px rgba(0,0,0,.5)';

    triggerStrip.style.left  = isRight ? 'auto' : '0';
    triggerStrip.style.right = isRight ? '0'    : 'auto';

    isOpen = false;
  }

  // ── Open / close ───────────────────────────────────────────────────────────

  function openSidebar() {
    if (isOpen) return;
    isOpen = true;
    frame.contentWindow?.postMessage({ type: 'BMS_OPEN' }, '*');
    frame.style.transform = 'translateX(0)';
  }

  function closeSidebar() {
    if (!isOpen) return;
    isOpen = false;
    const isRight = settings.edge === 'right';
    frame.style.transform = isRight ? 'translateX(100%)' : 'translateX(-100%)';
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
      if (message.type === 'SETTINGS_UPDATED') {
        chrome.storage.sync.get(DEFAULT_SETTINGS).then((s) => {
          settings = s;
          applySettings();
        }).catch(() => {});
      }
    });
  }

  // ── SPA guard ──────────────────────────────────────────────────────────────

  function watchForDOMWipe() {
    const observer = new MutationObserver(() => {
      if (!document.getElementById('bms-root')) {
        injectDOM();
        applySettings();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  init();
})();
