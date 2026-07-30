/**
 * domains/* — the packs and their per-domain behavior.
 *
 * The node contract itself is enforced by schema/node.schema.json via
 * lib/validate.js; see test/validate.test.mjs. This file checks the registry
 * and the behavior each domain is supposed to produce.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { domains, byId, bible, grocery } from '../domains/index.js';
import { pickModeOf, isBranch, leafCount, buildDisplay } from '../lib/arrange.js';
import { citationRoles, makeReferenceFormatter } from '../lib/selection.js';
import { layout } from '../lib/sunburst.js';
import { validateDomain, formatReport } from '../lib/validate.js';
import { walk, find, pathTo, labelsOf } from './helpers.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema/node.schema.json', import.meta.url), 'utf8'));

describe('the registry', () => {
  test('every pack validates against the schema and the pack contract', () => {
    for (const d of domains) {
      const result = validateDomain(d, schema);
      assert.ok(result.valid, `${d.id} is invalid:\n${formatReport(result)}`);
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

  for (const d of domains) {
    test(`${d.id}: the root lays out and ring 1 fills the circle`, () => {
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
