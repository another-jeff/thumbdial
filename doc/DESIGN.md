# ThumbDial — Design Notes

A running record of the design: what the component is today, what was **discussed
but deliberately deferred**, and what was **tried or considered and rejected** (with
the reasoning, so we don't relitigate settled ground or re-walk dead ends).

For a usage/overview summary see [`../README.md`](../README.md). This file is the
"why," not the "how."

---

## 1. What it is today

A self-contained React Native (Expo) component: a **thumb-driven, zoomable, nested
proportional sunburst** for navigating hierarchical data down to a *reference* — a
Bible verse span, a grocery item, a compass heading, etc.

Pure logic is split out and unit-tested so it's verifiable without a device:

| File | Responsibility |
|---|---|
| `lib/arrange.js` | `children → [arrange] → [bucket] → items`; ordering, summary-wheel bucketing, weights, JIT ordinal expansion, pick modes, group-hoisting |
| `lib/sunburst.js` | proportional nested layout + hit-testing (radius = ring, angle = wedge) |
| `lib/selection.js` | coalesce picked indices → ranges → a formatted reference string |
| `components/ThumbDial.js` | rendering (`react-native-svg` + `d3-shape`), the PanResponder gesture, tween, controls |
| `domains/*.js` | one file per list type: tree + citation grammar + copy (`bible`, `grocery`) |

### Engine vs. list type (the domain boundary)

The engine is **domain-agnostic**, and deliberately so — it speaks of *ordinal sets* and
*pick modes*, never of chapters, verses, or groceries:

- **`ordinals: N`** — N implicit leaves `"1".."N"`, expanded just-in-time. This is what
  keeps a Bible tree at ~1,200 chapter nodes instead of ~31,000 verse nodes, and it's why
  a domain can stay a plain JS module.
- **`pick: 'range' | 'set' | false`** — what a node offers when focused, *declared by the
  author*. `ordinals` implies `'range'`. Nothing is inferred from label shapes (see §3).
- **A domain pack** is `{ id, title, tree, grammar?, copy?, hint?, formatSelection? }` —
  one file, registered in `domains/index.js`. The pack shape is an **app** convention:
  `App.js` spreads it onto explicit ThumbDial props, so the component never learns what a
  domain is, and the engine has no import pointing at a dataset.
- **Grammar, not vocabulary.** `{ joiner, between, dash }` drives both the tray string and
  the hub's sweep preview from one source, so `13:1-3` punctuation lives with the Bible.
  A domain whose reference isn't `"<title> <index><joiner><ranges>"` replaces the
  formatter outright via `formatSelection`.

### The interaction model (where behaviors begin and end)

The model was deliberately made *consistent* after an earlier version accreted mode
seams. The rules now (stated in engine terms; the Bible reading is in parentheses):

- **Navigation stops at pick nodes** (chapters). Ordinals (verses) are never a navigation
  target. Lifting anywhere inside a pick node's ordinal territory (its wedge, or an
  ordinal/bucket in an outer ring) truncates to the pick node and lands there.
- **`selecting` ⟺ the focused node declares `pick: 'range'`** — and its children really are
  leaves (a sanity guard, not an inference). That is the *only* place sweep-selection turns on.
- **Selection is sticky.** It's `{node, context, picked}` tied to its pick node and is
  **not** cleared by navigation. Zooming out preserves the in-progress reference; only
  **Use**, **Clear**, or starting a sweep on a *different* pick node resets it.
- **The reference is always visible** in the tray, derived from the sticky selection
  (if any) or the current path.
- **The hub reads like a reference**: a stable title on top, the drilling target below
  (`title` / `index` / `index:ordinal`). A tap on the hub zooms out — including from a
  pick ring, since generated ordinals have no wedge to lift on.

### Design principle we hold firm

**Proportional invariance = spatial memory.** Wedge angles are proportional to subtree
weight at *every* level, computed per-level so relative sizes never change across zoom.
This is the sunburst's whole value ("Psalms is the fat wedge in Wisdom") and is why
several alternatives below were rejected.

---

## 2. Deferred — discussed, not yet built

These are wanted or plausible; they were scoped out of a pass, not ruled out.

- **Basket / cart multi-select (grocery behavior).** A cross-parent accumulator that
  survives navigation and collects unordered items (`Apples`, `Milk`, `Bread`) into a
  list, distinct from the ordinal *range* selection built for verses. Same `＋`/tray
  surface, different coalescing (`set` vs `ordinal`). Designed, not built — the slot for
  it is `pick: 'set'`, already reserved in `pickModeOf`.
- **Multiple pending references (a "reference basket").** Today, starting a sweep on a
  new chapter replaces the sticky selection. Holding several complete references
  (`Jer 5:1-3` **and** `Ps 23:1`) before committing is future work.
- **Cross-chapter ranges** (e.g. `13:1–14:2`). Requires persisting a selection across a
  zoom boundary using absolute indices. Flagged as genuinely harder; deferred.
- **Per-node reveal depth.** Early on we discussed a `reveal: N` field letting a node
  declare how many descendant rings to show when it's the center. We shipped a simpler
  **global `◯/◎/∞` depth clamp** instead. Per-node override remains a possible refinement.
- **Truly unbounded `∞` depth.** `∞` currently caps at ~5 rings (phone legibility). The
  "show everything, best on a wide screen" ideal is deferred to a web/large-screen mode.
- **Pinch-zoom / pan of the whole dial.** Raised early as "another useful enhancement."
- **Chronological arrangement.** Mentioned as an interesting experiment (order books by
  date rather than canon). Only `Canonical` / `A–Z` / `By size` + author-declared
  arrangements exist.
- **Range editing in the tray.** Tapping a range chip to delete just that group; today
  you deselect by sweeping back over it, or Clear everything.
- **Two-tap range entry.** An alternative to sweep (tap start, tap end). Sweep was chosen
  as primary; two-tap could complement it for precision.
- **Curved-label polish.** (a) A straight-rotated-label fallback if `TextPath` ever
  misbehaves on a target. (b) Final vertical-centering trim — the baseline sits on the
  mid-band circle via `alignmentBaseline`, and a residual up/down bias (if any) is a
  one-line correction pending a "which way" observation on-device.
- **Animated label transitions.** Labels are suppressed during the zoom tween and snap
  back at the end; tweening them along with the arcs is future polish.
- **Large-cardinality verse rings.** A 176-verse chapter (Ps 119) still yields thin
  wedges; decade-block shading/labels help, but a "zoom into a block to refine" step may
  be warranted.

---

## 3. Rejected — tried or considered, and why

Kept explicitly so we don't circle back.

- **Concentric equal-slice rings ("telescope" drill-without-lifting).** *Built, then
  scrapped.* Radius = depth, angle = sibling; nudge outward to grow the next ring in one
  gesture. It threw away the two things a sunburst exists for: **magnitude** (every ring
  was equal-sized) and **spatial constancy** (each ring re-spanned the full 360°, so
  nothing sat still to remember). Replaced by the zoomable nested *proportional* sunburst.
  This rejection is the origin of the "proportional invariance" principle above.

- **Force-press to navigate.** *Built, then removed.* Read `touch.force` to commit on a
  firm press. `force` is iOS-flavored; most Android devices and mouse/web report `0` (or a
  constant `0.5`), so it wasn't portable — an interaction that silently does nothing on
  half of devices is worse than none.

- **`＋ select` mode toggle.** *Replaced.* An explicit toggle to enter verse-selection
  read as extra modedness. Selection is now **always on** at the chapter level (you're
  always driving toward a reference), which removed a seam.

- **Bucketing verses during selection.** *Rejected.* Range-buckets like `15–25` make it
  impossible to select an arbitrary span like `19–26` that crosses a bucket boundary.
  Verses are always shown individually while selecting; buckets are for *browsing* only.

- **Clearing selection on navigation.** *Rejected.* It "blew away any ref you just
  selected" the moment you zoomed out. Selection is now sticky (§1).

- **Navigating into verses / verse-buckets.** *Rejected.* It created two inconsistent ways
  into "all verses" (via a chapter, or via a verse-bucket wedge). Navigation now stops at
  chapters; touching verse territory lands on the chapter.

- **Weighting as a separate slice-sizing toggle.** *Folded away.* Since proportional sizing
  is now always on, "By size" no longer *resizes* — it only reorders (largest first). A
  standalone equal-vs-proportional switch would contradict the core principle.

- **`alignmentBaseline` on `<TextPath>`.** *Rejected — crashes.* On Android
  (`com.horcrux.svg`) it hits a strict `valueOf("central")` with no matching enum constant
  and throws at launch. The prop is valid on `<Text>`, which is where it stays.

- **Radius-shift "fudge" for label centering.** *Rejected.* Nudging the baseline radius by
  `±0.35·fontSize` to fake vertical centering guessed the glyph-growth direction and read
  as inconsistent "slop." Replaced by `alignmentBaseline` on the text element.

- **Single-letter fallback for numbers/ranges.** *Rejected.* Abbreviating `1–25` to `1`, or
  `12` to `1`, is actively misleading. Numbers and ranges are now all-or-nothing; the
  single-initial fallback applies to word labels only.

- **Aggressive letter-spacing on everything.** *Rejected.* Spreading numbers/ranges looked
  silly (`1 – 1 0`). Letter-spacing is now word-labels-only and gentle (fills ~⅓ of a wide
  arc, capped low).

- **"Last two context nodes = book + chapter" reference heuristic.** *Rejected.* It emitted
  nonsense like `Proph Jeremiah` at the book level. The formatter now walks the path
  semantically — index = deepest node with a pick mode (numeric-label fallback), title =
  nearest node above it that is neither an index nor a `group`.

- **Inferring behavior from label shapes.** *Rejected — replaced by declarations.* The engine
  used to decide *what a node is* by testing labels against `/^\d+$/`: `selecting` meant "all
  children are numeric leaves," `atBook` meant "all children are numeric branches," and the
  formatter's chapter/book roles came from the same regex. It read as elegant (zero
  configuration!) but it made the Bible's conventions load-bearing in general code, and it was
  a live bug: any dataset with numeric labels for something *else* — a quantity, a size, an
  aisle or house number — would silently acquire a sweep-select verse ring and a `:`-joined
  reference. Nodes now **declare** what they offer (`ordinals`, `pick`), which also gives the
  deferred basket mode a home (`pick: 'set'`) instead of requiring a second sniffer. The
  numeric fallback survives in *one* place only — the default formatter's role-finding, where
  it degrades a plain navigation path gracefully rather than switching a behavior on.

- **A `BibleDial` wrapper component.** *Not chosen (for now).* Splitting a generic
  `SunburstDial` from a thin domain wrapper is the strongest boundary, but it doubles the
  component surface to maintain for a single app. Domain packs get most of the isolation for
  a fraction of the cost. Revisit if the engine is ever published separately.

- **In-ring "A–Z" index item.** *Not chosen.* Surfacing arrangements as an extra slice in
  the wheel was offered; a **chip row** above the dial was chosen instead (doesn't spend a
  wedge, more discoverable). Author-declared cross-level indexes (`books-az`) cover the
  "gather all books" case.

- **Flip-that-ring-to-a-list for huge leaf sets.** *Not chosen.* When a ring is all leaves
  and too many, we stay radial (bucket + zoom) rather than switching that ring to a
  scrollable list — keeping one consistent metaphor. Revisit only if radial genuinely fails.

- **`d3-hierarchy` for layout.** *Considered, not needed.* The nested partition is
  hand-rolled in `sunburst.js` (per-level angular subdivision), so only `d3-shape` (arc
  geometry) is a dependency. D3's DOM renderers don't run in React Native regardless — only
  its math is usable, behind `react-native-svg`.

---

## 4. Fixed, worth remembering

- **Runaway bucket recursion at small `maxSlices`.** *Fixed 2026-07-30, found by the new test
  suite.* `makeBucket` re-buckets any bucket still holding more than `maxSlices` members, but
  nothing guaranteed a split actually *shrank* its input: `pickNiceStep` could pick a ladder
  step coarser than the whole range (150 items → one `1–150` bucket → re-bucket the same 150
  → …), and `chunkBuckets` did the same whenever `maxSlices < 2`. It blew the stack rather
  than hanging, so a dial configured with `maxSlices={4}` crashed on numeric data. Both split
  functions now guarantee at least two buckets. The default `maxSlices` of 12 never reached
  it, which is why it survived this long — the guarding test sweeps a matrix of sizes against
  `maxSlices` 1–12.

---

## 5. Known limitations / rough edges

- **Curved-label vertical position** may still carry a small bias on some renderers
  (see §2). The horizontal (angular) centering relies on `textAnchor="middle"` +
  `startOffset="50%"`.
- **Very dense verse rings** (100+ verses) produce small targets; sweep + hub readout
  mitigate, block labels orient, but it's the standing hard case.
- **Reference formatting** assumes a `"<title> <index><joiner><ranges>"` citation shape.
  A domain tunes its punctuation with `grammar`; anything structurally different (a
  coordinate, a duration, a path) needs `formatSelection`. The old "numeric level =
  chapter/verse" inference is gone from behavior and survives only as a fallback for
  role-finding on plain navigation paths.
- **Web/native parity** is validated by a headless `expo export --platform web` bundle;
  actual on-device rendering (curved text especially) still needs a human eye.
