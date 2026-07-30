/**
 * lib/validate.js + schema/node.schema.json
 *
 * A validator is only worth having if it FAILS on bad input, so most of this
 * file is bad fixtures. Every rule the schema and the semantic layer state gets
 * a violating example, and a few "this is fine, don't cry wolf" cases.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkSchema,
  checkSemantics,
  validateTree,
  validateDomain,
  unsupportedKeywords,
  formatReport,
} from '../lib/validate.js';
import { domains, bible, grocery } from '../domains/index.js';

const schema = JSON.parse(readFileSync(new URL('../schema/node.schema.json', import.meta.url), 'utf8'));

// Assert a tree is rejected, and that the complaint mentions `needle`.
const rejects = (tree, needle, msg) => {
  const { valid, errors } = validateTree(tree, schema);
  assert.equal(valid, false, msg || `expected invalid: ${JSON.stringify(tree).slice(0, 80)}`);
  assert.ok(
    errors.some((e) => e.message.includes(needle)),
    `expected an error mentioning "${needle}", got:\n${formatReport({ errors, warnings: [] })}`
  );
  return errors;
};
const accepts = (tree) => {
  const r = validateTree(tree, schema);
  assert.ok(r.valid, `expected valid, got:\n${formatReport(r)}`);
  return r;
};
const warnsAbout = (tree, needle) => {
  const { valid, warnings } = validateTree(tree, schema);
  assert.equal(valid, true, 'a warning must not make a tree invalid');
  assert.ok(
    warnings.some((w) => w.message.includes(needle)),
    `expected a warning mentioning "${needle}", got ${JSON.stringify(warnings)}`
  );
};

describe('the schema document itself', () => {
  test('declares the draft and an id', () => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(schema.$id);
  });

  test('uses only keywords the validator can enforce', () => {
    // The guard against silently under-validating: if someone adds `patternProperties`
    // or `if/then` to the schema, this fails until checkSchema learns it.
    assert.deepEqual([...unsupportedKeywords(schema)], []);
  });

  test('documents every field, so the schema doubles as the spec', () => {
    for (const [name, sub] of Object.entries(schema.$defs.node.properties)) {
      assert.ok(sub.description, `node.${name} needs a description`);
    }
    for (const [name, sub] of Object.entries(schema.$defs.arrangement.properties)) {
      assert.ok(sub.description, `arrangement.${name} needs a description`);
    }
  });

  test('covers exactly the fields ThumbDial reads — no more, no less', () => {
    assert.deepEqual(Object.keys(schema.$defs.node.properties).sort(), [
      'arrangements', 'block', 'children', 'color', 'detail',
      'group', 'label', 'meta', 'ordinals', 'pick', 'short', 'value',
    ]);
  });
});

describe('structure (layer 1: the schema)', () => {
  test('the minimum viable node', () => {
    accepts({ label: 'Milk' });
  });

  test('label is required', () => {
    rejects({ short: 'Jn' }, 'missing required property "label"');
  });

  test('label must be a non-empty string', () => {
    rejects({ label: '' }, 'at least 1 character');
    rejects({ label: 42 }, 'expected string, got number');
    rejects({ label: null }, 'expected string, got null');
  });

  test('unknown fields are rejected — typos in the contract are errors', () => {
    rejects({ label: 'John', verses: 21 }, 'unknown property "verses"');
    rejects({ label: 'John', childern: [] }, 'unknown property "childern"');
    rejects({ label: 'John', Pick: 'range' }, 'unknown property "Pick"');
  });

  test('children and ordinals are mutually exclusive', () => {
    rejects({ label: 'John', ordinals: 21, children: [{ label: '1' }] }, 'never both');
    accepts({ label: 'John', children: [{ label: '1' }] });
    accepts({ label: '13', ordinals: 19 });
  });

  test('ordinals must be a positive integer', () => {
    rejects({ label: '13', ordinals: 0 }, 'must be >= 1');
    rejects({ label: '13', ordinals: -5 }, 'must be >= 1');
    rejects({ label: '13', ordinals: 19.5 }, 'expected integer, got number');
    rejects({ label: '13', ordinals: '19' }, 'expected integer, got string');
  });

  test('pick accepts only the declared modes', () => {
    accepts({ label: '13', ordinals: 19, pick: 'range' });
    accepts({ label: '13', ordinals: 19, pick: false });
    rejects({ label: '13', ordinals: 19, pick: 'ranges' }, 'matched none of the allowed forms');
    rejects({ label: '13', ordinals: 19, pick: true }, 'matched none of the allowed forms');
    rejects({ label: '13', ordinals: 19, pick: 'RANGE' }, 'matched none of the allowed forms');
  });

  test("pick: 'set' is structurally valid but flagged as not built", () => {
    warnsAbout({ label: 'Cart', pick: 'set', children: [{ label: 'Milk' }] }, 'reserved');
  });

  test('block and value have to be sane numbers', () => {
    rejects({ label: '13', ordinals: 19, block: 0 }, 'must be >= 1');
    rejects({ label: '13', ordinals: 19, block: 2.5 }, 'expected integer');
    rejects({ label: 'n', children: [{ label: 'a' }], value: -1 }, 'must be >= 0');
    accepts({ label: 'n', children: [{ label: 'a' }], value: 0.5 });
  });

  test('group must be a boolean', () => {
    rejects({ label: 'Wisdom', group: 'yes', children: [{ label: 'Job' }] }, 'expected boolean');
  });

  test('meta must be an object, and anything inside it is allowed', () => {
    accepts({ label: 'Milk', meta: { sku: 'A1', tags: ['dairy'], nested: { ok: true } } });
    rejects({ label: 'Milk', meta: 'A1' }, 'expected object, got string');
  });

  test('errors nest to the offending descendant, with its path', () => {
    const tree = {
      label: 'root',
      children: [{ label: 'ok' }, { label: 'bad', children: [{ short: 'x' }] }],
    };
    const errors = rejects(tree, 'missing required property "label"');
    const e = errors.find((x) => x.message.includes('label'));
    assert.equal(e.path, '$.children[1].children[0]');
  });

  test('the human trail names the ancestors, not just indices', () => {
    const tree = {
      label: 'Bible',
      children: [{ label: 'New Testament', children: [{ label: 'John', ordinals: 21, children: [] }] }],
    };
    const { errors } = validateTree(tree, schema);
    assert.ok(errors.length);
    assert.equal(errors[0].where, 'Bible › New Testament › John');
  });

  test('a tree must be a node object at all', () => {
    for (const bad of [null, undefined, 'Bible', 42, [{ label: 'x' }]]) {
      const r = validateTree(bad, schema);
      assert.equal(r.valid, false, `${JSON.stringify(bad)} is not a tree`);
      assert.ok(r.errors[0].message.includes('must be a node object'));
    }
  });
});

describe('arrangements (layer 1)', () => {
  const withArr = (arr) => ({ label: 'n', children: [{ label: 'a' }, { label: 'b' }], arrangements: [arr] });

  test('id and label are required', () => {
    rejects(withArr({ label: 'Books A–Z' }), 'missing required property "id"');
    rejects(withArr({ id: 'books-az' }), 'missing required property "label"');
  });

  test('sort is a closed set', () => {
    accepts(withArr({ id: 'a', label: 'A', sort: 'label' }));
    accepts(withArr({ id: 'a', label: 'A', sort: 'value-desc' }));
    rejects(withArr({ id: 'a', label: 'A', sort: 'label-desc' }), 'expected one of');
  });

  test('depth must be at least 1', () => {
    rejects(withArr({ id: 'a', label: 'A', depth: 0 }), 'must be >= 1');
  });

  test('unknown arrangement fields are rejected', () => {
    rejects(withArr({ id: 'a', label: 'A', order: 'label' }), 'unknown property "order"');
  });
});

describe('semantics (layer 2: what the schema cannot see)', () => {
  test("a 'range' pick must have something to pick", () => {
    rejects({ label: '13', pick: 'range' }, 'nothing to pick');
    rejects({ label: '13', pick: 'range', children: [] }, 'nothing to pick');
  });

  test("a 'range' pick over BRANCHES is caught — the declaration is trusted, so it must be right", () => {
    const errors = rejects(
      {
        label: 'Book',
        pick: 'range',
        children: [
          { label: '1', children: [{ label: 'a' }] },
          { label: '2', children: [{ label: 'b' }] },
        ],
      },
      'ordinals must be leaves'
    );
    assert.ok(errors.some((e) => e.message.includes('2 children')));
  });

  test('a range pick over authored leaves is fine', () => {
    accepts({ label: '13', pick: 'range', children: [{ label: '1' }, { label: '2' }] });
  });

  test('an empty group is an error — Flatten would erase it', () => {
    rejects({ label: 'Wisdom', group: true }, 'Flatten would make it disappear');
    accepts({ label: 'Wisdom', group: true, children: [{ label: 'Job' }] });
  });

  test('duplicate arrangement ids on one node', () => {
    rejects(
      {
        label: 'n',
        children: [{ label: 'a' }, { label: 'b' }],
        arrangements: [{ id: 'dup', label: 'One' }, { id: 'dup', label: 'Two' }],
      },
      'duplicate arrangement id'
    );
  });

  test('an arrangement whose depth reaches nothing', () => {
    rejects(
      {
        label: 'n',
        children: [{ label: 'a' }],
        arrangements: [{ id: 'deep', label: 'Deep', depth: 4, sort: 'label' }],
      },
      'reaches no nodes'
    );
  });

  test("the real Bible's cross-level arrangement does reach nodes", () => {
    accepts({
      label: 'NT',
      arrangements: [{ id: 'books-az', label: 'Books A–Z', depth: 2, sort: 'label' }],
      children: [{ label: 'Gospels', group: true, children: [{ label: 'John', ordinals: 21 }] }],
    });
  });

  test('a longer `short` warns rather than fails', () => {
    warnsAbout({ label: 'Job', short: 'Jobbed' }, 'is longer than label');
    accepts({ label: 'John', short: 'Jn' });
  });

  test('value: 0 on a branch warns — its wedge would vanish', () => {
    warnsAbout({ label: 'n', value: 0, children: [{ label: 'a' }] }, 'collapses its wedge');
  });

  test('semantics can run without the schema', () => {
    const { errors } = checkSemantics({ label: 'Wisdom', group: true });
    assert.equal(errors.length, 1);
    const r = validateTree({ label: 'Wisdom', group: true });
    assert.equal(r.valid, false, 'validateTree works schema-less too');
  });

  test('several problems are reported together, not one at a time', () => {
    const { errors } = validateTree(
      {
        label: 'root',
        children: [
          { label: 'Wisdom', group: true },
          { label: '13', pick: 'range' },
          { short: 'no label' },
        ],
      },
      schema
    );
    assert.ok(errors.length >= 3, `expected 3+ errors, got ${errors.length}`);
  });
});

describe('domain packs', () => {
  test('every registered domain is valid', () => {
    for (const d of domains) {
      const r = validateDomain(d, schema);
      assert.ok(r.valid, `${d.id} should be valid:\n${formatReport(r)}`);
    }
  });

  test('the shipped domains are warning-free too', () => {
    for (const d of domains) {
      const r = validateDomain(d, schema);
      assert.deepEqual(r.warnings, [], `${d.id} warnings:\n${formatReport(r)}`);
    }
  });

  test('pack fields are checked', () => {
    const bad = (pack, needle) => {
      const r = validateDomain({ id: 'x', title: 'X', tree: { label: 'r' }, ...pack }, schema);
      assert.equal(r.valid, false);
      assert.ok(r.errors.some((e) => e.message.includes(needle)), `${needle}: ${JSON.stringify(r.errors)}`);
    };
    bad({ id: '' }, 'id must be a non-empty string');
    bad({ title: 7 }, 'title must be a non-empty string');
    bad({ hint: 7 }, 'hint must be a string');
    bad({ formatSelection: 'nope' }, 'formatSelection must be a function');
    bad({ grammar: { joiner: 5 } }, 'grammar.joiner must be a string');
    bad({ grammar: { seperator: ';' } }, 'seperator is not a grammar key');
    bad({ copy: { pickHnt: 'x' } }, 'pickHnt is not a copy key');
  });

  test('a pack with pick nodes but no grammar warns about default punctuation', () => {
    const r = validateDomain(
      { id: 'x', title: 'X', tree: { label: 'r', children: [{ label: '1', ordinals: 5 }] } },
      schema
    );
    assert.ok(r.valid);
    assert.ok(r.warnings.some((w) => w.message.includes('no grammar')));
  });

  test('a navigation-only pack needs no grammar', () => {
    const r = validateDomain(grocery, schema);
    assert.deepEqual(r.warnings, []);
  });

  test('a non-object pack fails without throwing', () => {
    for (const bad of [null, undefined, 'bible', 42]) {
      assert.equal(validateDomain(bad, schema).valid, false);
    }
  });
});

describe('regressions the validator now guards', () => {
  test('the pre-refactor field name is caught as a typo', () => {
    // `verses: 21` was the old spelling. Anyone porting old data gets told.
    rejects({ label: 'John', verses: 21 }, 'unknown property "verses"');
  });

  test('numeric labels are NOT enough to declare a pick — and the validator agrees', () => {
    // Sizes under a grocery item: valid data, and explicitly not a pick node.
    const sizes = { label: 'Eggs', children: [{ label: '6' }, { label: '12' }] };
    accepts(sizes);
    assert.deepEqual(checkSemantics(sizes).errors, []);
  });

  test('1 Cor 13 validates as the canonical example', () => {
    const cor = bible.tree.children[1].children[1].children[1];
    assert.equal(cor.label, '1 Corinthians');
    accepts(cor);
  });
});

describe('formatReport', () => {
  test('renders errors and warnings with path and trail', () => {
    const r = validateTree({ label: 'root', children: [{ label: 'Wisdom', group: true }] }, schema);
    const text = formatReport(r);
    assert.match(text, /✖/);
    assert.match(text, /root › Wisdom/);
    assert.match(text, /\$\.children\[0\]/);
  });

  test('an empty result renders as nothing', () => {
    assert.equal(formatReport({ errors: [], warnings: [] }), '');
  });
});

describe('checkSchema in isolation', () => {
  test('validates a plain value against a plain schema', () => {
    assert.deepEqual(checkSchema('x', { type: 'string' }), []);
    assert.equal(checkSchema(5, { type: 'string' })[0].message, 'expected string, got number');
  });

  test('resolves local $refs, including recursive ones', () => {
    const s = {
      $ref: '#/$defs/n',
      $defs: { n: { type: 'object', properties: { kid: { $ref: '#/$defs/n' } } } },
    };
    assert.deepEqual(checkSchema({ kid: { kid: {} } }, s), []);
    assert.equal(checkSchema({ kid: { kid: 'no' } }, s)[0].path, '$.kid.kid');
  });

  test('throws on an unresolvable $ref rather than passing silently', () => {
    assert.throws(() => checkSchema({}, { $ref: '#/$defs/missing' }), /unresolvable/);
    assert.throws(() => checkSchema({}, { $ref: 'https://elsewhere/x' }), /only local/);
  });

  test('unsupportedKeywords finds keywords nested anywhere', () => {
    assert.deepEqual([...unsupportedKeywords({ type: 'object', properties: { a: { pattern: 'x' } } })], ['pattern']);
    assert.deepEqual([...unsupportedKeywords({ items: { if: {} } })], ['if']);
    assert.deepEqual([...unsupportedKeywords({ anyOf: [{ multipleOf: 2 }] })], ['multipleOf']);
  });
});
