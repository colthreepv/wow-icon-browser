# Semantic browse groups

Browse groups are editorial enrichments derived from original folder names and
representative filenames, not official Blizzard/Wowhead taxonomy or verified
Forever availability. Original catalog records and category associations are
never rewritten. The inspector labels original folders explicitly.

## Classification

The snapshot contains 403 source folders, including 293 with fewer than 24 icons.
Three independent curation passes covered achievements and the two halves of
the remaining small-folder inventory. The integrated mapping consolidates 292
of those folders into meaningful themes, while Mining keeps its independent
identity and 15 icons. All classes and professions are protected in code.

Twenty-four is a review signal, not an automatic minimum. Specific themes can
remain small: professions and collecting, sanctums and covenants, or a distinct
activity do not have to be combined with unrelated images to meet a quota.

Related large achievement folders also join their semantic peers: Character
joins Characters & progression; Dungeons and Raids join Dungeons & raids; PvP
joins PvP & factions; Zones & Quests joins Exploration & milestones. This avoids
near-duplicate sibling labels. Housing-related folders from separate passes
were normalized into one Housing & decor theme.

The final result is 297 mapped source folders, 31 curated destination themes,
and 137 browse groups. Mapping tables are in `src/data/semantic-*.json`; they
are deterministic static data with no runtime AI or service dependency.

## Provenance and behavior

- Intermediate tree nodes aggregate all descendants with per-icon deduplication.
- Clicking a semantic group filters all matching original source associations.
- Existing URLs referring to an original source folder retain their exact scope.
- Source filenames, texture paths and original folders remain unchanged.
- Expansion state and sidebar width persist locally. Share links reveal selected
  branches; resizing is available by pointer and keyboard on desktop.
- Broad or ambiguous filename-based assignments are best-effort. They can be
  revised by editing the mapping without re-importing or recompressing images.

Core tests cover path boundaries, aggregate counts, protected identities and
preserved associations. Browser tests cover semantic filters, ancestor links,
legacy source links, Mining, width persistence, drag/keyboard limits and the
mobile category drawer. All 33,193 icon identities remain searchable.
