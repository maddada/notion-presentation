# Notion Presenter

A presentation mode script for Notion pages that lets you reveal content block-by-block, perfect for presentations and demos.

<img width="1280" height="800" alt="2026-01-10_Notion Personal_17-17-30" src="https://github.com/user-attachments/assets/66e565c4-951e-47e6-ade5-668dcdc52b29" />

## Features

- Reveal Notion blocks one at a time with keyboard shortcuts
- Toggle between presentation mode and full view
- Expand all toggle blocks at once
- State persists across page refreshes via localStorage
- Works even when focused inside Notion editor (uses event capture phase)

## Controls

| Shortcut | Action |
|----------|--------|
| `Option+5` | Expand all toggle blocks |
| `Option+4` | Reset state (hide all elements) |
| `Option+3` | Toggle between showing all blocks vs. current progress |
| `Option+2` | Reveal next block |
| `Option+1` | Hide last revealed block |

## Installation

### Option 1: Bookmarklet

1. Create a new bookmark in your browser
2. Copy the contents from `bookmarklet.txt`
3. Paste as the bookmark URL
4. Navigate to any Notion page and click the bookmarklet

### Option 2: Browser Console

1. Open a Notion page
2. Open Developer Tools (F12 or Cmd+Option+I)
3. Go to Console tab
4. Copy and paste the contents of `notion-presenter.js`
5. Press Enter

### Option 3: Tampermonkey/Userscript

Create a new userscript with the following header and the contents of `notion-presenter.js`:

```javascript
// ==UserScript==
// @name         Notion Presenter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Presentation mode for Notion
// @match        https://www.notion.so/*
// @grant        none
// ==/UserScript==
```

## Usage

1. Navigate to your Notion page
2. Load the script (via bookmarklet, console, or userscript)
3. Press `Option+4` to hide all blocks
4. Press `Option+2` to reveal blocks one by one
5. Press `Option+3` to toggle between presentation and full view
6. Press `Option+5` to expand any collapsed toggle blocks

## Files

- `notion-presenter.js` - Full formatted script with comments
- `bookmarklet.txt` - Minified bookmarklet version

## How It Works

The script:
1. Finds all Notion blocks using `[data-block-id]` selectors
2. Applies `visibility: hidden` and `opacity: 0` to hide blocks
3. Tracks visible block count in localStorage for persistence
4. Uses event capture phase to intercept keyboard events before Notion

## License

MIT
