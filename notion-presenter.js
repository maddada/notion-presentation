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

    // Option+2: Reveal next block
    if (e.code === 'Digit2') {
      e.preventDefault();
      state.showingAll = false;
      if (state.visibleCount < blocks.length) {
        state.visibleCount++;
      }
      applyVisibility(state);
      saveState(state);
      console.log('Reveal: ' + state.visibleCount + '/' + blocks.length);
    }

    // Option+1: Hide last revealed block
    if (e.code === 'Digit1') {
      e.preventDefault();
      state.showingAll = false;
      if (state.visibleCount > 0) {
        state.visibleCount--;
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

  // Export for debugging
  window.notionPresenter = {
    handler: handleKeydown,
    state: state,
    apply: applyVisibility,
    getBlocks: getBlocks,
    expandToggles: expandAllToggles
  };

  console.log('Notion Presenter loaded! Blocks: ' + getBlocks().length);
})();
