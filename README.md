# ThumbDial

A self-contained React Native (Expo) component: a **thumb-driven, zoomable, nested
proportional sunburst** for navigating hierarchical data down to a *reference* — a
Bible verse span (`1 Cor 13:1-3; 10-12; 18`), a grocery item, a compass heading.

It's a riff on the classic zoomable sunburst, reworked for a thumb: drag to read a
wedge out in the hub, lift to zoom in, tap the hub to zoom out — and, at the deepest
ordinal level, sweep to build ranges. Wedge angles are proportional to subtree size at
every level, so the *shape* is a stable spatial memory as you drill.

## Run it

```bash
npm install
npm start        # then scan the QR with Expo Go, or press w / i / a
```

The demo (`App.js`) switches between two **domains** (Bible, Grocery) and echoes the
committed reference. Runs on iOS, Android, and web from one codebase.

## Verify the logic (no device needed)

The layout/selection logic is pure and unit-tested — 143 assertions, no test dependencies
(Node's built-in runner):

```bash
npm test                # lib/ + domains/  (see test/README.md)
npm run bundle-check    # bundles the whole graph via expo export
```

## Domains (list types)

The dial is domain-agnostic: it knows about *ordinal sets* and *pick modes*, never
about chapters, verses, or groceries. Everything specific to a dataset lives in one
file under [`domains/`](domains/):

```js
// domains/bible.js
export default {
  id: 'bible',
  title: 'Bible',
  tree,                                          // the hierarchy
  grammar: { joiner: ':', between: '; ', dash: '-' },   // → "1 Cor 13:1-3; 10-12; 18"
  copy: { pickHint: 'Sweep across verses', ... },       // wording
  hint: 'Drag to read · …',                             // app-level help line
  // formatSelection?  — only if the reference isn't "<title> <index><joiner><ranges>"
}
```

Only `tree` is required. `domains/index.js` is the registry; adding a list type means
adding one file. The pack shape is an **app** convention — `App.js` spreads a pack onto
explicit props, so the component never learns what a domain is.

## Using the component

```jsx
<ThumbDial
  data={tree}
  onSelect={(leaf, ctx) => {/* a single leaf conclusion: ctx.labels, ctx.path */}}
  onCommitSelection={(ref) => {/* a compound reference (see below) */}}
  grammar={{ joiner: ':', between: '; ', dash: '-' }}             // optional punctuation
  copy={{ pickHint, navHint, pickParentHint }}                    // optional wording
  formatSelection={(context, groups, labels) => "custom string"}  // optional, overrides grammar
  maxSlices={12}   // overflow → summary wheels
  depth={2}        // initial visible rings (the ◯/◎/∞ clamp): 1 | 2 | 5
/>
```

### Node shape

```js
{
  label: 'John',            // required
  short: 'Jn',              // optional abbreviation used when a wedge is small
  detail: '21 chapters',    // optional hub detail
  children: [ ... ],        // present & non-empty ⇒ branch
  ordinals: 19,             // OR: N implicit leaves "1".."N", expanded just-in-time
  pick: 'range',            // what this node offers when focused — see below
  block: 10,                // shade/label ordinals in blocks of N while picking (default 10)
  value: 100,               // optional explicit weight (else derived from leaf count)
  color: '#...',            // optional slice color override
  group: true,              // organizational layer the "Flatten" control can hoist away
  arrangements: [ ... ],    // optional author-declared orderings (see below)
  meta: { any: 'payload' }, // rides along on select (the whole node is handed back)
}
```

### Pick mode — declared, never inferred

A node's behavior when you land on it is the **author's declaration**, not a guess from
label shapes:

| Declaration | Behavior |
|---|---|
| `ordinals: N` | N ordinal leaves; implies `pick: 'range'` |
| `pick: 'range'` | sweep the (authored) ordinal children into ranges |
| `pick: false` | navigate only, even with `ordinals` |
| *absent* | navigate only; a leaf commits via `onSelect` |

`pick: 'set'` is reserved for the deferred cross-parent basket mode. Navigation stops at
pick nodes — touching a node's ordinal territory lands you on the node, since its ring is
for selecting rather than navigating.

### Author-declared arrangements

Beyond the automatic `Canonical` / `A–Z` / `By size`, a node can offer cross-level
indexes — e.g. gather every book two levels down and sort them:

```js
arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }]
```

### Selection payload

`onCommitSelection` (and the tray's **Use ✓**) yields:

```js
{ context: Node[],                 // path to the pick node (buckets stripped)
  groups:  [{from, to}, ...],      // contiguous ranges (index space)
  labels:  ['1','2', ...],         // ordinal labels
  formatted: '1 Cor 13:1-3; 10-12; 18' }  // via formatSelection, or grammar + the default
```

The default formatter reads roles off the path — the **index** is the deepest node with a
pick mode (numeric-label fallback for plain navigation paths), the **title** is the nearest
node above it that is neither `group` nor an index.

## How it's built

| File | Responsibility |
|---|---|
| `lib/arrange.js` | ordering, summary-wheel bucketing, weights, JIT ordinals, pick modes, group-hoisting |
| `lib/sunburst.js` | proportional nested layout + hit-testing |
| `lib/selection.js` | ranges, citation roles, reference formatting |
| `components/ThumbDial.js` | rendering (`react-native-svg` + `d3-shape`), gesture, tween, controls |
| `domains/*.js` | one file per list type: tree + grammar + copy |
| `test/*.test.mjs` | pure-logic suite (`npm test`) — see [`test/README.md`](test/README.md) |

Conventions for making changes — including source-control rules — are in
[`CLAUDE.md`](CLAUDE.md).

Design rationale, deferred features, and rejected approaches (and why) live in
[`doc/DESIGN.md`](doc/DESIGN.md).
