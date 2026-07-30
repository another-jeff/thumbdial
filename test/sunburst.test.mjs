/**
 * lib/sunburst.js — nested proportional layout + hit-testing.
 *
 * The load-bearing property here is proportional invariance (doc/DESIGN.md §1):
 * a child's arc nests strictly inside its parent's, and angle ∝ subtree weight
 * at every level. Several tests assert exactly that, because it's the reason the
 * component exists.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { layout, hitTest, ringRadii } from '../lib/sunburst.js';
import { buildDisplay } from '../lib/arrange.js';
import { assertClose, assertPartitions, labelsOf, TAU } from './helpers.mjs';

const leaf = (label) => ({ label });
const branch = (label, kids, extra = {}) => ({ label, children: kids, ...extra });

// Weights: Big=3 leaves, Mid=2, Small=1 ⇒ 6 total.
const tree = branch('root', [
  branch('Big', [leaf('b1'), leaf('b2'), leaf('b3')]),
  branch('Mid', [leaf('m1'), leaf('m2')]),
  branch('Small', [leaf('s1')]),
]);

const ring = (segments, depth) => segments.filter((s) => s.depth === depth);

describe('layout — structure', () => {
  test('ring 1 is the focused node’s children', () => {
    const segs = layout(tree, { maxDepth: 2 });
    assert.deepEqual(labelsOf(ring(segs, 1).map((s) => s.node)), ['Big', 'Mid', 'Small']);
  });

  test('depth is 1-based and maxDepth is exclusive of deeper rings', () => {
    assert.deepEqual(ring(layout(tree, { maxDepth: 1 }), 2), []);
    assert.ok(ring(layout(tree, { maxDepth: 2 }), 2).length > 0);
  });

  test('parents are emitted before their children', () => {
    const segs = layout(tree, { maxDepth: 2 });
    for (const s of segs.filter((x) => x.depth === 2)) {
      const parent = segs.find((p) => p.depth === 1 && s.a0 >= p.a0 && s.a1 <= p.a1);
      assert.ok(segs.indexOf(parent) < segs.indexOf(s), 'ancestor precedes descendant');
    }
  });

  test('sidx is the segment’s own index; i is its index among siblings', () => {
    const segs = layout(tree, { maxDepth: 2 });
    segs.forEach((s, k) => assert.equal(s.sidx, k));
    assert.deepEqual(ring(segs, 1).map((s) => s.i), [0, 1, 2]);
    assert.deepEqual(
      segs.filter((s) => s.depth === 2 && s.node.label.startsWith('b')).map((s) => s.i),
      [0, 1, 2]
    );
  });

  test('an empty or leaf node lays out nothing', () => {
    assert.deepEqual(layout(leaf('alone'), { maxDepth: 2 }), []);
    assert.deepEqual(layout(branch('empty', []), { maxDepth: 2 }), []);
  });

  test('ordinals lay out as a full ring of leaves', () => {
    const segs = layout({ label: '13', ordinals: 19 }, { maxDepth: 1, maxSlices: 1e9 });
    assert.equal(segs.length, 19);
    assert.ok(!segs.some((s) => s.node.__bucket), 'unbucketed at a huge maxSlices');
    assert.deepEqual(labelsOf([segs[0].node, segs.at(-1).node]), ['1', '19']);
  });
});

describe('layout — proportional invariance', () => {
  test('ring 1 partitions the full circle in proportion to weight', () => {
    const segs = layout(tree, { maxDepth: 2 });
    assertPartitions(ring(segs, 1), 0, TAU, tree.children);
    // Big is 3 of 6 leaves ⇒ exactly half the dial.
    assertClose(ring(segs, 1)[0].a1 - ring(segs, 1)[0].a0, TAU / 2, 'Big spans half');
  });

  test('each child ring partitions its own parent’s arc', () => {
    const segs = layout(tree, { maxDepth: 2 });
    for (const parent of ring(segs, 1)) {
      const kids = segs.filter((s) => s.depth === 2 && s.a0 >= parent.a0 && s.a1 <= parent.a1 + 1e-9);
      assertPartitions(kids, parent.a0, parent.a1, parent.node.children);
    }
  });

  test('children nest strictly inside their parent — never spill', () => {
    const segs = layout(tree, { maxDepth: 5 });
    for (const s of segs) {
      const ancestors = segs.filter((p) => p.depth < s.depth && p.a0 <= s.a0 && p.a1 >= s.a1 - 1e-9);
      assert.equal(ancestors.length, s.depth - 1, `${s.node.label} has one ancestor per ring above`);
    }
  });

  test('RELATIVE sizes are identical whether or not you zoom in', () => {
    // The spatial-memory guarantee: Big:Mid:Small must read the same at the root
    // as when the parent is focused directly.
    const atRoot = ring(layout(tree, { maxDepth: 1 }), 1).map((s) => s.a1 - s.a0);
    const zoomed = ring(layout(tree, { maxDepth: 2 }), 1).map((s) => s.a1 - s.a0);
    zoomed.forEach((z, i) => assertClose(z, atRoot[i], `wedge ${i} unchanged by depth`));
    // ...and a focused child's own children fill the circle in the same ratio.
    const big = layout(tree.children[0], { maxDepth: 1 });
    assertPartitions(big, 0, TAU, tree.children[0].children);
  });

  test('explicit value overrides derived weight in the angles', () => {
    const weighted = branch('root', [
      branch('Big', [leaf('a'), leaf('b'), leaf('c')], { value: 1 }),
      leaf('Small'),
    ]);
    const segs = ring(layout(weighted, { maxDepth: 1 }), 1);
    assertClose(segs[0].a1 - segs[0].a0, TAU / 2, 'value:1 makes Big half, not 3/4');
  });

  test('bucketed rings still fill the circle', () => {
    const many = branch('n', Array.from({ length: 150 }, (_, i) => leaf(String(i + 1))));
    const segs = ring(layout(many, { maxDepth: 1, maxSlices: 12 }), 1);
    assert.ok(segs.length <= 12);
    const total = segs.reduce((s, x) => s + (x.a1 - x.a0), 0);
    assertClose(total, TAU, 'buckets partition the circle');
  });

  test('collapseGroups changes the ring but not the proportions', () => {
    const grouped = branch('root', [
      branch('G', [branch('Big', [leaf('a'), leaf('b'), leaf('c')])], { group: true }),
      leaf('Small'),
    ]);
    const before = ring(layout(grouped, { maxDepth: 1 }), 1).map((s) => s.a1 - s.a0);
    const after = ring(layout(grouped, { maxDepth: 1, collapseGroups: true }), 1).map(
      (s) => s.a1 - s.a0
    );
    assert.deepEqual(labelsOf(ring(layout(grouped, { maxDepth: 1, collapseGroups: true }), 1).map((s) => s.node)), ['Big', 'Small']);
    before.forEach((b, i) => assertClose(after[i], b, `wedge ${i} keeps its share`));
  });

  test('the arrangement reorders ring 1 without changing the total', () => {
    const byLabel = ring(layout(tree, { arrangeId: 'az', maxDepth: 1 }), 1);
    assert.deepEqual(labelsOf(byLabel.map((s) => s.node)), ['Big', 'Mid', 'Small']);
    const bySize = ring(layout(tree, { arrangeId: 'size', maxDepth: 1 }), 1);
    assert.deepEqual(labelsOf(bySize.map((s) => s.node)), ['Big', 'Mid', 'Small']);
    assertClose(bySize.reduce((s, x) => s + (x.a1 - x.a0), 0), TAU, 'still a full circle');
  });

  test('deeper rings inherit their ring-1 ancestor’s hue', () => {
    const segs = layout(tree, { maxDepth: 3 });
    for (const parent of ring(segs, 1)) {
      const kids = segs.filter((s) => s.depth > 1 && s.a0 >= parent.a0 && s.a1 <= parent.a1 + 1e-9);
      assert.ok(kids.every((k) => k.hue === parent.hue), 'one hue family per top wedge');
    }
  });
});

describe('hitTest', () => {
  const innerR = 46;
  const ringThickness = 30;
  const geomFor = (segments, maxDepth) => ({ innerR, ringThickness, maxDepth, segments });
  const segs = layout(tree, { maxDepth: 2 });
  const geom = geomFor(segs, 2);
  // Mid-angle of a segment, and a radius inside a given ring.
  const midOf = (s) => (s.a0 + s.a1) / 2;
  const inRing = (d) => innerR + (d - 1) * ringThickness + ringThickness / 2;

  test('inside the hub is the hub, with no segment', () => {
    const res = hitTest(innerR - 1, 0.5, geom);
    assert.deepEqual(res, { hub: true, segment: null, chain: [] });
  });

  test('radius selects the ring, angle selects the wedge', () => {
    const big = ring(segs, 1)[0];
    assert.equal(hitTest(inRing(1), midOf(big), geom).segment.node.label, 'Big');
    const b2 = segs.find((s) => s.node.label === 'b2');
    assert.equal(hitTest(inRing(2), midOf(b2), geom).segment.node.label, 'b2');
  });

  test('the chain runs root-ward → target', () => {
    const b2 = segs.find((s) => s.node.label === 'b2');
    const { chain } = hitTest(inRing(2), midOf(b2), geom);
    assert.deepEqual(labelsOf(chain.map((s) => s.node)), ['Big', 'b2']);
    assert.deepEqual(chain.map((s) => s.depth), [1, 2]);
  });

  test('a segment’s start angle belongs to it; its end angle does not', () => {
    const [first, second] = ring(segs, 1);
    assert.equal(hitTest(inRing(1), first.a0, geom).segment.node.label, 'Big');
    assert.equal(hitTest(inRing(1), first.a1, geom).segment.node.label, 'Mid');
    assert.equal(hitTest(inRing(1), second.a0, geom).segment.node.label, 'Mid');
  });

  test('beyond a shallow leaf, the empty ring still selects that leaf', () => {
    // 'Small' is a branch with one leaf child; the leaf occupies ring 2 and there
    // is no ring 3, so a touch out at ring 3's radius must fall back, not miss.
    const s1 = segs.find((s) => s.node.label === 's1');
    const far = hitTest(inRing(2) + ringThickness * 4, midOf(s1), geomFor(segs, 2));
    assert.ok(far.segment, 'no dead zone past the outermost wedge');
    assert.equal(far.segment.node.label, 's1');
  });

  test('a deep touch is clamped to maxDepth', () => {
    const deep = layout(tree, { maxDepth: 5 });
    const b2 = deep.find((s) => s.node.label === 'b2');
    const res = hitTest(inRing(5), midOf(b2), geomFor(deep, 1));
    assert.equal(res.segment.depth, 1, 'maxDepth=1 can only return ring 1');
    assert.equal(res.segment.node.label, 'Big');
  });

  test('an empty dial reports no segment', () => {
    const res = hitTest(inRing(1), 1, geomFor([], 2));
    assert.deepEqual(res, { hub: false, segment: null, chain: [] });
  });

  test('every angle around the circle hits something', () => {
    for (let k = 0; k < 360; k++) {
      const theta = (k / 360) * TAU;
      assert.ok(hitTest(inRing(1), theta, geom).segment, `angle ${k}° hits a wedge`);
    }
  });

  test('a full ordinal ring is hit-testable end to end', () => {
    const verses = layout({ label: '13', ordinals: 19 }, { maxDepth: 1, maxSlices: 1e9 });
    const g = geomFor(verses, 1);
    const hits = verses.map((s) => hitTest(inRing(1), midOf(s), g).segment.i);
    assert.deepEqual(hits, [...Array(19).keys()], 'index i recovers the swept ordinal');
  });
});

describe('ringRadii', () => {
  test('bands are contiguous and ordered outward', () => {
    assert.deepEqual(ringRadii(1, 46, 30), [46, 76]);
    assert.deepEqual(ringRadii(2, 46, 30), [76, 106]);
    assert.equal(ringRadii(2, 46, 30)[0], ringRadii(1, 46, 30)[1]);
  });
});

describe('layout and buildDisplay agree', () => {
  test('ring 1 is exactly buildDisplay’s items, in order', () => {
    for (const arrangeId of ['canonical', 'az', 'size']) {
      const { items } = buildDisplay(tree, arrangeId, { maxSlices: 12 });
      const segs = ring(layout(tree, { arrangeId, maxDepth: 1, maxSlices: 12 }), 1);
      assert.deepEqual(labelsOf(segs.map((s) => s.node)), labelsOf(items), arrangeId);
    }
  });
});
