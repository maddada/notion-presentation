The extension is tightly scoped to Notion domains only because that is the sole purpose of the tool.

Domains: *.notion.so and *.notion.site

Why these domains are required:

Notion Presenter is a presentation tool that works exclusively with Notion pages.

The extension requires access to these specific domains to:

1. Inject the presenter UI - A floating toolbar is added to Notion pages that allows users to control their presentation (next/previous block, reset, expand toggles).
2. Manipulate Notion's DOM - The core functionality hides and reveals Notion content blocks ([data-block-id] elements) one at a time, creating a presentation experience. This requires direct DOM access.
3. Add presentation mode styles - When users enable "Presentation Mode," CSS is injected to hide Notion's navigation, toolbars, and other UI elements for a distraction-free view.
4. Listen for keyboard shortcuts - The extension captures Alt+1 through Alt+6 keypresses to control the presentation flow.Notion pages