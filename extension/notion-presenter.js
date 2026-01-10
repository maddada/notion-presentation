/**
 * Notion Presenter - Content Script
 *
 * Controls:
 * - Option+6: Toggle presentation mode (hide Notion UI)
 * - Option+5: Expand all toggle blocks
 * - Option+4: Reset state (hide all elements)
 * - Option+3: Toggle between showing all blocks vs. current progress
 * - Option+2: Reveal next block
 * - Option+1: Hide last revealed block
 *
 * State persists across page refreshes via localStorage.
 */

(function() {
  // Prevent multiple initializations
  if (window.notionPresenterInitialized) return;
  window.notionPresenterInitialized = true;

  var STORAGE_KEY = 'notion-presenter-state';
  var pageId = window.location.pathname.split('-').pop();
  var isActive = false;

  // Detect platform for hotkey labels
  var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  var modifierKey = isMac ? '⌥' : 'Alt+';

  // Store references for cleanup
  var toolbar = null;
  var tooltip = null;
  var keydownHandler = null;
  var toolbarExpanded = true;
  var presentationMode = false;
  var presentationStyleEl = null;
  var toolbarSize = 2; // 0=small, 1=medium, 2=large
  var animationSpeed = 0; // 0-20 (multiply by 100 for ms)

  // Size presets: [buttonSize, iconSize, gap, collapsedSize, padding]
  var SIZE_PRESETS = {
    0: { button: 28, icon: 14, gap: 4, collapsed: 40, padding: 6 },   // Small
    1: { button: 34, icon: 17, gap: 6, collapsed: 48, padding: 7 },   // Medium
    2: { button: 40, icon: 20, gap: 8, collapsed: 56, padding: 8 }    // Large
  };

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
    var text = '';
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
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

    var trimmed = text.trim();
    var hasMedia = block.querySelector('img, video, audio, iframe, [data-content-editable-void]');
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
      showingAll: true,
      focusMode: false,
      focusModeCount: 1,
      sectionMode: false,
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

    toggles.forEach(function (toggle) {
      var button = toggle.querySelector('div[role="button"]');
      if (button) {
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
   * Get section boundaries (indices where sections start, using empty blocks as dividers)
   * Returns array of section start indices
   */
  function getSectionBoundaries(blocks) {
    var boundaries = [0]; // First section always starts at 0
    for (var i = 0; i < blocks.length; i++) {
      if (isBlockEmpty(blocks[i])) {
        // The next non-empty block starts a new section
        var nextIndex = i + 1;
        // Skip consecutive empty blocks
        while (nextIndex < blocks.length && isBlockEmpty(blocks[nextIndex])) {
          nextIndex++;
        }
        if (nextIndex < blocks.length && boundaries[boundaries.length - 1] !== nextIndex) {
          boundaries.push(nextIndex);
        }
      }
    }
    return boundaries;
  }

  /**
   * Find which section a block index belongs to
   * Returns the start index of that section
   */
  function findSectionStart(blockIndex, boundaries) {
    var sectionStart = 0;
    for (var i = 0; i < boundaries.length; i++) {
      if (boundaries[i] <= blockIndex) {
        sectionStart = boundaries[i];
      } else {
        break;
      }
    }
    return sectionStart;
  }

  /**
   * Get animation duration in ms
   */
  function getAnimationDuration() {
    return animationSpeed * 100;
  }

  /**
   * Show a block with optional animation
   */
  function showBlock(block, animate) {
    var duration = getAnimationDuration();
    if (animate && duration > 0) {
      // Start from opacity 0, then animate to 1
      block.style.transition = 'none';
      block.style.visibility = 'visible';
      block.style.opacity = '0';
      // Force reflow to ensure the initial state is applied
      block.offsetHeight;
      // Now set transition and animate
      block.style.transition = 'opacity ' + duration + 'ms ease-in-out';
      block.style.opacity = '1';
    } else {
      block.style.transition = 'none';
      block.style.visibility = 'visible';
      block.style.opacity = '1';
    }
  }

  /**
   * Hide a block with optional animation
   */
  function hideBlock(block, animate) {
    var duration = Math.min(getAnimationDuration(), 500); // Cap fade-out at 500ms
    if (animate && duration > 0) {
      // Animate opacity to 0, then hide visibility
      block.style.transition = 'opacity ' + duration + 'ms ease-in-out';
      block.style.opacity = '0';
      // Hide visibility after animation completes
      setTimeout(function() {
        // Only hide if still at opacity 0 (in case it was shown again)
        if (block.style.opacity === '0') {
          block.style.visibility = 'hidden';
        }
      }, duration);
    } else {
      block.style.transition = 'none';
      block.style.visibility = 'hidden';
      block.style.opacity = '0';
    }
  }

  /**
   * Apply visibility to blocks based on current state
   * @param {Object} state - The current state
   * @param {number} previousVisibleCount - Optional, used to detect newly visible/hidden blocks for animation
   */
  function applyVisibility(state, previousVisibleCount) {
    var blocks = getBlocks();
    if (blocks.length === 0) return;

    // Determine if we're revealing or hiding blocks (for animation)
    var isRevealing = previousVisibleCount !== undefined && state.visibleCount > previousVisibleCount;
    var isHiding = previousVisibleCount !== undefined && state.visibleCount < previousVisibleCount;

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var shouldBeVisible = false;
      var isNewlyVisible = false;
      var isNewlyHidden = false;

      if (state.showingAll) {
        shouldBeVisible = true;
      } else if (state.sectionMode) {
        var currentIndex = state.visibleCount - 1;
        if (currentIndex >= 0) {
          var boundaries = getSectionBoundaries(blocks);
          var sectionStart = findSectionStart(currentIndex, boundaries);
          shouldBeVisible = i >= sectionStart && i <= currentIndex && !isBlockEmpty(blocks[i]);

          var prevIndex = previousVisibleCount - 1;
          var prevSectionStart = prevIndex >= 0 ? findSectionStart(prevIndex, boundaries) : -1;

          // In section mode, newly visible includes all blocks in section from start
          if (isRevealing && shouldBeVisible) {
            // Block is newly visible if it wasn't visible before
            isNewlyVisible = prevIndex < 0 || i > prevIndex || sectionStart !== prevSectionStart;
          }
          // In section mode, newly hidden includes blocks from previous section
          // This happens when going backward OR when advancing to a new section (crossing boundary)
          if (!shouldBeVisible && prevIndex >= 0) {
            var wasVisible = i >= prevSectionStart && i <= prevIndex && !isBlockEmpty(blocks[i]);
            isNewlyHidden = wasVisible;
          }
        }
      } else if (state.focusMode) {
        var currentIndex = state.visibleCount - 1;
        var focusCount = state.focusModeCount || 1;
        var startIndex = Math.max(0, currentIndex - focusCount + 1);
        shouldBeVisible = i >= startIndex && i <= currentIndex;

        // In focus mode, animate the newly revealed block
        if (isRevealing && shouldBeVisible && i === currentIndex) {
          isNewlyVisible = true;
        }
        // In focus mode, animate the block being hidden (the one that scrolled out)
        if (isHiding && !shouldBeVisible) {
          var prevStartIndex = Math.max(0, previousVisibleCount - focusCount);
          var wasVisible = i >= prevStartIndex && i < previousVisibleCount;
          isNewlyHidden = wasVisible;
        }
      } else {
        shouldBeVisible = i < state.visibleCount;
        // In normal mode, animate the last revealed block
        if (isRevealing && shouldBeVisible && i === state.visibleCount - 1) {
          isNewlyVisible = true;
        }
        // In normal mode, animate the block being hidden
        if (isHiding && !shouldBeVisible && i === state.visibleCount) {
          isNewlyHidden = true;
        }
      }

      if (shouldBeVisible) {
        showBlock(block, isNewlyVisible);
      } else {
        hideBlock(block, isNewlyHidden);
      }
    }
  }

  /**
   * Reset all blocks to visible
   */
  function resetBlocksVisibility() {
    var blocks = getBlocks();
    blocks.forEach(function (block) {
      block.style.visibility = 'visible';
      block.style.opacity = '1';
    });
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

    if (e.code === 'Digit5') {
      e.preventDefault();
      expandAllToggles();
    }

    if (e.code === 'Digit4') {
      e.preventDefault();
      state.visibleCount = 0;
      state.showingAll = false;
      applyVisibility(state);
      saveState(state);
      console.log('Reset: all blocks hidden');
    }

    if (e.code === 'Digit3') {
      e.preventDefault();
      state.showingAll = !state.showingAll;
      applyVisibility(state);
      saveState(state);
      console.log('Toggle: showingAll=' + state.showingAll + ', progress=' + state.visibleCount + '/' + blocks.length);
    }

    if (e.code === 'Digit2') {
      e.preventDefault();
      state.showingAll = false;
      var previousCount = state.visibleCount;
      if (state.visibleCount < blocks.length) {
        state.visibleCount++;
        while (state.visibleCount < blocks.length && isBlockEmpty(blocks[state.visibleCount - 1])) {
          state.visibleCount++;
        }
      }
      applyVisibility(state, previousCount);
      saveState(state);
      console.log('Reveal: ' + state.visibleCount + '/' + blocks.length);
    }

    if (e.code === 'Digit1') {
      e.preventDefault();
      state.showingAll = false;
      var previousCount = state.visibleCount;
      if (state.visibleCount > 0) {
        state.visibleCount--;
        while (state.visibleCount > 0 && isBlockEmpty(blocks[state.visibleCount - 1])) {
          state.visibleCount--;
        }
      }
      applyVisibility(state, previousCount);
      saveState(state);
      console.log('Hide: ' + state.visibleCount + '/' + blocks.length);
    }

    if (e.code === 'Digit6') {
      e.preventDefault();
      togglePresentationMode();
    }
  }

  /**
   * Show tooltip
   */
  function showTooltip(button, description, hotkey) {
    if (tooltip) {
      tooltip.innerHTML =
        '<strong>' + description + '</strong><span style="margin-left: 8px; opacity: 0.6;">' + hotkey + '</span>';
      tooltip.style.opacity = '1';
    }
  }

  /**
   * Hide tooltip
   */
  function hideTooltip() {
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
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  /**
   * Toggle toolbar expanded/collapsed state
   */
  function toggleToolbar() {
    toolbarExpanded = !toolbarExpanded;
    updateToolbarState();
    // Save state to storage
    chrome.storage.local.set({ toolbarExpanded: toolbarExpanded });
  }

  /**
   * Update toolbar visual state
   */
  function updateToolbarState() {
    if (!toolbar) return;

    var preset = getSizePreset();
    var buttonsContainer = toolbar.querySelector('.np-buttons-container');
    var collapseBtn = toolbar.querySelector('.np-collapse-btn');

    if (toolbarExpanded) {
      // Expanding: set target width for smooth animation
      var buttons = buttonsContainer.querySelectorAll('.np-btn');
      var targetWidth = buttons.length * preset.button + (buttons.length - 1) * preset.gap;

      buttonsContainer.style.width = targetWidth + 'px';
      buttonsContainer.style.opacity = '1';
      buttonsContainer.style.pointerEvents = 'auto';
      buttonsContainer.style.marginLeft = preset.gap + 'px';
      collapseBtn.style.transform = 'rotate(180deg)';
      toolbar.style.padding = preset.padding + 'px ' + (preset.padding + 4) + 'px';
      toolbar.style.borderRadius = '12px';
      toolbar.style.width = 'auto';
      toolbar.style.height = 'auto';
      toolbar.style.opacity = '0.4';
    } else {
      // Collapsing: first ensure current width is set, then animate to 0
      var currentWidth = buttonsContainer.offsetWidth;
      if (currentWidth > 0) {
        buttonsContainer.style.width = currentWidth + 'px';
        // Force reflow to ensure the width is applied before animating
        buttonsContainer.offsetHeight;
      }

      buttonsContainer.style.width = '0';
      buttonsContainer.style.opacity = '0';
      buttonsContainer.style.pointerEvents = 'none';
      buttonsContainer.style.marginLeft = '0';
      collapseBtn.style.transform = 'rotate(0deg)';
      toolbar.style.padding = preset.padding + 'px';
      toolbar.style.borderRadius = '50%';
      toolbar.style.width = preset.collapsed + 'px';
      toolbar.style.height = preset.collapsed + 'px';
      toolbar.style.opacity = '0.15';
    }
  }

  /**
   * Create the toolbar UI
   */
  function createToolbar() {
    if (toolbar) toolbar.remove();
    if (tooltip) tooltip.remove();

    var preset = getSizePreset();

    toolbar = document.createElement('div');
    toolbar.id = 'notion-presenter-toolbar';
    toolbar.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: ${toolbarExpanded ? preset.padding + 'px ' + (preset.padding + 4) + 'px' : preset.padding + 'px'};
      background: rgba(30, 30, 30, 0.95);
      border-radius: ${toolbarExpanded ? '12px' : '50%'};
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: all 0.3s ease;
      opacity: ${toolbarExpanded ? '0.4' : '0.15'};
      ${!toolbarExpanded ? 'width: ' + preset.collapsed + 'px; height: ' + preset.collapsed + 'px;' : ''}
    `;

    // Hover events for toolbar opacity
    toolbar.onmouseenter = function () {
      this.style.opacity = '1';
    };
    toolbar.onmouseleave = function () {
      this.style.opacity = toolbarExpanded ? '0.4' : '0.15';
    };

    // Create collapse/expand button
    var collapseBtn = document.createElement('button');
    collapseBtn.className = 'np-collapse-btn';
    collapseBtn.style.cssText = `
      width: ${preset.button}px;
      height: ${preset.button}px;
      border: none;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, transform 0.3s ease;
      flex-shrink: 0;
      transform: ${toolbarExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
    `;
    collapseBtn.innerHTML =
      '<span style="width: ' +
      preset.icon +
      'px; height: ' +
      preset.icon +
      'px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></span>';
    collapseBtn.onclick = toggleToolbar;
    collapseBtn.onmouseenter = function () {
      this.style.background = 'rgba(255, 255, 255, 0.25)';
      showTooltip(this, toolbarExpanded ? 'Collapse toolbar' : 'Expand toolbar', '');
    };
    collapseBtn.onmouseleave = function () {
      this.style.background = 'rgba(255, 255, 255, 0.15)';
      hideTooltip();
    };

    // Create buttons container
    var buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'np-buttons-container';
    buttonsContainer.style.cssText = `
      display: flex;
      gap: ${preset.gap}px;
      overflow: hidden;
      transition: width 0.3s ease, opacity 0.3s ease, margin-left 0.3s ease;
      margin-left: ${toolbarExpanded ? preset.gap + 'px' : '0'};
      opacity: ${toolbarExpanded ? '1' : '0'};
      pointer-events: ${toolbarExpanded ? 'auto' : 'none'};
    `;

    var buttons = [
      {
        id: 'prev',
        description: 'Hide last revealed block',
        hotkey: modifierKey + '1',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
        action: function () {
          triggerAction('Digit1');
        },
      },
      {
        id: 'next',
        description: 'Reveal next block',
        hotkey: modifierKey + '2',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
        action: function () {
          triggerAction('Digit2');
        },
      },
      {
        id: 'toggle',
        description: 'Toggle between progress and all blocks',
        hotkey: modifierKey + '3',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
        action: function () {
          triggerAction('Digit3');
        },
      },
      {
        id: 'reset',
        description: 'Hide all blocks',
        hotkey: modifierKey + '4',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
        action: function () {
          triggerAction('Digit4');
        },
      },
      {
        id: 'expand',
        description: 'Expand all toggle blocks',
        hotkey: modifierKey + '5',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
        action: function () {
          triggerAction('Digit5');
        },
      },
      {
        id: 'presentation',
        description: 'Toggle presentation mode',
        hotkey: modifierKey + '6',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
        action: function () {
          triggerAction('Digit6');
        },
        isToggle: true,
      },
    ];

    buttons.forEach(function (btn) {
      var button = document.createElement('button');
      button.className = 'np-btn';
      button.setAttribute('data-action', btn.id);
      button.style.cssText = `
        position: relative;
        width: ${preset.button}px;
        height: ${preset.button}px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.1s;
        flex-shrink: 0;
      `;
      button.innerHTML =
        '<span style="width: ' + preset.icon + 'px; height: ' + preset.icon + 'px;">' + btn.svg + '</span>';

      button.onmouseenter = function () {
        if (btn.isToggle && presentationMode) {
          this.style.background = 'rgba(59, 130, 246, 0.8)';
        } else {
          this.style.background = 'rgba(255, 255, 255, 0.2)';
        }
        showTooltip(this, btn.description, btn.hotkey);
      };
      button.onmouseleave = function () {
        if (btn.isToggle && presentationMode) {
          this.style.background = 'rgba(59, 130, 246, 0.6)';
        } else {
          this.style.background = 'rgba(255, 255, 255, 0.1)';
        }
        hideTooltip();
      };
      button.onmousedown = function () {
        this.style.transform = 'scale(0.95)';
      };
      button.onmouseup = function () {
        this.style.transform = 'scale(1)';
      };
      button.onclick = btn.action;

      buttonsContainer.appendChild(button);
    });

    toolbar.appendChild(collapseBtn);
    toolbar.appendChild(buttonsContainer);

    tooltip = document.createElement('div');
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

    // Initialize toolbar state based on saved preference
    setTimeout(function () {
      var initPreset = getSizePreset();
      if (toolbarExpanded) {
        var buttons = buttonsContainer.querySelectorAll('.np-btn');
        var targetWidth = buttons.length * initPreset.button + (buttons.length - 1) * initPreset.gap;
        buttonsContainer.style.width = targetWidth + 'px';
        toolbar.style.opacity = '0.4';
      } else {
        // Apply collapsed state
        buttonsContainer.style.width = '0';
        buttonsContainer.style.opacity = '0';
        buttonsContainer.style.pointerEvents = 'none';
        buttonsContainer.style.marginLeft = '0';
        toolbar.style.padding = initPreset.padding + 'px';
        toolbar.style.borderRadius = '50%';
        toolbar.style.width = initPreset.collapsed + 'px';
        toolbar.style.height = initPreset.collapsed + 'px';
        toolbar.style.opacity = '0.15';
      }
      // Update presentation mode button state if already active
      updatePresentationModeButton();
    }, 0);
  }

  /**
   * Apply presentation mode styles
   */
  function applyPresentationMode() {
    if (presentationStyleEl) {
      presentationStyleEl.remove();
    }

    presentationStyleEl = document.createElement('style');
    presentationStyleEl.id = 'notion-presenter-mode-styles';
    presentationStyleEl.textContent = `
      /* Hide top navigation bar elements - left side */
      .notion-topbar-breadcrumb,
      .notion-topbar > div > div:first-child {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide top right controls - Share, edit status, star, more menu */
      .notion-topbar-share-menu,
      .notion-topbar-more-button,
      .notion-topbar > div > div:last-child > div:not(:empty) {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide the block hover controls (+ and drag handle on the left) */
      .notion-selectable-halo,
      .notion-block-hover-trigger,
      [style*="position: absolute"][style*="left: -"][style*="height: 24px"],
      div[data-block-id] > div[style*="position: absolute"]:first-child {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide the presence/collaboration indicator on the right side (minimize button area) */
      .notion-presence-container,
      .notion-topbar-presence,
      [class*="presence"],
      .notion-frame > div > div[style*="position: fixed"][style*="right:"] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide Notion AI assistant button (bottom right) */
      .notion-ai-button,
      [class*="notion-ai"],
      div[style*="position: fixed"][style*="bottom"][style*="right"]:not(#notion-presenter-toolbar) {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide empty line placeholder text */
      [data-content-editable-leaf] [data-slate-placeholder="true"],
      .notion-placeholder,
      [placeholder]:empty::before,
      span[data-slate-placeholder="true"] {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Hide "Write, press 'space' for AI, '/' for commands..." placeholder */
      .notion-page-content [contenteditable="true"]:empty::before,
      .notion-page-content [data-placeholder],
      [data-slate-node="element"] [data-slate-placeholder] {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Hide Comment button that appears on hover */
      .notion-page-content [role="button"][style*="Comment"],
      .notion-page-content div[style*="position: absolute"][style*="right"]:not([data-block-id]),
      [aria-label*="Comment"],
      [aria-label*="comment"],
      .notion-comment-button,
      div[style*="Comment"] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide the minimize/fullscreen button (top right floating button) */
      .notion-frame > div[style*="position: fixed"][style*="right"][style*="top"],
      div[style*="position: fixed"][style*="right: 16px"][style*="top"],
      div[style*="position: fixed"][style*="right: 12px"][style*="top"] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide scrollbar while preserving scroll functionality */
      .notion-scroller::-webkit-scrollbar,
      .notion-frame::-webkit-scrollbar,
      .notion-page-content::-webkit-scrollbar,
      *::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }

      .notion-scroller,
      .notion-frame,
      .notion-page-content {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }

      /* Hide the floating side dock/comment panel trigger on the right */
      .notion-page-content + div[style*="position: absolute"],
      .notion-frame > div > div[style*="right: 0"],
      div[style*="position: absolute"][style*="right: 0px"][style*="height: 100%"] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide the floating table of contents */
      .notion-floating-table-of-contents {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide drag handle and plus button on blocks */
      .dragHandle,
      .plus {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Hide placeholder in content editable leaves */
      .content-editable-leaf::before,
      .content-editable-leaf::after,
      .content-editable-leaf-ltr::before,
      .content-editable-leaf-ltr::after,
      .content-editable-leaf-rtl::before,
      .content-editable-leaf-rtl::after {
        opacity: 0 !important;
        visibility: hidden !important;
        /* content: none !important; */
      }
    `;
    document.head.appendChild(presentationStyleEl);
    presentationMode = true;
    console.log('Presentation mode enabled');
  }

  /**
   * Remove presentation mode styles
   */
  function removePresentationMode() {
    if (presentationStyleEl) {
      presentationStyleEl.remove();
      presentationStyleEl = null;
    }
    presentationMode = false;
    console.log('Presentation mode disabled');
  }

  /**
   * Toggle presentation mode
   */
  function togglePresentationMode() {
    setPresentationMode(!presentationMode);
  }

  /**
   * Set presentation mode
   */
  function setPresentationMode(enabled) {
    if (enabled) {
      applyPresentationMode();
    } else {
      removePresentationMode();
    }
    updatePresentationModeButton();
    // Save to storage
    chrome.storage.local.set({ presentationMode: enabled });
  }

  /**
   * Update presentation mode button visual state
   */
  function updatePresentationModeButton() {
    if (!toolbar) return;
    var btn = toolbar.querySelector('[data-action="presentation"]');
    if (btn) {
      if (presentationMode) {
        btn.style.background = 'rgba(59, 130, 246, 0.6)';
      } else {
        btn.style.background = 'rgba(255, 255, 255, 0.1)';
      }
    }
  }

  /**
   * Get current size preset
   */
  function getSizePreset() {
    return SIZE_PRESETS[toolbarSize] || SIZE_PRESETS[2];
  }

  /**
   * Set toolbar size and apply it
   */
  function setToolbarSize(size) {
    toolbarSize = size;
    applyToolbarSize();
    chrome.storage.local.set({ toolbarSize: size });
  }

  /**
   * Set animation speed
   */
  function setAnimationSpeed(speed) {
    animationSpeed = speed;
    chrome.storage.local.set({ animationSpeed: speed });
    console.log('Animation speed: ' + (speed * 100) + 'ms');
  }

  /**
   * Apply toolbar size to existing toolbar
   */
  function applyToolbarSize() {
    if (!toolbar) return;

    var preset = getSizePreset();
    var buttonsContainer = toolbar.querySelector('.np-buttons-container');
    var collapseBtn = toolbar.querySelector('.np-collapse-btn');
    var buttons = toolbar.querySelectorAll('.np-btn');

    // Update collapse button size
    collapseBtn.style.width = preset.button + 'px';
    collapseBtn.style.height = preset.button + 'px';

    // Update icon size in collapse button
    var collapseIcon = collapseBtn.querySelector('span');
    if (collapseIcon) {
      collapseIcon.style.width = preset.icon + 'px';
      collapseIcon.style.height = preset.icon + 'px';
    }

    // Update buttons container gap
    buttonsContainer.style.gap = preset.gap + 'px';

    // Update each button
    buttons.forEach(function (btn) {
      btn.style.width = preset.button + 'px';
      btn.style.height = preset.button + 'px';
      var icon = btn.querySelector('span');
      if (icon) {
        icon.style.width = preset.icon + 'px';
        icon.style.height = preset.icon + 'px';
      }
    });

    // Update toolbar state with new sizes
    if (toolbarExpanded) {
      var targetWidth = buttons.length * preset.button + (buttons.length - 1) * preset.gap;
      buttonsContainer.style.width = targetWidth + 'px';
      buttonsContainer.style.marginLeft = preset.gap + 'px';
      toolbar.style.padding = preset.padding + 'px ' + (preset.padding + 4) + 'px';
    } else {
      toolbar.style.width = preset.collapsed + 'px';
      toolbar.style.height = preset.collapsed + 'px';
      toolbar.style.padding = preset.padding + 'px';
    }
  }

  /**
   * Activate the presenter
   */
  function activate() {
    if (isActive) return;
    isActive = true;

    keydownHandler = handleKeydown;
    document.addEventListener('keydown', keydownHandler, true);
    applyVisibility(state);
    createToolbar();

    console.log('Notion Presenter activated! Blocks: ' + getBlocks().length);
  }

  /**
   * Deactivate the presenter
   */
  function deactivate() {
    if (!isActive) return;
    isActive = false;

    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }

    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }

    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }

    // Clean up presentation mode
    removePresentationMode();

    resetBlocksVisibility();
    console.log('Notion Presenter deactivated');
  }

  /**
   * Set focus mode
   */
  function setFocusMode(enabled, count) {
    state.focusMode = enabled;
    // Turn off section mode if focus mode is enabled (mutual exclusivity)
    if (enabled) {
      state.sectionMode = false;
    }
    if (count !== undefined) {
      state.focusModeCount = count;
    }
    if (isActive) {
      applyVisibility(state);
    }
    saveState(state);
    console.log('Focus mode: ' + enabled + ', count: ' + state.focusModeCount);
  }

  /**
   * Set focus mode count
   */
  function setFocusModeCount(count) {
    state.focusModeCount = count;
    if (isActive) {
      applyVisibility(state);
    }
    saveState(state);
    console.log('Focus mode count: ' + count);
  }

  /**
   * Set section mode
   */
  function setSectionMode(enabled) {
    state.sectionMode = enabled;
    // Turn off focus mode if section mode is enabled (mutual exclusivity)
    if (enabled) {
      state.focusMode = false;
    }
    if (isActive) {
      applyVisibility(state);
    }
    saveState(state);
    console.log('Section mode: ' + enabled);
  }

  /**
   * Listen for messages from popup
   */
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'enable') {
      activate();
      sendResponse({ success: true, active: true });
    } else if (message.action === 'disable') {
      deactivate();
      sendResponse({ success: true, active: false });
    } else if (message.action === 'getStatus') {
      sendResponse({ active: isActive, blockCount: getBlocks().length, presentationMode: presentationMode });
    } else if (message.action === 'setFocusMode') {
      setFocusMode(message.focusMode, message.focusModeCount);
      sendResponse({ success: true });
    } else if (message.action === 'setFocusModeCount') {
      setFocusModeCount(message.focusModeCount);
      sendResponse({ success: true });
    } else if (message.action === 'setSectionMode') {
      setSectionMode(message.sectionMode);
      sendResponse({ success: true });
    } else if (message.action === 'setPresentationMode') {
      setPresentationMode(message.presentationMode);
      sendResponse({ success: true });
    } else if (message.action === 'setToolbarSize') {
      setToolbarSize(message.toolbarSize);
      sendResponse({ success: true });
    } else if (message.action === 'setAnimationSpeed') {
      setAnimationSpeed(message.animationSpeed);
      sendResponse({ success: true });
    }
    return true;
  });

  /**
   * Initialize based on stored preference
   */
  function init() {
    chrome.storage.local.get(
      {
        enabled: false,
        presentationMode: false,
        focusMode: false,
        focusModeCount: 1,
        sectionMode: false,
        toolbarExpanded: true,
        toolbarSize: 2,
        animationSpeed: 0,
      },
      function (result) {
        // Apply stored toolbar expanded state (default to expanded)
        toolbarExpanded = result.toolbarExpanded;
        // Apply stored toolbar size (default to large)
        toolbarSize = result.toolbarSize;
        // Apply stored animation speed (default to no animation)
        animationSpeed = result.animationSpeed;

        if (result.enabled) {
          setTimeout(function () {
            // Apply stored focus mode settings
            if (result.focusMode) {
              state.focusMode = true;
              state.focusModeCount = result.focusModeCount;
            }
            // Apply stored section mode settings
            if (result.sectionMode) {
              state.sectionMode = true;
            }
            activate();
            if (result.presentationMode) {
              setPresentationMode(true);
            }
          }, 500);
        }
      }
    );
  }

  // Initialize
  init();

  // Export for debugging
  window.notionPresenter = {
    activate: activate,
    deactivate: deactivate,
    isActive: function () {
      return isActive;
    },
    getBlocks: getBlocks,
    expandToggles: expandAllToggles,
    setFocusMode: setFocusMode,
    setFocusModeCount: setFocusModeCount,
    setSectionMode: setSectionMode,
    setPresentationMode: setPresentationMode,
    isPresentationMode: function () {
      return presentationMode;
    },
    setToolbarSize: setToolbarSize,
    getToolbarSize: function () {
      return toolbarSize;
    },
    setAnimationSpeed: setAnimationSpeed,
    getAnimationSpeed: function () {
      return animationSpeed;
    },
  };
})();
