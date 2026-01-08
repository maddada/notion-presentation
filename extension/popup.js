const statusEl = document.getElementById('status');
const enableToggle = document.getElementById('enableToggle');
const reloadBtn = document.getElementById('reloadBtn');

let currentTabId = null;
let isNotionPage = false;

// Check current tab and status
async function checkStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;

    // Check if this is a Notion page
    if (!tab.url || (!tab.url.includes('notion.so') && !tab.url.includes('notion.site'))) {
      statusEl.textContent = 'Not a Notion page';
      statusEl.className = 'status error';
      reloadBtn.disabled = true;
      reloadBtn.classList.add('disabled');
      isNotionPage = false;
      return;
    }

    isNotionPage = true;

    // Check if script is injected
    const isInjected = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'checkInjected', tabId: currentTabId }, resolve);
    });

    if (isInjected) {
      statusEl.textContent = 'Active on this page';
      statusEl.className = 'status active';
    } else {
      statusEl.textContent = 'Not active on this page';
      statusEl.className = 'status inactive';
    }

    reloadBtn.disabled = false;
    reloadBtn.classList.remove('disabled');

  } catch (err) {
    statusEl.textContent = 'Cannot access page';
    statusEl.className = 'status error';
    reloadBtn.disabled = true;
    reloadBtn.classList.add('disabled');
  }
}

// Load saved enabled state
async function loadEnabledState() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  enableToggle.checked = enabled;
}

// Handle toggle change
enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;

  // Save state
  await chrome.storage.local.set({ enabled });

  if (!isNotionPage || !currentTabId) return;

  if (enabled) {
    // Inject script
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'inject', tabId: currentTabId }, resolve);
    });
  } else {
    // Remove script
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'remove', tabId: currentTabId }, resolve);
    });
  }

  // Update status
  checkStatus();
});

// Handle reload button
reloadBtn.addEventListener('click', async () => {
  if (!isNotionPage || !currentTabId || reloadBtn.disabled) return;

  reloadBtn.disabled = true;
  statusEl.textContent = 'Reloading...';

  await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'reload', tabId: currentTabId }, resolve);
  });

  // Small delay for UI feedback
  setTimeout(() => {
    checkStatus();
    reloadBtn.disabled = false;
  }, 300);
});

// Initialize
loadEnabledState();
checkStatus();
