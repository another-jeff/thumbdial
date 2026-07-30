/**
 * lib/arrange.js — the children → [arrange] → [bucket] → items pipeline.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  childrenOf,
  pickModeOf,
  leafCount,
  effectiveWeight,
  isBranch,
  availableArrangements,
  buildDisplay,
} from '../lib/arrange.js';
import { labelsOf } from './helpers.mjs';

const leaf = (label, extra = {}) => ({ label, ...extra });
const branch = (label, kids, extra = {}) => ({ label, children: kids, ...extra });

describe('childrenOf — JIT ordinal expansion', () => {
  test('returns authored children as-is (same array identity)', () => {
    const kids = [leaf('a'), leaf('b')];
    const node = branch('n', kids);
    assert.equal(childrenOf(node), kids);
  });

  test('expands ordinals: N to leaves "1".."N"', () => {
    const kids = childrenOf({ label: '13', ordinals: 19 });
    assert.equal(kids.length, 19);
    assert.deepEqual(labelsOf([kids[0], kids[18]]), ['1', '19']);
    assert.ok(kids.every((k) => k.__ordinal === true), 'tagged __ordinal');
    assert.ok(kids.every((k) => !isBranch(k)), 'ordinals are leaves');
  });

  test('authored children win over ordinals', () => {
    const node = { label: 'n', ordinals: 5, children: [leaf('only')] };
    assert.deepEqual(labelsOf(childrenOf(node)), ['only']);
  });

  test('a leaf has no children', () => {
    assert.deepEqual(childrenOf(leaf('Milk')), []);
    assert.deepEqual(childrenOf({ label: 'n', children: [] }), []);
  });

  test('ordinals: 0 expands to nothing', () => {
    assert.deepEqual(childrenOf({ label: 'n', ordinals: 0 }), []);
  });
});

describe('pickModeOf — declared, never inferred', () => {
  test('ordinals implies range', () => {
    assert.equal(pickModeOf({ label: '13', ordinals: 19 }), 'range');
  });

  test('pick: false opts out even with ordinals', () => {
    assert.equal(pickModeOf({ label: '13', ordinals: 19, pick: false }), null);
  });

  test('explicit pick: range for authored ordinal children', () => {
    assert.equal(pickModeOf(branch('n', [leaf('1')], { pick: 'range' })), 'range');
  });

  test("'set' passes through (reserved for basket mode)", () => {
    assert.equal(pickModeOf(branch('Cart', [leaf('Milk')], { pick: 'set' })), 'set');
  });

  test('a plain branch picks nothing', () => {
    assert.equal(pickModeOf(branch('Fresh', [leaf('Fruits')])), null);
  });

  test('a plain leaf picks nothing', () => {
    assert.equal(pickModeOf(leaf('Milk')), null);
  });

  test('synthetic buckets never pick', () => {
    assert.equal(pickModeOf({ label: '1–25', ordinals: 9, __bucket: true }), null);
    assert.equal(pickModeOf({ label: '1–25', pick: 'range', __bucket: true }), null);
  });

  test('tolerates null/undefined', () => {
    assert.equal(pickModeOf(null), null);
    assert.equal(pickModeOf(undefined), null);
  });

  test('REGRESSION: numeric labels alone do not turn on range-selection', () => {
    // The bug the declaration model exists to prevent (doc/DESIGN.md §3): sizes,
    // quantities, aisle or house numbers must not become a sweepable verse ring.
    const sizes = branch('Eggs', [leaf('6'), leaf('12'), leaf('18')]);
    assert.equal(pickModeOf(sizes), null);
    // ...nor when they're numeric BRANCHES (the old `atBook` sniff).
    const aisles = branch('Store', [branch('1', [leaf('Milk')]), branch('2', [leaf('Bread')])]);
    assert.equal(pickModeOf(aisles), null);
    assert.ok(aisles.children.every((c) => pickModeOf(c) === null));
  });
});

describe('weights', () => {
  test('a leaf counts 1', () => {
    assert.equal(leafCount(leaf('x')), 1);
  });

  test('a branch sums its descendants', () => {
    assert.equal(leafCount(branch('n', [leaf('a'), branch('m', [leaf('b'), leaf('c')])])), 3);
  });

  test('ordinals count as that many leaves', () => {
    assert.equal(leafCount({ label: '13', ordinals: 19 }), 19);
  });

  test('explicit value overrides the derived count', () => {
    assert.equal(effectiveWeight(branch('n', [leaf('a'), leaf('b')])), 2);
    assert.equal(effectiveWeight(branch('n', [leaf('a'), leaf('b')], { value: 100 })), 100);
  });

  test('value: 0 is honored, not treated as absent', () => {
    assert.equal(effectiveWeight(branch('n', [leaf('a')], { value: 0 })), 0);
  });

  test('value does not affect leafCount', () => {
    assert.equal(leafCount(branch('n', [leaf('a')], { value: 99 })), 1);
  });

  test('isBranch', () => {
    assert.equal(isBranch(branch('n', [leaf('a')])), true);
    assert.equal(isBranch({ label: 'n', ordinals: 3 }), true);
    assert.equal(isBranch(leaf('n')), false);
    assert.equal(isBranch({ label: 'n', children: [] }), false);
  });
});

describe('availableArrangements', () => {
  const of = (node) => availableArrangements(node).map((a) => a.id);

  test('canonical is always offered, first', () => {
    assert.equal(availableArrangements(leaf('x'))[0].id, 'canonical');
  });

  test('A–Z when there are several word-labelled children', () => {
    assert.ok(of(branch('n', [leaf('b'), leaf('a')])).includes('az'));
  });

  test('no A–Z for an ordinal sequence (already ordered)', () => {
    assert.ok(!of(branch('n', [leaf('1'), leaf('2'), leaf('3')])).includes('az'));
  });

  test('no A–Z for a single child', () => {
    assert.ok(!of(branch('n', [leaf('only')])).includes('az'));
  });

  test('By size only when weights actually vary', () => {
    const flat = branch('n', [leaf('a'), leaf('b')]);
    const varied = branch('n', [leaf('a'), branch('b', [leaf('x'), leaf('y')])]);
    assert.ok(!of(flat).includes('size'));
    assert.ok(of(varied).includes('size'));
  });

  test('author-declared arrangements are included, and suppress auto A–Z', () => {
    const node = branch('n', [leaf('b'), leaf('a')], {
      arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }],
    });
    const ids = of(node);
    assert.ok(ids.includes('books-az'));
    assert.ok(!ids.includes('az'), 'authored ordering takes over');
  });

  test('de-duplicates by label', () => {
    const node = branch('n', [leaf('b'), leaf('a')], {
      arrangements: [{ id: 'mine', label: 'A–Z', sort: 'label' }],
    });
    const labels = availableArrangements(node).map((a) => a.label);
    assert.equal(new Set(labels).size, labels.length);
  });
});

describe('buildDisplay — ordering', () => {
  const node = branch('n', [
    branch('Cherry', [leaf('a')]),
    branch('apple', [leaf('b'), leaf('c'), leaf('d')]),
    branch('Banana', [leaf('e'), leaf('f')]),
  ]);

  test('canonical preserves authored order', () => {
    assert.deepEqual(labelsOf(buildDisplay(node, 'canonical').items), ['Cherry', 'apple', 'Banana']);
  });

  test('az sorts case-insensitively', () => {
    assert.deepEqual(labelsOf(buildDisplay(node, 'az').items), ['apple', 'Banana', 'Cherry']);
  });

  test('az sorts numerically where labels are numbers', () => {
    const nums = branch('n', [leaf('10'), leaf('2'), leaf('1')]);
    assert.deepEqual(labelsOf(buildDisplay(nums, 'az').items), ['1', '2', '10']);
  });

  test('size sorts by weight, descending', () => {
    assert.deepEqual(labelsOf(buildDisplay(node, 'size').items), ['apple', 'Banana', 'Cherry']);
  });

  test('size reports proportional; canonical does not', () => {
    assert.equal(buildDisplay(node, 'size').proportional, true);
    assert.equal(buildDisplay(node, 'canonical').proportional, false);
  });

  test('an authored arrangement gathers across levels via depth', () => {
    const tree = branch('root', [
      branch('G1', [leaf('Zeta'), leaf('Alpha')]),
      branch('G2', [leaf('Mid')]),
    ], { arrangements: [{ id: 'flat', label: 'Flat', depth: 2, sort: 'label' }] });
    assert.deepEqual(labelsOf(buildDisplay(tree, 'flat').items), ['Alpha', 'Mid', 'Zeta']);
  });

  test('an unknown arrangement id falls back to canonical', () => {
    assert.deepEqual(labelsOf(buildDisplay(node, 'nope').items), ['Cherry', 'apple', 'Banana']);
  });
});

describe('buildDisplay — summary-wheel bucketing', () => {
  const ordinals = (n) => Array.from({ length: n }, (_, i) => leaf(String(i + 1)));

  test('leaves a short list alone', () => {
    const { items } = buildDisplay(branch('n', ordinals(5)), 'canonical', { maxSlices: 12 });
    assert.equal(items.length, 5);
    assert.ok(!items.some((i) => i.__bucket));
  });

  test('buckets a long numeric list onto ladder steps', () => {
    const { items } = buildDisplay(branch('n', ordinals(150)), 'canonical', { maxSlices: 12 });
    assert.ok(items.length <= 12, `got ${items.length} slices`);
    assert.ok(items.every((i) => i.__bucket));
    assert.deepEqual(labelsOf(items).slice(0, 2), ['1–25', '26–50']);
    assert.equal(labelsOf(items).at(-1), '126–150');
  });

  test('buckets partition the members with no loss and no overlap', () => {
    const { items } = buildDisplay(branch('n', ordinals(150)), 'canonical', { maxSlices: 12 });
    const covered = items.flatMap((b) => labelsOf(b.children.flatMap(flatten)));
    assert.equal(covered.length, 150, 'every member appears exactly once');
    assert.equal(new Set(covered).size, 150);
    function flatten(n) {
      return n.__bucket ? n.children.flatMap(flatten) : [n];
    }
  });

  test('a bucket reports how many items it holds', () => {
    const { items } = buildDisplay(branch('n', ordinals(150)), 'canonical', { maxSlices: 12 });
    assert.equal(items[0].detail, '25 items');
  });

  test('buckets recurse when still over budget', () => {
    const { items } = buildDisplay(branch('n', ordinals(150)), 'canonical', { maxSlices: 4 });
    assert.ok(items.length <= 4);
    assert.ok(items.some((b) => b.children.some((c) => c.__bucket)), 'nested buckets');
  });

  // REGRESSION: bucketing used to recurse forever whenever a split produced a
  // single bucket holding its whole input (a ladder step coarser than the range,
  // or maxSlices < 2). It blew the stack rather than hanging, so it would have
  // surfaced as a crash on any dial configured with a small maxSlices.
  test('every split strictly shrinks its input — no runaway recursion', () => {
    for (const maxSlices of [1, 2, 3, 4, 5, 7, 12]) {
      for (const n of [5, 6, 10, 26, 150, 176]) {
        const numeric = buildDisplay(branch('n', ordinals(n)), 'canonical', { maxSlices });
        const words = buildDisplay(
          branch('n', Array.from({ length: n }, (_, i) => leaf(`Item ${i + 1}`))),
          'canonical',
          { maxSlices }
        );
        for (const [kind, { items }] of [['numeric', numeric], ['words', words]]) {
          assert.ok(items.length > 0, `${kind} n=${n} maxSlices=${maxSlices}: produced slices`);
          assertShrinks(items, n, `${kind} n=${n} maxSlices=${maxSlices}`);
        }
      }
    }
    function assertShrinks(items, parentSize, where) {
      for (const it of items) {
        if (!it.__bucket) continue;
        const held = countLeaves(it);
        assert.ok(held < parentSize, `${where}: bucket ${it.label} holds ${held} of ${parentSize}`);
        assertShrinks(it.children, held, where);
      }
    }
    function countLeaves(n) {
      return n.__bucket ? n.children.reduce((s, c) => s + countLeaves(c), 0) : 1;
    }
  });

  test('degenerate maxSlices still terminates and keeps every member', () => {
    const { items } = buildDisplay(branch('n', ordinals(20)), 'canonical', { maxSlices: 1 });
    const reachable = [];
    (function collect(list) {
      for (const n of list) (n.__bucket ? collect(n.children) : reachable.push(n));
    })(items);
    assert.equal(reachable.length, 20);
  });

  test('non-numeric labels chunk into First–Last, truncated to 4 chars', () => {
    const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    const { items } = buildDisplay(branch('n', words.map((w) => leaf(w))), 'canonical', {
      maxSlices: 3,
    });
    assert.equal(items.length, 3);
    assert.deepEqual(labelsOf(items), ['Alph–Brav', 'Char–Delt', 'Echo–Foxt']);
  });

  test('a single-member chunk is labelled with just that member', () => {
    const { items } = buildDisplay(branch('n', ['A', 'B', 'C'].map(leaf)), 'canonical', {
      maxSlices: 2,
    });
    assert.deepEqual(labelsOf(items), ['A–B', 'C']);
  });

  test('proportional bucketing preserves total weight', () => {
    const kids = ordinals(150);
    const before = kids.reduce((s, k) => s + effectiveWeight(k), 0);
    const { items } = buildDisplay(branch('n', kids), 'size', { maxSlices: 12 });
    const after = items.reduce((s, b) => s + effectiveWeight(b), 0);
    assert.equal(after, before, 'proportions survive bucketing');
    assert.ok(items.every((b) => b.__proportional));
  });
});

describe('buildDisplay — group hoisting (the Flatten control)', () => {
  const tree = branch('root', [
    branch('Wisdom', [branch('Psalms', [leaf('a'), leaf('b')]), branch('Job', [leaf('c')])], {
      group: true,
    }),
    branch('Prophets', [branch('Isaiah', [leaf('d')])], { group: true }),
    branch('Standalone', [leaf('e')]),
  ]);

  test('off by default: groups stay as their own ring', () => {
    assert.deepEqual(labelsOf(buildDisplay(tree, 'canonical').items), [
      'Wisdom',
      'Prophets',
      'Standalone',
    ]);
  });

  test('on: groups are replaced by their children, in order', () => {
    const { items } = buildDisplay(tree, 'canonical', { collapseGroups: true });
    assert.deepEqual(labelsOf(items), ['Psalms', 'Job', 'Isaiah', 'Standalone']);
  });

  test('hoisting is recursive', () => {
    const nested = branch('root', [
      branch('Outer', [branch('Inner', [leaf('x')], { group: true })], { group: true }),
    ]);
    const { items } = buildDisplay(nested, 'canonical', { collapseGroups: true });
    assert.deepEqual(labelsOf(items), ['x']);
  });

  test('hoisting preserves total weight, so proportions do not shift', () => {
    const grouped = buildDisplay(tree, 'canonical').items;
    const flat = buildDisplay(tree, 'canonical', { collapseGroups: true }).items;
    const sum = (xs) => xs.reduce((s, x) => s + effectiveWeight(x), 0);
    assert.equal(sum(flat), sum(grouped));
  });
});
