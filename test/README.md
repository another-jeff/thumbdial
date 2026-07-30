# Tests

```bash
npm test           # everything (143 assertions, ~70ms)
npm run test:watch # re-run on change
node --test test/selection.test.mjs   # one file
```

Note the scripts pass a **quoted glob**, not a directory: `node --test test/` tries to load
`test/` as a module and dies on Node 24.15. Keep the glob.

Node's built-in runner (`node --test` + `node:assert`) — **no test dependencies**, so
this stays runnable on a bare `npm install` and can't drift from the app's toolchain.
Files are `.mjs` because the package isn't `type: module`; the app's own modules are
ESM already and Metro doesn't care.

## What's covered

| File | Covers |
|---|---|
| `arrange.test.mjs` | ordinal expansion, **pick-mode declarations**, weights, arrangements, summary-wheel bucketing, group hoisting |
| `sunburst.test.mjs` | layout structure, **proportional invariance**, hit-testing (rings, wedges, boundaries, shallow-leaf fallback) |
| `selection.test.mjs` | coalescing picks into ranges, citation roles, reference grammars |
| `domains.test.mjs` | the pack contract + a structural check of every shipped tree, and per-domain behavior |
| `helpers.mjs` | tree walking, float comparison, `assertPartitions` |

Only pure logic is tested. `components/ThumbDial.js` (rendering, gesture, tween) has no
coverage here — it needs a device or a React Native test renderer. The standing check for
it is `npx expo export --platform web` (bundles the whole graph) plus a human eye on
curved labels; see `doc/DESIGN.md` §5.

## Conventions

- **Test names read as claims about behavior**, not as function names — `'buckets recurse
  when still over budget'`, not `'test bucketize 3'`.
- **Regressions are labelled `REGRESSION:` and cite the reason**, usually a `doc/DESIGN.md`
  §3 entry. Those tests exist to stop a rejected approach from coming back; don't delete one
  without reading why it's there.
- **`assertPartitions`** (in `helpers.mjs`) encodes the proportional-invariance invariant.
  Reach for it whenever you touch layout.
- `domains.test.mjs`'s `validateTree` block is a hand-rolled stand-in for the **JSON Schema
  + validator** we still want. When that lands, those assertions should become schema checks.
