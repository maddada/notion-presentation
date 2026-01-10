const statusEl = document.getElementById('status');
const enableToggle = document.getElementById('enableToggle');
const focusModeToggle = document.getElementById('focusModeToggle');
const focusCountRow = document.getElementById('focusCountRow');
const focusCountInput = document.getElementById('focusCountInput');
const sectionModeToggle = document.getElementById('sectionModeToggle');
const toolbarSizeSlider = document.getElementById('toolbarSizeSlider');
const toolbarSizeValue = document.getElementById('toolbarSizeValue');
const animationSpeedSlider = document.getElementById('animationSpeedSlider');
const animationSpeedValue = document.getElementById('animationSpeedValue');

const SIZE_LABELS = ['Small', 'Medium', 'Large'];

// Format animation speed for display
function formatAnimationSpeed(value) {
  const ms = value * 100;
  if (ms === 0) return '0ms';
  if (ms >= 1000) return (ms / 1000) + 's';
  return ms + 'ms';
}

let currentTabId = null;
let isNotionPage = false;

// Check current tab and status
async function checkStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;

    // Try to communicate with content script to detect if this is a Notion page
    // Content script only runs on Notion pages, so if we get a response, it's a Notion page
    try {
      const response = await chrome.tabs.sendMessage(currentTabId, { action: 'getStatus' });

      // Successfully communicated - this is a Notion page
      isNotionPage = true;

      if (response && response.active) {
        statusEl.textContent = 'Active on this page';
        statusEl.className = 'status active';
      } else {
        statusEl.textContent = 'Ready to activate';
        statusEl.className = 'status inactive';
      }
    } catch (err) {
      // No content script response - not a Notion page or script not loaded
      statusEl.textContent = 'Not a Notion page';
      statusEl.className = 'status error';
      isNotionPage = false;
    }

  } catch (err) {
    statusEl.textContent = 'Cannot access page';
    statusEl.className = 'status error';
  }
}

// Load saved enabled state
async function loadEnabledState() {
  const { enabled, focusMode, focusModeCount, sectionMode, toolbarSize, animationSpeed } = await chrome.storage.local.get({
    enabled: false,
    focusMode: false,
    focusModeCount: 1,
    sectionMode: false,
    toolbarSize: 2, // Default to large (index 2)
    animationSpeed: 0 // Default to no animation
  });
  enableToggle.checked = enabled;
  focusModeToggle.checked = focusMode;
  focusCountInput.value = focusModeCount;
  focusCountRow.style.display = focusMode ? 'flex' : 'none';
  sectionModeToggle.checked = sectionMode;
  toolbarSizeSlider.value = toolbarSize;
  toolbarSizeValue.textContent = SIZE_LABELS[toolbarSize];
  animationSpeedSlider.value = animationSpeed;
  animationSpeedValue.textContent = formatAnimationSpeed(animationSpeed);
}

// Handle enable toggle change
enableToggle.addEventListener('change', async () => {
  const enabled = enableToggle.checked;

  // Save state
  await chrome.storage.local.set({ enabled });

  if (!isNotionPage || !currentTabId) return;

  // Send message to content script
  try {
    if (enabled) {
      await chrome.tabs.sendMessage(currentTabId, { action: 'enable' });
    } else {
      await chrome.tabs.sendMessage(currentTabId, { action: 'disable' });
    }
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }

  // Update status
  checkStatus();
});

// Handle focus mode toggle change
focusModeToggle.addEventListener('change', async () => {
  const focusMode = focusModeToggle.checked;
  const focusModeCount = parseInt(focusCountInput.value, 10) || 1;

  // Mutual exclusivity: turn off section mode if focus mode is enabled
  if (focusMode && sectionModeToggle.checked) {
    sectionModeToggle.checked = false;
    await chrome.storage.local.set({ sectionMode: false });
    if (isNotionPage && currentTabId) {
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'setSectionMode', sectionMode: false });
      } catch (err) {
        console.log('Could not communicate with content script:', err);
      }
    }
  }

  // Show/hide count row
  focusCountRow.style.display = focusMode ? 'flex' : 'none';

  // Save state
  await chrome.storage.local.set({ focusMode });

  if (!isNotionPage || !currentTabId) return;

  // Send focus mode update to content script
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'setFocusMode', focusMode, focusModeCount });
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }
});

// Handle focus count change
focusCountInput.addEventListener('change', async () => {
  let focusModeCount = parseInt(focusCountInput.value, 10);

  // Clamp value between 1 and 20
  if (focusModeCount < 1) focusModeCount = 1;
  if (focusModeCount > 20) focusModeCount = 20;
  focusCountInput.value = focusModeCount;

  // Save state
  await chrome.storage.local.set({ focusModeCount });

  if (!isNotionPage || !currentTabId) return;

  // Send updated count to content script
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'setFocusModeCount', focusModeCount });
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }
});

// Handle section mode toggle change
sectionModeToggle.addEventListener('change', async () => {
  const sectionMode = sectionModeToggle.checked;

  // Mutual exclusivity: turn off focus mode if section mode is enabled
  if (sectionMode && focusModeToggle.checked) {
    focusModeToggle.checked = false;
    focusCountRow.style.display = 'none';
    await chrome.storage.local.set({ focusMode: false });
    if (isNotionPage && currentTabId) {
      try {
        await chrome.tabs.sendMessage(currentTabId, { action: 'setFocusMode', focusMode: false });
      } catch (err) {
        console.log('Could not communicate with content script:', err);
      }
    }
  }

  // Save state
  await chrome.storage.local.set({ sectionMode });

  if (!isNotionPage || !currentTabId) return;

  // Send section mode update to content script
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'setSectionMode', sectionMode });
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }
});

// Handle toolbar size slider change
toolbarSizeSlider.addEventListener('input', async () => {
  const toolbarSize = parseInt(toolbarSizeSlider.value, 10);

  // Update label
  toolbarSizeValue.textContent = SIZE_LABELS[toolbarSize];

  // Save state
  await chrome.storage.local.set({ toolbarSize });

  if (!isNotionPage || !currentTabId) return;

  // Send toolbar size update to content script
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'setToolbarSize', toolbarSize });
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }
});

// Handle animation speed slider change
animationSpeedSlider.addEventListener('input', async () => {
  const animationSpeed = parseInt(animationSpeedSlider.value, 10);

  // Update label
  animationSpeedValue.textContent = formatAnimationSpeed(animationSpeed);

  // Save state
  await chrome.storage.local.set({ animationSpeed });

  if (!isNotionPage || !currentTabId) return;

  // Send animation speed update to content script
  try {
    await chrome.tabs.sendMessage(currentTabId, { action: 'setAnimationSpeed', animationSpeed });
  } catch (err) {
    console.log('Could not communicate with content script:', err);
  }
});

// Initialize
loadEnabledState();
checkStatus();
