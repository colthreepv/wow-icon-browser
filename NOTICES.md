# Sources and rights

## Original application

The TypeScript application, build tools and original documentation in this
repository were written for this project. They are covered by LICENSE (MIT).
No application JavaScript or CSS was copied from the upstream icon browser.

## Icon collection

Source: ZHamburglar/wow-forever-icons-and-macros, snapshot
`207c135a931044deb51808f7a65c2aa0ec1c1be2`.

Source repository: https://github.com/ZHamburglar/wow-forever-icons-and-macros

The snapshot contains 33,193 JPG files (60,676,471 bytes). Its README identifies
Wowhead/Zamimg as the image source. World of Warcraft artwork and trademarks
belong to Blizzard Entertainment and/or their respective rights holders.

The upstream snapshot contains no explicit LICENSE, COPYING or NOTICE file.
Its publicly accessible status does not establish a redistribution license.
Generated WebP atlases remain third-party artwork; converting or attributing
them does not make them MIT-licensed. This repository makes no claim to own
the artwork or to sublicense it.

## Usage enrichment

`scripts/import-usage.ts` can prepare a local snapshot of associations between
icon filenames and item/spell names from Wowhead Forever. Source URLs, retrieval
time and partial coverage are recorded in the snapshot. These are associations,
not author-written ability descriptions, and do not certify in-game availability.

Applicable source terms: https://corp.fanbyte.com/legal/terms (reviewed November
24, 2026). Section 4 does not provide a general redistribution grant for site
content. A source attribution is not a substitute for permission. Any publishing
decision must account for those terms and the separate Blizzard artwork rights.

Blizzard legal policies: https://www.blizzard.com/en-us/legal/

## Browser privacy

The application makes no browser requests to Wowhead, Zamimg, Blizzard, analytics
providers or third-party font hosts. It renders no Wowhead links or embedded
tooltips. Build-time source acquisition is separate from browser operation.
Favorites, recents, macro name and display preferences are stored on the user's
device. GitHub Pages itself receives ordinary hosting requests.

## Compatibility

The source includes Retail classes and content. Web previews and Wowhead usage
records do not certify that a texture exists in a particular Forever client.
Texture paths are derived from original names with the `Interface\\Icons\\`
convention, not verified game-file mappings. Numeric FileDataIDs are now imported
from `wowdev/wow-listfile`, `parts/interface.csv` at commit
`70a4e328f80069db2a3be88925e626ffad07ef4b`. CSV SHA-256:
`f773eccb69f284d2f2597775a55667c43cb1fb616e586ce9912131b170d7d994`.

Source: https://github.com/wowdev/wow-listfile

The source repository has no explicit license identified by GitHub. Its data is
attributed here and is not relicensed under this project's MIT code license.
The community listfile warns that some filenames are inferred and can change.
A unique normalized filename-to-ID match establishes what the listfile says;
it does not certify availability or appearance in a specific Forever build.
Metadata `.meta` file IDs are excluded. No numeric IDs are invented.
