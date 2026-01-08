/**
 * Notion Presenter Script
 *
 * Controls:
 * - Option+5: Expand all toggle blocks
 * - Option+4: Reset state (hide all elements)
 * - Option+3: Toggle between showing all blocks vs. current progress
 * - Option+2: Reveal next block
 * - Option+1: Hide last revealed block
 *
 * State persists across page refreshes via localStorage.
 */

(function() {
  // Remove any existing instance
  if (window.notionPresenter) {
    document.removeEventListener('keydown', window.notionPresenter.handler, true);
  }

  var STORAGE_KEY = 'notion-presenter-state';
  var pageId = window.location.pathname.split('-').pop();

  // Detect platform for hotkey labels
  var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  var modifierKey = isMac ? '⌥' : 'Alt+';

  /**
   * Get all unique blocks from the page content
   */
  function getBlocks() {
    var mainContent = document.querySelector('.notion-page-content');
    if (!mainContent) return [];

    var allBlocks = mainContent.querySelectorAll('[data-block-id]');
    var seen = {};
    var blocks = [];

    for (var i = 0; i < allBlocks.length; i++) {
      var block = allBlocks[i];
      var id = block.getAttribute('data-block-id');
      if (!seen[id]) {
        seen[id] = true;
        blocks.push(block);
      }
    }

    return blocks;
  }

  /**
   * Check if a block is empty (no visible content)
   */
  function isBlockEmpty(block) {
    // Get text content, excluding nested blocks
    var text = '';
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      // Skip text inside nested blocks
      var parent = node.parentElement;
      var isNested = false;
      while (parent && parent !== block) {
        if (parent.hasAttribute('data-block-id') && parent !== block) {
          isNested = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!isNested) {
        text += node.textContent;
      }
    }

    // Check if block has meaningful content
    var trimmed = text.trim();

    // Check for images, embeds, or other media
    var hasMedia = block.querySelector('img, video, audio, iframe, [data-content-editable-void]');

    // Check for checkboxes, toggles that have content
    var hasInteractive = block.querySelector('.notion-to_do-block, .notion-toggle-block');

    return trimmed === '' && !hasMedia && !hasInteractive;
  }

  /**
   * Load state from localStorage
   */
  function loadState() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var data = JSON.parse(stored);
        if (data.pageId === pageId) {
          return data;
        }
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    return {
      pageId: pageId,
      visibleCount: 0,
      showingAll: true
    };
  }

  /**
   * Save state to localStorage
   */
  function saveState(state) {
    state.pageId = pageId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Expand all toggle blocks on the page
   */
  function expandAllToggles() {
    var toggles = document.querySelectorAll('.notion-toggle-block');
    var expanded = 0;

    toggles.forEach(function(toggle) {
      // Find the clickable button element
      var button = toggle.querySelector('div[role="button"]');
      if (button) {
        // Check if toggle is collapsed - rotateZ(-90deg) means collapsed, rotateZ(0deg) means expanded
        var svg = toggle.querySelector('svg');
        var transform = svg ? svg.style.transform : '';
        var isCollapsed = transform.includes('-90') || transform.includes('(-90');

        if (isCollapsed) {
          button.click();
          expanded++;
        }
      }
    });

    console.log('Expanded ' + expanded + ' toggle blocks');
    return expanded;
  }

  /**
   * Apply visibility to blocks based on current state
   */
  function applyVisibility(state) {
    var blocks = getBlocks();
    if (blocks.length === 0) return;

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];

      if (state.showingAll) {
        // Show all blocks
        block.style.visibility = 'visible';
        block.style.opacity = '1';
      } else {
        // Show only up to visibleCount
        if (i < state.visibleCount) {
          block.style.visibility = 'visible';
          block.style.opacity = '1';
        } else {
          block.style.visibility = 'hidden';
          block.style.opacity = '0';
        }
      }
    }
  }

  // Initialize state
  var state = loadState();

  /**
   * Keyboard event handler
   */
  function handleKeydown(e) {
    if (!e.altKey) return;

    var blocks = getBlocks();
    if (blocks.length === 0) return;

    // Option+5: Expand all toggle blocks
    if (e.code === 'Digit5') {
      e.preventDefault();
      expandAllToggles();
    }

    // Option+4: Reset state (hide all elements)
    if (e.code === 'Digit4') {
      e.preventDefault();
      state.visibleCount = 0;
      state.showingAll = false;
      applyVisibility(state);
      saveState(state);
      console.log('Reset: all blocks hidden');
    }

    // Option+3: Toggle between showing all vs. progress
    if (e.code === 'Digit3') {
      e.preventDefault();
      state.showingAll = !state.showingAll;
      applyVisibility(state);
      saveState(state);
      console.log('Toggle: showingAll=' + state.showingAll + ', progress=' + state.visibleCount + '/' + blocks.length);
    }

    // Option+2: Reveal next block (skip consecutive empty blocks)
    if (e.code === 'Digit2') {
      e.preventDefault();
      state.showingAll = false;
      if (state.visibleCount < blocks.length) {
        // Reveal at least one block
        state.visibleCount++;

        // Keep revealing while we're on empty blocks and haven't hit a non-empty one
        while (state.visibleCount < blocks.length && isBlockEmpty(blocks[state.visibleCount - 1])) {
          state.visibleCount++;
        }
      }
      applyVisibility(state);
      saveState(state);
      console.log('Reveal: ' + state.visibleCount + '/' + blocks.length);
    }

    // Option+1: Hide last revealed block (skip consecutive empty blocks)
    if (e.code === 'Digit1') {
      e.preventDefault();
      state.showingAll = false;
      if (state.visibleCount > 0) {
        // Hide at least one block
        state.visibleCount--;

        // Keep hiding while the last visible block is empty
        while (state.visibleCount > 0 && isBlockEmpty(blocks[state.visibleCount - 1])) {
          state.visibleCount--;
        }
      }
      applyVisibility(state);
      saveState(state);
      console.log('Hide: ' + state.visibleCount + '/' + blocks.length);
    }
  }

  // Register event listener with capture phase to intercept before Notion
  document.addEventListener('keydown', handleKeydown, true);

  // Apply initial state
  applyVisibility(state);

  // ==================== UI TOOLBAR ====================

  /**
   * Create the toolbar UI
   */
  function createToolbar() {
    // Remove existing toolbar if present
    var existing = document.getElementById('notion-presenter-toolbar');
    if (existing) existing.remove();

    // Toolbar container
    var toolbar = document.createElement('div');
    toolbar.id = 'notion-presenter-toolbar';
    toolbar.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Button definitions
    var buttons = [
      {
        id: 'prev',
        label: 'Previous',
        description: 'Hide last revealed block',
        hotkey: modifierKey + '1',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
        action: function() { triggerAction('Digit1'); }
      },
      {
        id: 'next',
        label: 'Next',
        description: 'Reveal next block',
        hotkey: modifierKey + '2',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
        action: function() { triggerAction('Digit2'); }
      },
      {
        id: 'toggle',
        label: 'Toggle View',
        description: 'Toggle between progress and all blocks',
        hotkey: modifierKey + '3',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
        action: function() { triggerAction('Digit3'); }
      },
      {
        id: 'reset',
        label: 'Reset',
        description: 'Hide all blocks',
        hotkey: modifierKey + '4',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
        action: function() { triggerAction('Digit4'); }
      },
      {
        id: 'expand',
        label: 'Expand Toggles',
        description: 'Expand all toggle blocks',
        hotkey: modifierKey + '5',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
        action: function() { triggerAction('Digit5'); }
      }
    ];

    // Create buttons
    buttons.forEach(function(btn) {
      var button = document.createElement('button');
      button.className = 'np-btn';
      button.setAttribute('data-action', btn.id);
      button.style.cssText = `
        position: relative;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.1s;
      `;
      button.innerHTML = '<span style="width: 20px; height: 20px;">' + btn.svg + '</span>';

      // Hover effects
      button.onmouseenter = function() {
        this.style.background = 'rgba(255, 255, 255, 0.2)';
        showTooltip(this, btn.description, btn.hotkey);
      };
      button.onmouseleave = function() {
        this.style.background = 'rgba(255, 255, 255, 0.1)';
        hideTooltip();
      };
      button.onmousedown = function() {
        this.style.transform = 'scale(0.95)';
      };
      button.onmouseup = function() {
        this.style.transform = 'scale(1)';
      };
      button.onclick = btn.action;

      toolbar.appendChild(button);
    });

    // Tooltip element
    var tooltip = document.createElement('div');
    tooltip.id = 'notion-presenter-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      z-index: 100000;
    `;
    document.body.appendChild(tooltip);

    document.body.appendChild(toolbar);
  }

  /**
   * Show tooltip
   */
  function showTooltip(button, description, hotkey) {
    var tooltip = document.getElementById('notion-presenter-tooltip');
    if (tooltip) {
      tooltip.innerHTML = '<strong>' + description + '</strong><span style="margin-left: 8px; opacity: 0.6;">' + hotkey + '</span>';
      tooltip.style.opacity = '1';
    }
  }

  /**
   * Hide tooltip
   */
  function hideTooltip() {
    var tooltip = document.getElementById('notion-presenter-tooltip');
    if (tooltip) {
      tooltip.style.opacity = '0';
    }
  }

  /**
   * Trigger keyboard action programmatically
   */
  function triggerAction(code) {
    var event = new KeyboardEvent('keydown', {
      altKey: true,
      code: code,
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  // Create toolbar on load
  createToolbar();

  // Export for debugging
  window.notionPresenter = {
    handler: handleKeydown,
    state: state,
    apply: applyVisibility,
    getBlocks: getBlocks,
    isBlockEmpty: isBlockEmpty,
    expandToggles: expandAllToggles,
    createToolbar: createToolbar
  };

  console.log('Notion Presenter loaded! Blocks: ' + getBlocks().length);
})();
