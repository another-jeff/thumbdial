# Working notes for ThumbDial

Conventions for anyone (human or agent) making changes here. Design rationale lives in
[`doc/DESIGN.md`](doc/DESIGN.md); the usage contract lives in [`README.md`](README.md).

## Source control

- **Never push. Not ever.** No `git push`, no PR creation, no publishing. Remote state is
  the maintainer's to change.
- **Prepare commits for review.** Committing locally is expected and wanted — leave the work
  as a clean, readable history the maintainer can read, amend, reorder, or discard.
- **Prefer small commits.** One coherent change each, with a message saying *why*, not just
  what. A refactor pass may be larger when splitting it would be artificial.
- **Every commit should build and pass tests.** Don't split a change in a way that leaves an
  intermediate commit broken just to make the commits smaller — bisectability beats size.
- Work on a branch when the change is substantial; `main` is fine for small, reviewed-in-place
  passes. Ask before rewriting existing history.

## Before you call something done

```bash
npm test                # pure logic — fast, no device needed
npm run validate        # every domain tree against schema/node.schema.json
npm run bundle-check    # bundles the whole graph (expo export --platform web)
```

`npm test` covers `lib/` and `domains/`. It does **not** cover `components/ThumbDial.js` —
rendering, gesture, and tween need a device or an RN test renderer, so `bundle-check` plus
the maintainer's own eye on the running app is the standing check there. The maintainer runs
the live app (`npm start`, Expo QR); don't assume you can see it.

## Architecture in one paragraph

`lib/` is pure, domain-agnostic logic (`arrange` → ordering/bucketing/pick modes, `sunburst` →
layout + hit-testing, `selection` → ranges + citation formatting). `components/ThumbDial.js`
renders and handles touch. `domains/*.js` is one file per list type (tree + grammar + copy),
registered in `domains/index.js`. **Nothing in `lib/` or `components/` may name a domain
concept** — no chapters, no verses, no groceries. The engine speaks *ordinals* and *pick
modes*; see the pick-mode table in README.

## Two rules that keep getting rediscovered

1. **Never infer behavior from label shapes.** Nodes *declare* what they offer (`ordinals`,
   `pick`). Testing labels against `/^\d+$/` to decide what something is looks elegant and is
   a bug — any dataset with numeric labels for a quantity, size, or aisle number acquires the
   wrong behavior silently. Rejected in DESIGN.md §3; there are `REGRESSION:`-tagged tests
   guarding it.
2. **Proportional invariance is the point.** Wedge angles are proportional to subtree weight
   at every level, so relative sizes never change across zoom — that's the spatial memory the
   whole component exists to provide. `assertPartitions` in `test/helpers.mjs` encodes it.
   Anything that would make rings equal-sized has already been built, rejected, and removed.

Also: `alignmentBaseline="central"` belongs on `<Text>` and **crashes Android on
`<TextPath>`**. Don't move it.

## The node contract has one source of truth

`schema/node.schema.json` is it. Adding or changing a node field means editing the schema
(with a `description` — it doubles as the spec), then `lib/validate.js` if the rule is
cross-field or needs engine logic, then a bad fixture in `test/validate.test.mjs`, then
README's node-shape block. `lib/validate.js` interprets a deliberately small JSON Schema
subset; if you need a keyword it lacks, teach the interpreter — a guard test fails rather than
letting the schema quietly stop being enforced.

## Docs are part of the change

- Scoping decision made, or an approach tried and rejected? → `doc/DESIGN.md` (§2 deferred,
  §3 rejected *with the reasoning*). It exists so settled ground isn't relitigated.
- Node contract, props, or payload changed? → `README.md`.
- New behavior? → a test whose name reads as a claim about behavior.
