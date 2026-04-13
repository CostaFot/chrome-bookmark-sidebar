// options.js — loads and saves settings via chrome.storage.sync.

const DEFAULTS = {
  edge: 'left',
  hoverDelay: 300,
  sidebarWidth: 320,
  openFoldersByDefault: true,
  showBookmarkCounts: true,
  closeOnLinkClick: true,
};

const form = document.getElementById('settings-form');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const statusMsg = document.getElementById('status-msg');

let statusTimer = null;

function showStatus(msg, isError = false) {
  clearTimeout(statusTimer);
  statusMsg.textContent = msg;
  statusMsg.className = 'status-msg ' + (isError ? 'error' : 'success');
  statusTimer = setTimeout(() => {
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';
  }, 2500);
}

function populateForm(settings) {
  // Edge radio
  const edgeRadios = form.querySelectorAll('input[name="edge"]');
  edgeRadios.forEach((radio) => {
    radio.checked = radio.value === settings.edge;
  });

  form.hoverDelay.value = settings.hoverDelay;
  form.sidebarWidth.value = settings.sidebarWidth;
  form.openFoldersByDefault.checked = settings.openFoldersByDefault;
  form.showBookmarkCounts.checked = settings.showBookmarkCounts;
  form.closeOnLinkClick.checked = settings.closeOnLinkClick;
}

function readForm() {
  const edgeRadio = form.querySelector('input[name="edge"]:checked');
  return {
    edge: edgeRadio ? edgeRadio.value : 'left',
    hoverDelay: Math.max(0, Math.min(2000, parseInt(form.hoverDelay.value, 10) || 0)),
    sidebarWidth: Math.max(150, Math.min(800, parseInt(form.sidebarWidth.value, 10) || 320)),
    openFoldersByDefault: form.openFoldersByDefault.checked,
    showBookmarkCounts: form.showBookmarkCounts.checked,
    closeOnLinkClick: form.closeOnLinkClick.checked,
  };
}

// Load saved settings on page open
chrome.storage.sync.get(DEFAULTS).then((settings) => {
  populateForm(settings);
});

// Save
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const newSettings = readForm();
  chrome.storage.sync.set(newSettings).then(() => {
    showStatus('Settings saved.');
  }).catch(() => {
    showStatus('Failed to save settings.', true);
  });
});

// Reset
resetBtn.addEventListener('click', () => {
  chrome.storage.sync.set(DEFAULTS).then(() => {
    populateForm(DEFAULTS);
    showStatus('Reset to defaults.');
  }).catch(() => {
    showStatus('Failed to reset settings.', true);
  });
});
