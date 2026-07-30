/**
 * domains/* — the packs, plus a structural check of every tree they ship.
 *
 * The `validateTree` block is a stand-in for the JSON Schema + validator we still
 * want: it asserts the node contract README documents, over real data. When the
 * schema lands, these should become schema assertions rather than hand-rolled ones.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { domains, byId, bible, grocery } from '../domains/index.js';
import { childrenOf, pickModeOf, isBranch, leafCount, buildDisplay } from '../lib/arrange.js';
import { citationRoles, makeReferenceFormatter } from '../lib/selection.js';
import { layout } from '../lib/sunburst.js';
import { walk, find, pathTo, labelsOf } from './helpers.mjs';

const KNOWN_FIELDS = new Set([
  'label', 'short', 'detail', 'children', 'ordinals', 'pick', 'block',
  'value', 'color', 'group', 'meta', 'arrangements',
]);

describe('the registry', () => {
  test('every pack carries an id, a title and a tree', () => {
    for (const d of domains) {
      assert.equal(typeof d.id, 'string', 'id');
      assert.ok(d.id.length, `${d.id}: non-empty id`);
      assert.equal(typeof d.title, 'string', `${d.id}: title`);
      assert.ok(d.tree && typeof d.tree === 'object', `${d.id}: tree`);
      assert.equal(typeof d.tree.label, 'string', `${d.id}: the root is a node`);
    }
  });

  test('ids are unique', () => {
    const ids = domains.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('byId indexes every pack', () => {
    assert.deepEqual(Object.keys(byId).sort(), domains.map((d) => d.id).sort());
    assert.equal(byId.bible, bible);
  });

  test('optional pack fields have the right shape when present', () => {
    for (const d of domains) {
      if (d.grammar !== undefined) {
        assert.equal(typeof d.grammar, 'object', `${d.id}: grammar`);
        for (const k of Object.keys(d.grammar)) {
          assert.ok(['joiner', 'between', 'dash'].includes(k), `${d.id}: grammar.${k} is a real key`);
          assert.equal(typeof d.grammar[k], 'string');
        }
      }
      if (d.copy !== undefined) {
        for (const k of Object.keys(d.copy)) {
          assert.ok(
            ['pickHint', 'navHint', 'pickParentHint'].includes(k),
            `${d.id}: copy.${k} is a real key`
          );
          assert.equal(typeof d.copy[k], 'string');
        }
      }
      if (d.hint !== undefined) assert.equal(typeof d.hint, 'string', `${d.id}: hint`);
      if (d.formatSelection !== undefined) {
        assert.equal(typeof d.formatSelection, 'function', `${d.id}: formatSelection`);
      }
    }
  });
});

describe('validateTree — the node contract, over real data', () => {
  for (const d of domains) {
    test(`${d.id}: every node has a non-empty label`, () => {
      for (const n of walk(d.tree)) {
        assert.equal(typeof n.label, 'string', `label on ${JSON.stringify(n).slice(0, 60)}`);
        assert.ok(String(n.label).length > 0);
      }
    });

    test(`${d.id}: no node declares both children and ordinals`, () => {
      for (const n of walk(d.tree)) {
        const both = n.ordinals > 0 && n.children && n.children.length > 0;
        assert.ok(!both, `${n.label} must pick one expansion strategy`);
      }
    });

    test(`${d.id}: ordinals is a positive integer where present`, () => {
      for (const n of walk(d.tree)) {
        if (n.ordinals === undefined) continue;
        assert.ok(Number.isInteger(n.ordinals) && n.ordinals > 0, `${n.label}: ordinals`);
      }
    });

    test(`${d.id}: pick is only a known mode`, () => {
      for (const n of walk(d.tree)) {
        if (n.pick === undefined) continue;
        assert.ok([false, 'range', 'set'].includes(n.pick), `${n.label}: pick=${n.pick}`);
      }
    });

    test(`${d.id}: a range pick has ordinal leaves to sweep`, () => {
      for (const n of walk(d.tree)) {
        if (pickModeOf(n) !== 'range') continue;
        const kids = childrenOf(n);
        assert.ok(kids.length > 0, `${n.label}: something to pick`);
        assert.ok(!kids.some(isBranch), `${n.label}: ordinals must be leaves`);
      }
    });

    test(`${d.id}: a group node actually groups something`, () => {
      for (const n of walk(d.tree)) {
        if (!n.group) continue;
        assert.ok(childrenOf(n).length > 0, `${n.label}: an empty group would vanish on Flatten`);
      }
    });

    test(`${d.id}: value and block are positive numbers where present`, () => {
      for (const n of walk(d.tree)) {
        if (n.value !== undefined) assert.ok(n.value >= 0, `${n.label}: value`);
        if (n.block !== undefined) {
          assert.ok(Number.isInteger(n.block) && n.block > 0, `${n.label}: block`);
        }
      }
    });

    test(`${d.id}: short is shorter than label (else it buys nothing)`, () => {
      for (const n of walk(d.tree)) {
        if (n.short === undefined) continue;
        assert.ok(
          String(n.short).length <= String(n.label).length,
          `${n.label}: short "${n.short}" is not shorter`
        );
      }
    });

    test(`${d.id}: no unknown fields (typos in the contract)`, () => {
      for (const n of walk(d.tree)) {
        for (const k of Object.keys(n)) {
          if (k.startsWith('__')) continue; // engine-internal markers
          assert.ok(KNOWN_FIELDS.has(k), `${n.label}: unknown field "${k}"`);
        }
      }
    });

    test(`${d.id}: authored arrangements are well formed`, () => {
      for (const n of walk(d.tree)) {
        for (const a of n.arrangements || []) {
          assert.equal(typeof a.id, 'string', `${n.label}: arrangement id`);
          assert.equal(typeof a.label, 'string', `${n.label}: arrangement label`);
          if (a.depth !== undefined) assert.ok(a.depth >= 1, `${n.label}: depth`);
          if (a.sort !== undefined) {
            assert.ok(['none', 'label', 'value-desc'].includes(a.sort), `${n.label}: sort=${a.sort}`);
          }
        }
      }
    });

    test(`${d.id}: the root lays out and every ring fills the circle`, () => {
      const segs = layout(d.tree, { maxDepth: 2, maxSlices: 12 });
      assert.ok(segs.length > 0);
      const ring1 = segs.filter((s) => s.depth === 1);
      const total = ring1.reduce((s, x) => s + (x.a1 - x.a0), 0);
      assert.ok(Math.abs(total - Math.PI * 2) < 1e-9, 'ring 1 is a full circle');
    });
  }
});

describe('bible', () => {
  test('the reference the design notes keep quoting', () => {
    const path = pathTo(bible.tree, '1 Corinthians');
    const cor = path.at(-1);
    const ch13 = cor.children[12];
    assert.equal(ch13.label, '13');
    assert.equal(ch13.ordinals, 19, '1 Cor 13 has 19 verses');

    const fmt = makeReferenceFormatter(bible.grammar);
    const ctx = [...path.slice(1), ch13];
    const labels = Array.from({ length: 19 }, (_, i) => String(i + 1));
    const groups = [{ from: 0, to: 2 }, { from: 9, to: 11 }, { from: 17, to: 17 }];
    assert.equal(fmt(ctx, groups, labels), '1 Cor 13:1-3; 10-12; 18');
  });

  test('chapters declare range-selection; books and groups do not', () => {
    const john = find(bible.tree, 'John');
    assert.equal(john.children.length, 21);
    assert.ok(john.children.every((c) => pickModeOf(c) === 'range'), 'every chapter picks');
    assert.equal(pickModeOf(john), null, 'a book navigates');
    assert.equal(pickModeOf(find(bible.tree, 'Gospels')), null, 'a group navigates');
    assert.equal(pickModeOf(bible.tree), null, 'the root navigates');
  });

  test('category layers are marked group so Flatten can hoist them', () => {
    for (const label of ['Wisdom', 'Prophets', 'Gospels', 'Letters', 'Prophecy']) {
      assert.equal(find(bible.tree, label).group, true, label);
    }
  });

  test('Flatten lifts books to the testament ring, keeping proportions', () => {
    const ot = find(bible.tree, 'Old Testament');
    const grouped = buildDisplay(ot, 'canonical', { maxSlices: 12 });
    const flat = buildDisplay(ot, 'canonical', { maxSlices: 12, collapseGroups: true });
    assert.deepEqual(labelsOf(grouped.items), ['Wisdom', 'Prophets']);
    assert.deepEqual(labelsOf(flat.items), ['Psalms', 'Proverbs', 'Job', 'Isaiah', 'Jeremiah', 'Daniel']);
    assert.equal(leafCount(ot), flat.items.reduce((s, n) => s + leafCount(n), 0));
  });

  test('the authored Books A–Z arrangement gathers across the group layer', () => {
    const nt = find(bible.tree, 'New Testament');
    const { items } = buildDisplay(nt, 'books-az', { maxSlices: 99 });
    assert.deepEqual(labelsOf(items), [
      '1 Corinthians', 'Hebrews', 'John', 'Luke', 'Mark', 'Matthew', 'Revelation', 'Romans',
    ]);
  });

  test('Psalms buckets into summary wheels rather than 150 slivers', () => {
    const { items } = buildDisplay(find(bible.tree, 'Psalms'), 'canonical', { maxSlices: 12 });
    assert.ok(items.length <= 12);
    assert.ok(items.every((i) => i.__bucket));
    assert.equal(items[0].label, '1–25');
  });

  test('the tree stays small because verses are never stored', () => {
    // This is why a domain can be a plain JS module (and, later, plain JSON):
    // `ordinals` keeps the leaf explosion out of the data. 14 sample books hold
    // ~11k verses in ~500 nodes; the full 66 would still be ~1,200.
    const nodes = walk(bible.tree);
    const stored = nodes.length;
    const verses = nodes.reduce((s, n) => s + (n.ordinals || 0), 0);
    assert.ok(verses > 10000, `${verses} verses expanded on demand`);
    assert.ok(verses > stored * 10, `${verses} verses from only ${stored} stored nodes`);
  });

  test('citation roles resolve correctly from every chapter in the tree', () => {
    for (const bookLabel of ['Psalms', 'Jeremiah', 'John', '1 Corinthians', 'Revelation']) {
      const path = pathTo(bible.tree, bookLabel).slice(1);
      const chapter = path.at(-1).children[0];
      const { title, index } = citationRoles([...path, chapter]);
      assert.equal(title.label, bookLabel, `title for ${bookLabel}`);
      assert.equal(index.label, '1', `index for ${bookLabel}`);
    }
  });
});

describe('grocery', () => {
  test('navigation-only: nothing in the tree declares a pick mode', () => {
    const picky = walk(grocery.tree).filter((n) => pickModeOf(n));
    assert.deepEqual(picky.map((n) => n.label), []);
  });

  test('leaves are real leaves, reachable by lifting', () => {
    const milk = find(grocery.tree, 'Milk');
    assert.equal(isBranch(milk), false);
    assert.equal(pickModeOf(milk), null);
  });

  test('its reference is a plain path with no index', () => {
    const path = pathTo(grocery.tree, 'Dairy').slice(1);
    const { title, index } = citationRoles(path);
    assert.equal(title.label, 'Dairy');
    assert.equal(index, null);
    assert.equal(makeReferenceFormatter(grocery.grammar)(path, [], []), 'Dairy');
  });

  test('duplicate labels under different parents stay distinct nodes', () => {
    // "Vegetables" appears under both Fresh and Frozen.
    const veg = walk(grocery.tree).filter((n) => n.label === 'Vegetables');
    assert.equal(veg.length, 2);
    assert.notEqual(veg[0], veg[1], 'distinct objects — identity is what sticky selection keys on');
  });
});
