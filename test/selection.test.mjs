/**
 * lib/selection.js — picked indices → ranges → a formatted reference.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  coalesce,
  formatGroups,
  citationRoles,
  makeReferenceFormatter,
  defaultFormatSelection,
  DEFAULT_GRAMMAR,
} from '../lib/selection.js';

const labels = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
const L19 = labels(19);

describe('coalesce', () => {
  test('nothing picked, no groups', () => {
    assert.deepEqual(coalesce([]), []);
  });

  test('a single pick is a one-wide group', () => {
    assert.deepEqual(coalesce([4]), [{ from: 4, to: 4 }]);
  });

  test('adjacent indices merge into one range', () => {
    assert.deepEqual(coalesce([0, 1, 2]), [{ from: 0, to: 2 }]);
  });

  test('gaps split ranges', () => {
    assert.deepEqual(coalesce([0, 1, 3]), [{ from: 0, to: 1 }, { from: 3, to: 3 }]);
  });

  test('sorts and de-duplicates whatever order the sweep produced', () => {
    assert.deepEqual(coalesce([17, 0, 1, 2, 11, 9, 10, 1, 0]), [
      { from: 0, to: 2 },
      { from: 9, to: 11 },
      { from: 17, to: 17 },
    ]);
  });

  test('a Set round-trips (that is how ThumbDial stores picks)', () => {
    assert.deepEqual(coalesce([...new Set([5, 6, 7])]), [{ from: 5, to: 7 }]);
  });
});

describe('formatGroups', () => {
  test('single index prints one label, not a degenerate range', () => {
    assert.equal(formatGroups([{ from: 17, to: 17 }], L19), '18');
  });

  test('a range prints first-last', () => {
    assert.equal(formatGroups([{ from: 0, to: 2 }], L19), '1-3');
  });

  test('several groups join with the grammar separator', () => {
    assert.equal(formatGroups(coalesce([0, 1, 2, 9, 10, 11, 17]), L19), '1-3; 10-12; 18');
  });

  test('no groups, empty string', () => {
    assert.equal(formatGroups([], L19), '');
  });

  test('labels drive the output, not the indices', () => {
    assert.equal(formatGroups([{ from: 0, to: 1 }], ['xi', 'xii', 'xiii']), 'xi-xii');
  });

  test('custom grammar is honored, and merges over the defaults', () => {
    assert.equal(formatGroups(coalesce([0, 1, 2, 17]), L19, { dash: '–', between: ', ' }), '1–3, 18');
    assert.equal(formatGroups(coalesce([0, 1]), L19, { dash: '→' }), '1→2');
  });
});

describe('citationRoles', () => {
  const group = (label) => ({ label, group: true });
  const pickNode = (label, ordinals = 19) => ({ label, ordinals });

  test('the index is the deepest node that declares a pick mode', () => {
    const ctx = [{ label: 'NT' }, { label: '1 Corinthians', short: '1 Cor' }, pickNode('13')];
    const { title, index } = citationRoles(ctx);
    assert.equal(index.label, '13');
    assert.equal(title.label, '1 Corinthians');
  });

  test('organizational layers are skipped when choosing the title', () => {
    const ctx = [{ label: 'NT' }, group('Letters'), { label: 'Hebrews' }, pickNode('13')];
    assert.equal(citationRoles(ctx).title.label, 'Hebrews');
  });

  test('REGRESSION: a group name never becomes the title', () => {
    // The old heuristic emitted "Proph Jeremiah" (doc/DESIGN.md §3).
    const ctx = [{ label: 'OT' }, group('Prophets'), { label: 'Jeremiah', short: 'Jer' }];
    assert.equal(citationRoles(ctx).title.label, 'Jeremiah');
    assert.equal(citationRoles(ctx).index, null);
  });

  test('falls back to a numeric label when nothing declares a pick mode', () => {
    // A plain navigation path still reads sensibly.
    const ctx = [{ label: 'Bible' }, { label: 'John', short: 'Jn' }, { label: '3' }];
    const { title, index } = citationRoles(ctx);
    assert.equal(index.label, '3');
    assert.equal(title.label, 'John');
  });

  test('a declared pick node wins over a deeper numeric label', () => {
    const ctx = [{ label: 'Book' }, pickNode('13'), { label: '7' }];
    assert.equal(citationRoles(ctx).index.label, '13');
  });

  test('a numeric node above the index is not mistaken for the title', () => {
    const ctx = [{ label: '1 Corinthians', short: '1 Cor' }, { label: '13' }, pickNode('7')];
    const { title, index } = citationRoles(ctx);
    assert.equal(index.label, '7');
    assert.equal(title.label, '1 Corinthians', 'skips the intermediate number');
  });

  test('a navigation-only path: last node is the title, no index', () => {
    const ctx = [{ label: 'Grocery' }, { label: 'Fridge' }, { label: 'Dairy' }];
    const { title, index } = citationRoles(ctx);
    assert.equal(title.label, 'Dairy');
    assert.equal(index, null);
  });

  test('an empty path yields nothing rather than throwing', () => {
    assert.deepEqual(citationRoles([]), { title: null, index: null });
  });

  test('a path of only groups yields no title', () => {
    assert.equal(citationRoles([group('Letters')]).title, null);
  });
});

describe('makeReferenceFormatter', () => {
  const ctx = [
    { label: 'New Testament', short: 'NT' },
    { label: 'Letters', group: true },
    { label: '1 Corinthians', short: '1 Cor' },
    { label: '13', ordinals: 19 },
  ];

  test('the canonical case', () => {
    const fmt = makeReferenceFormatter({ joiner: ':', between: '; ', dash: '-' });
    assert.equal(fmt(ctx, coalesce([0, 1, 2, 9, 10, 11, 17]), L19), '1 Cor 13:1-3; 10-12; 18');
  });

  test('prefers `short` over `label` for the title', () => {
    const fmt = makeReferenceFormatter();
    assert.equal(fmt(ctx, coalesce([0]), L19), '1 Cor 13:1');
    const long = [{ label: 'Jeremiah' }, { label: '5', ordinals: 9 }];
    assert.equal(fmt(long, coalesce([0]), labels(9)), 'Jeremiah 5:1');
  });

  test('no picks: the reference is just title and index', () => {
    assert.equal(makeReferenceFormatter()(ctx, [], []), '1 Cor 13');
  });

  test('no index: the reference is just the title', () => {
    assert.equal(makeReferenceFormatter()([{ label: 'Dairy' }], [], []), 'Dairy');
  });

  test('nothing at all: an empty string (the tray shows its hint instead)', () => {
    assert.equal(makeReferenceFormatter()([], [], []), '');
  });

  test('a partial grammar merges over the defaults', () => {
    const fmt = makeReferenceFormatter({ joiner: ' v' });
    assert.equal(fmt(ctx, coalesce([0, 1, 2, 17]), L19), '1 Cor 13 v1-3; 18');
  });

  test('a wholly different grammar', () => {
    const fmt = makeReferenceFormatter({ joiner: '.', between: ' + ', dash: '–' });
    assert.equal(fmt(ctx, coalesce([0, 1, 2, 17]), L19), '1 Cor 13.1–3 + 18');
  });

  test('defaultFormatSelection is the no-argument factory result', () => {
    const picks = coalesce([0, 1, 2, 17]);
    assert.equal(
      defaultFormatSelection(ctx, picks, L19),
      makeReferenceFormatter(DEFAULT_GRAMMAR)(ctx, picks, L19)
    );
  });

  test('the same picks under two grammars differ only in punctuation', () => {
    const picks = coalesce([0, 1, 4]);
    const a = makeReferenceFormatter({ joiner: ':', dash: '-', between: '; ' })(ctx, picks, L19);
    const b = makeReferenceFormatter({ joiner: '#', dash: '..', between: ' / ' })(ctx, picks, L19);
    assert.equal(a, '1 Cor 13:1-2; 5');
    assert.equal(b, '1 Cor 13#1..2 / 5');
  });
});
