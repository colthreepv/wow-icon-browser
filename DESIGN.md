# Browser design

The primary surface is an Operate screen: the icon collection occupies the
center, with category navigation on the left and a persistent inspector on the
right. Search remains at the top while the gallery and inspector scroll
independently. There is no separate landing page.

## Visual system

- Neutral charcoal ground `#17191b`, panel `#1d1f22`, dividers `#33363a`.
- Main text `#e9e9e5`, supporting text `#acb0b6`, selection/focus `#edcb86`.
- System UI type for controls, with monospace reserved for exact identifiers,
  paths and Lua. Small neutral controls keep the icon artwork prominent.
- A thin pale-gold selection outline connects a tile with its inspector.
- Preview enlargement uses pixelated rendering and explicitly labels the 56px
  source tile. Eleven rectangular originals are padded, not stretched.

## Layout and behavior

At 1920px the category rail is 230px and inspector 350px. At 1200px they become
198px and 304px. Below 1000px the category rail becomes a drawer; below 760px
the inspector is also a dialog drawer, with a close action, focus containment,
Escape support and return focus.

The gallery virtualizes group headers and icon rows together. Icon sizes are
32/40/48/56/64/80px. Filename captions are optional. Counts reflect the current
query and collection. An inspected icon may remain visible after filtering it
out of the results, with an explicit context label.

Copy feedback stays beside the action. Clipboard failure selects the text and
explains manual copying. Missing images retain an identifiable placeholder;
blocked storage keeps the current session usable and displays a notice.

All icons and atlases derive from the pinned upstream snapshot documented in
NOTICES.md and public/data/import-report.json. No generated raster art or
third-party runtime resources are used. Screenshots in docs/ are real captures
of the application at desktop and phone sizes.

## Finish review

Desktop 1920×1080, compact desktop 1200×900 and mobile 390×844 were checked.
The full search/select/copy flow, scroll to the last entry, persistent zoom and
favorites, keyboard focus, mobile drawer, URL restoration, image failures,
storage failures, catalog retry and clipboard denial pass browser tests.
The mechanical design scan returned no findings. Verdict: ready for the first
public demo; item/spell usage coverage remains explicitly partial and actual
Forever client texture availability remains unverified.
