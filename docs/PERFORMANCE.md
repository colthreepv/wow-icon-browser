# Measurements

Measured November 24, 2026 on the development workstation in Chromium 159,
against a production Vite preview build. These are local measurements, not
guarantees about every device or network. Files with raw results sit beside
this document.

## Shipped assets

- JavaScript after semantic navigation and numeric IDs: 312.94 KB raw, 94.42 KB gzip.
- CSS after the navigation update: 16.10 KB raw, 4.30 KB gzip.
- Complete metadata, including usage names and FileDataIDs: 2,014,187 bytes raw,
  437,493 bytes gzip. The numeric-ID tuple adds about 127 KB gzip to the earlier
  metadata snapshot. It avoids loading the full 11.47 MB source CSV at runtime.
- All 33,193 icon identities are searchable. 32,476 distinct source images are
  packed into 127 WebP atlases, quality 78, 16×16 cells at native 56px.
- Entire generated image collection: 34,400,022 bytes, about 43.3% smaller than
  the 60,676,471-byte JPG source. The browser does not fetch the whole collection.

## Actual initial viewport, 1920×1080

The following side-by-side delivery measurements were recorded before the
semantic-navigation update, with the same catalog and image atlases.

| Measurement                        | 64-icon atlases | 256-icon atlases |
| ---------------------------------- | --------------: | ---------------: |
| Mounted icon buttons               |             211 |              211 |
| Initial atlas requests             |               4 |                1 |
| Initial encoded image bytes        |         290,616 |          290,184 |
| Nominal decoded image bytes        |       3,211,264 |        3,211,264 |
| All initial resource encoded bytes |         694,662 |          690,133 |

The 256 layout is the default because it gets the desktop's first screen with
one request at essentially the same image payload. The equal decoded footprint
shows why per-file memory alone was not a sound selection criterion.

## Mixed compact-desktop workload, 1200×900

Initial gallery, Hunter category and keyboard navigation, 24 animation frames
of 1500px scroll increments, then searches for eagle eye, fire, frost bolt,
gem, inv, and sword:

| Measurement                    | 64-icon atlases | 256-icon atlases |
| ------------------------------ | --------------: | ---------------: |
| Distinct requested atlases     |              55 |               24 |
| Cumulative image encoded bytes |       5,028,092 |        8,618,536 |
| p95 observed frame interval    |         18.1 ms |          17.8 ms |
| Requested-image RGBA estimate  |      44,154,880 |       76,668,928 |

This exposes the tradeoff: larger atlases make fewer requests, while sparse
search fetches more unused pixels. The frame interval difference is too small
to claim a meaningful speed advantage. A build targeting scarce bandwidth or
primarily sparse search can set `ATLAS_COLUMNS=8`; the import supports both.

RGBA figures are width × height × 4 over distinct requested images. They are
estimated decoded footprints, not measured browser process/GPU memory, and
cumulative requested images are not necessarily simultaneously resident.
Browser and GPU caches add overhead and decide their own eviction policy.
Resource Timing encoded-body sizes account for server content encoding;
cached resource timings and wire transfer are distinct concepts.

## Search and checks

The warmed full-catalog search measured around 4ms p95 over 30 local test
queries. Initial index construction is included in cold interaction work but
excluded from that warmed number. Search indexes metadata independently of
mounted tiles or downloaded images.

Browser tests observed only same-origin requests. No Wowhead/Zamimg, analytics,
external fonts or API calls occurred during navigation. Passing checks and
screenshots cover both desktop and mobile; in-game compatibility requires a
separate Forever-client test.
