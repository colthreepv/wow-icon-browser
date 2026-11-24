# WoW Icon Browser

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Bun, TypeScript, React, Vite; static GitHub Pages under /wow-icon-browser/.

## Users

Valerio uses the browser beside WoW Forever on a 1080p desktop, including windows around 1200px wide. Mobile browsing must work too.

## Product Purpose

Search the complete icon catalog, browse visually, select an icon, and copy an escaped EditMacro command for an existing macro. Pass the macro name explicitly as both first and second arguments.

## Capabilities and Constraints

- Original category/subcategory groups with counts, continuous virtualized grid and persistent adjustable icon size. Icon-first cells with an optional names view.
- Side detail on desktop, drawer on mobile. Filename, texture path, command preview, favorites, recents and shareable search/filter/selection URL.
- All metadata searchable, no 1000-result ceiling. Normalize case, spaces and underscores; compact-word matching for eagle eye/eagleeye.
- Enrich with verified item/spell usage names, searchable and attributed in repository documentation. Coverage must be honest.
- No links or browser requests to Wowhead, including CDN assets and tracking. All runtime resources same-origin.
- Small on-demand lossy WebP atlases allowed; compare images and atlas sizes before selecting defaults.
- Upstream source snapshot: ZHamburglar/wow-forever-icons-and-macros at 207c135a931044deb51808f7a65c2aa0ec1c1be2. 33193 JPG files, 60676471 bytes. Imported catalog includes Retail content, not verified for Forever.
- No FileDataIDs without a verified mapping. Source collection has no explicit license; review redistribution and distinguish third-party image rights from our code license.

## Brand Commitments

English UI, dark neutral compact tool, icons carry the color, clear controls. No faux Blizzard ornamental framing. Working project name confirmed: wow-icon-browser; GitHub public persona colthreepv.

## Accessibility & Inclusion

Keyboard navigation, visible focus, slash to search, Escape to dismiss detail, explicit copy success/failure, useful loading/empty/missing-image states.
