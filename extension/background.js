/**
 * Background Service Worker
 * Handles auto-injection and state persistence
 */

// Check if URL is a Notion page
function isNotionPage(url) {
  return url && (url.includes('notion.so') || url.includes('notion.site'));
}

// Inject the presenter script into a tab
async function injectScript(tabId) {
  try {
    // Check if already injected
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.notionPresenter
    });

    if (results[0]?.result) {
      console.log('Already injected in tab', tabId);
      return true;
    }

    // Inject the script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['notion-presenter.js']
    });

    console.log('Injected into tab', tabId);
    return true;
  } catch (err) {
    console.error('Failed to inject:', err);
    return false;
  }
}

// Remove the presenter from a tab
async function removeScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.notionPresenter) {
          document.removeEventListener('keydown', window.notionPresenter.handler, true);
        }
        const toolbar = document.getElementById('notion-presenter-toolbar');
        if (toolbar) toolbar.remove();
        const tooltip = document.getElementById('notion-presenter-tooltip');
        if (tooltip) tooltip.remove();
        const mainContent = document.querySelector('.notion-page-content');
        if (mainContent) {
          const blocks = mainContent.querySelectorAll('[data-block-id]');
          blocks.forEach(block => {
            block.style.visibility = 'visible';
            block.style.opacity = '1';
          });
        }
        delete window.notionPresenter;
      }
    });
    return true;
  } catch (err) {
    console.error('Failed to remove:', err);
    return false;
  }
}

// Auto-inject on Notion page navigation if enabled
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on completed page loads
  if (changeInfo.status !== 'complete') return;

  // Only act on Notion pages
  if (!isNotionPage(tab.url)) return;

  // Check if auto-inject is enabled
  const { enabled } = await chrome.storage.local.get({ enabled: false });

  if (enabled) {
    // Small delay to ensure page is ready
    setTimeout(() => injectScript(tabId), 500);
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'inject') {
    injectScript(message.tabId).then(sendResponse);
    return true;
  }

  if (message.action === 'remove') {
    removeScript(message.tabId).then(sendResponse);
    return true;
  }

  if (message.action === 'checkInjected') {
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      func: () => !!window.notionPresenter
    }).then(results => {
      sendResponse(results[0]?.result || false);
    }).catch(() => sendResponse(false));
    return true;
  }

  if (message.action === 'reload') {
    // Reload the script by removing and re-injecting
    removeScript(message.tabId).then(() => {
      setTimeout(() => injectScript(message.tabId).then(sendResponse), 100);
    });
    return true;
  }
});

console.log('Notion Presenter background worker loaded');
