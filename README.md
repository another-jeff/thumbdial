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

The demo (`App.js`) shows two datasets (Bible, Grocery) and echoes the committed
reference. Runs on iOS, Android, and web from one codebase.

## Verify the logic (no device needed)

The layout/selection logic is pure and unit-tested:

```bash
node lib/... # (see the test scripts) — or bundle-check the whole graph:
npx expo export --platform web    # look for "Exported"; then rm -rf dist
```

## Using the component

```jsx
<ThumbDial
  data={tree}
  onSelect={(leaf, ctx) => {/* a single leaf conclusion: ctx.labels, ctx.path */}}
  onCommitSelection={(ref) => {/* a compound reference (see below) */}}
  formatSelection={(context, groups, labels) => "custom string"}  // optional
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
  verses: 21,               // OR: a leaf-count expanded to verse leaves "1".."N" just-in-time
  value: 100,               // optional explicit weight (else derived from leaf count)
  color: '#...',            // optional slice color override
  group: true,              // organizational layer the "Flatten" control can hoist away
  arrangements: [ ... ],    // optional author-declared orderings (see below)
  meta: { any: 'payload' }, // handed back on select
}
```

### Author-declared arrangements

Beyond the automatic `Canonical` / `A–Z` / `By size`, a node can offer cross-level
indexes — e.g. gather every book two levels down and sort them:

```js
arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }]
```

### Selection payload

`onCommitSelection` (and the tray's **Use ✓**) yields:

```js
{ context: Node[],                 // path to the chapter (buckets stripped)
  groups:  [{from, to}, ...],      // contiguous verse ranges (index space)
  labels:  ['1','2', ...],         // verse labels
  formatted: '1 Cor 13:1-3; 10-12; 18' }  // via formatSelection or the default
```

## How it's built

| File | Responsibility |
|---|---|
| `lib/arrange.js` | ordering, summary-wheel bucketing, weights, JIT verses, group-hoisting |
| `lib/sunburst.js` | proportional nested layout + hit-testing |
| `lib/selection.js` | ranges + reference formatting |
| `components/ThumbDial.js` | rendering (`react-native-svg` + `d3-shape`), gesture, tween, controls |
| `data/samples.js` | demo trees |

Design rationale, deferred features, and rejected approaches (and why) live in
[`doc/DESIGN.md`](doc/DESIGN.md).
