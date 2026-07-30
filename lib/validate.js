/**
 * validate.js — check authored data against the node contract.
 *
 * Two layers, deliberately:
 *
 *  1. `checkSchema` interprets schema/node.schema.json, so that file stays the
 *     single machine-readable source of truth for the STRUCTURAL contract
 *     (types, required fields, enums, unknown-field rejection). It implements a
 *     small JSON Schema subset — enough for our schema and no more:
 *
 *       $ref (local, "#/$defs/x")   type (incl. integer)   enum   const
 *       properties   required   additionalProperties (false | schema)
 *       items   minItems   minLength   minimum   anyOf   not
 *
 *     Anything else in a schema is ignored rather than silently "passing", and
 *     `unsupportedKeywords` reports it — see test/validate.test.mjs, which fails
 *     if the schema ever grows a keyword this can't enforce.
 *
 *  2. `checkSemantics` adds the rules JSON Schema cannot express, because they
 *     are cross-field, cross-node, or need the engine's own logic: a `range`
 *     pick must actually have ordinal LEAVES to sweep, `short` must be shorter
 *     than `label`, a `group` must group something, arrangement ids must be
 *     unique within a node, and an arrangement's `depth` must reach real nodes.
 *
 * Errors are things that will misbehave; warnings are things that are probably
 * an authoring mistake but still run. Both carry a JSON path and a human trail
 * of labels, because "$.children[1].children[3].short" alone is no fun.
 *
 * Pure JS, no dependencies — usable in tests, in a CLI, or behind a dev-only
 * check in the app.
 */
import { childrenOf, pickModeOf, isBranch } from './arrange.js';

const SUPPORTED = new Set([
  '$ref', '$schema', '$id', '$defs', 'title', 'description',
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties',
  'items', 'minItems', 'minLength', 'minimum', 'anyOf', 'not',
]);

// ---- layer 1: the schema subset -------------------------------------------

/** Keywords present in `schema` that checkSchema would silently ignore. */
export function unsupportedKeywords(schema, found = new Set()) {
  if (!schema || typeof schema !== 'object') return found;
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) found.add(k);
    if (k === 'properties' || k === '$defs') {
      for (const sub of Object.values(v || {})) unsupportedKeywords(sub, found);
    } else if (k === 'items' || k === 'not') {
      unsupportedKeywords(v, found);
    } else if (k === 'anyOf') {
      for (const sub of v || []) unsupportedKeywords(sub, found);
    } else if (k === 'additionalProperties' && typeof v === 'object') {
      unsupportedKeywords(v, found);
    }
  }
  return found;
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function matchesType(v, t) {
  if (t === 'integer') return Number.isInteger(v);
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  if (t === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
  return typeOf(v) === t;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`only local $refs are supported, got "${ref}"`);
  let at = root;
  for (const part of ref.slice(2).split('/')) {
    at = at?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    if (at === undefined) throw new Error(`unresolvable $ref "${ref}"`);
  }
  return at;
}

/**
 * Validate `value` against `schema`. Returns [{ path, message }].
 * `root` defaults to `schema` and is what local $refs resolve against.
 */
export function checkSchema(value, schema, { root = schema, path = '$' } = {}) {
  const out = [];
  visit(value, schema, path);
  return out;

  function fail(p, message) {
    out.push({ path: p, message });
  }

  function visit(v, s, p) {
    if (!s || typeof s !== 'object') return;

    if (s.$ref) {
      visit(v, resolveRef(s.$ref, root), p);
      // A $ref sits alongside other keywords in our schema (the root has both
      // $ref and $defs), so fall through rather than returning.
    }

    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => matchesType(v, t))) {
        fail(p, `expected ${types.join(' or ')}, got ${typeOf(v)}`);
        return; // further keywords would just pile on noise
      }
    }

    if (s.enum !== undefined && !s.enum.some((e) => e === v)) {
      fail(p, `expected one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}, got ${JSON.stringify(v)}`);
    }

    if (s.const !== undefined && v !== s.const) {
      fail(p, `expected ${JSON.stringify(s.const)}, got ${JSON.stringify(v)}`);
    }

    if (s.minLength !== undefined && typeof v === 'string' && v.length < s.minLength) {
      fail(p, `must be at least ${s.minLength} character${s.minLength === 1 ? '' : 's'}`);
    }

    if (s.minimum !== undefined && typeof v === 'number' && v < s.minimum) {
      fail(p, `must be >= ${s.minimum}, got ${v}`);
    }

    if (s.minItems !== undefined && Array.isArray(v) && v.length < s.minItems) {
      fail(p, `must have at least ${s.minItems} item${s.minItems === 1 ? '' : 's'}`);
    }

    if (s.anyOf) {
      const branches = s.anyOf.map((sub) => checkSchema(v, sub, { root, path: p }));
      if (branches.every((b) => b.length > 0)) {
        fail(p, `matched none of the allowed forms: ${branches.map((b) => b[0].message).join(' / ')}`);
      }
    }

    if (s.not && checkSchema(v, s.not, { root, path: p }).length === 0) {
      fail(p, s.not.description || 'matched a forbidden form');
    }

    if (Array.isArray(v) && s.items) {
      v.forEach((item, i) => visit(item, s.items, `${p}[${i}]`));
    }

    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const key of s.required || []) {
        if (v[key] === undefined) fail(p, `missing required property "${key}"`);
      }
      for (const [key, sub] of Object.entries(s.properties || {})) {
        if (v[key] !== undefined) visit(v[key], sub, `${p}.${key}`);
      }
      if (s.additionalProperties === false) {
        const known = new Set(Object.keys(s.properties || {}));
        for (const key of Object.keys(v)) {
          if (!known.has(key)) fail(`${p}.${key}`, `unknown property "${key}"`);
        }
      } else if (typeof s.additionalProperties === 'object') {
        const known = new Set(Object.keys(s.properties || {}));
        for (const key of Object.keys(v)) {
          if (!known.has(key)) visit(v[key], s.additionalProperties, `${p}.${key}`);
        }
      }
    }
  }
}

// ---- layer 2: semantics the schema can't reach ----------------------------

/**
 * Rules that need more than one field, more than one node, or the engine's own
 * interpretation. Returns { errors, warnings }.
 */
export function checkSemantics(root) {
  const errors = [];
  const warnings = [];

  visit(root, '$', []);
  return { errors, warnings };

  function visit(node, path, trail) {
    if (!node || typeof node !== 'object') return;
    const here = [...trail, node.label ?? '?'];
    const at = (message, list = errors) => list.push({ path, where: here.join(' › '), message });

    // A declared range pick must have something sweepable. This is the rule that
    // makes "declare, never infer" safe: if you say 'range', the engine trusts
    // you, so a wrong declaration must be caught here rather than at runtime.
    if (pickModeOf(node) === 'range') {
      const kids = childrenOf(node);
      if (kids.length === 0) {
        at("pick: 'range' but there is nothing to pick (no children, no ordinals)");
      } else {
        const branches = kids.filter(isBranch).map((k) => k.label);
        if (branches.length) {
          const n = branches.length;
          const shown = branches.slice(0, 3).map((l) => `"${l}"`).join(', ') + (n > 3 ? ', …' : '');
          at(
            `pick: 'range' but ${n === 1 ? `child ${shown} is a branch` : `${n} children (${shown}) are branches`}` +
              ' — ordinals must be leaves'
          );
        }
      }
    }

    if (node.pick === 'set') {
      at("pick: 'set' is reserved — basket mode is not built yet (doc/DESIGN.md §2)", warnings);
    }

    // An empty group vanishes when Flatten hoists it, taking its wedge with it.
    if (node.group && childrenOf(node).length === 0) {
      at('group: true but has no children — Flatten would make it disappear');
    }

    if (node.short !== undefined && String(node.short).length > String(node.label).length) {
      at(`short "${node.short}" is longer than label "${node.label}" — it buys no room`, warnings);
    }

    if (node.value === 0 && isBranch(node)) {
      at('value: 0 on a branch collapses its wedge to nothing', warnings);
    }

    const seen = new Set();
    for (const a of node.arrangements || []) {
      if (a?.id === undefined) continue;
      if (seen.has(a.id)) at(`duplicate arrangement id "${a.id}"`);
      seen.add(a.id);
      const depth = a.depth || 1;
      if (gatherDepth(node, depth).length === 0) {
        at(`arrangement "${a.id}" gathers at depth ${depth}, which reaches no nodes`);
      }
    }

    (node.children || []).forEach((c, i) => visit(c, `${path}.children[${i}]`, here));
  }

  function gatherDepth(node, depth) {
    let level = [node];
    for (let d = 0; d < depth; d++) level = level.flatMap((n) => childrenOf(n));
    return level;
  }
}

// ---- the public entry points ---------------------------------------------

/**
 * Validate a tree against both layers.
 * Returns { valid, errors, warnings } — `valid` ignores warnings.
 * Pass the parsed schema/node.schema.json as `schema` to include layer 1;
 * without it, only semantics are checked.
 */
export function validateTree(root, schema) {
  const errors = [];
  const warnings = [];

  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    return {
      valid: false,
      errors: [{ path: '$', where: '', message: `a tree must be a node object, got ${typeOf(root)}` }],
      warnings: [],
    };
  }

  if (schema) {
    for (const e of checkSchema(root, schema)) {
      errors.push({ ...e, where: whereFor(root, e.path) });
    }
  }
  const sem = checkSemantics(root);
  errors.push(...sem.errors);
  warnings.push(...sem.warnings);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a domain pack: its own fields, then its tree. The pack shape is an
 * app convention rather than part of the component API, so it is checked here
 * in code rather than in the JSON schema (it holds functions, which JSON can't).
 */
export function validateDomain(pack, schema) {
  const errors = [];
  const warnings = [];
  const bad = (message) => errors.push({ path: '$', where: pack?.id || '(pack)', message });

  if (!pack || typeof pack !== 'object') {
    return { valid: false, errors: [{ path: '$', where: '(pack)', message: 'not an object' }], warnings: [] };
  }
  if (typeof pack.id !== 'string' || !pack.id) bad('id must be a non-empty string');
  if (typeof pack.title !== 'string' || !pack.title) bad('title must be a non-empty string');
  if (pack.hint !== undefined && typeof pack.hint !== 'string') bad('hint must be a string');
  if (pack.formatSelection !== undefined && typeof pack.formatSelection !== 'function') {
    bad('formatSelection must be a function');
  }
  for (const key of Object.keys(pack.grammar || {})) {
    if (!['joiner', 'between', 'dash'].includes(key)) bad(`grammar.${key} is not a grammar key`);
    else if (typeof pack.grammar[key] !== 'string') bad(`grammar.${key} must be a string`);
  }
  for (const key of Object.keys(pack.copy || {})) {
    if (!['pickHint', 'navHint', 'pickParentHint'].includes(key)) bad(`copy.${key} is not a copy key`);
    else if (typeof pack.copy[key] !== 'string') bad(`copy.${key} must be a string`);
  }
  if (pack.grammar === undefined && treeHasPick(pack.tree)) {
    warnings.push({
      path: '$.grammar',
      where: pack.id,
      message: 'the tree has pick nodes but the pack declares no grammar — references will use the default ":" / "; " / "-"',
    });
  }

  const tree = validateTree(pack.tree, schema);
  errors.push(...tree.errors);
  warnings.push(...tree.warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function treeHasPick(node) {
  if (!node || typeof node !== 'object') return false;
  if (pickModeOf(node)) return true;
  return (node.children || []).some(treeHasPick);
}

/** Label trail for a JSON path like "$.children[1].children[3].short". */
function whereFor(root, path) {
  const steps = [...path.matchAll(/children\[(\d+)\]/g)].map((m) => Number(m[1]));
  const trail = [root.label ?? '?'];
  let at = root;
  for (const i of steps) {
    at = at?.children?.[i];
    if (!at) break;
    trail.push(at.label ?? '?');
  }
  return trail.join(' › ');
}

/** One-line-per-problem report, for a CLI or a test failure message. */
export function formatReport({ errors, warnings }) {
  const line = (kind) => (e) =>
    `  ${kind} ${e.where ? `${e.where} ` : ''}[${e.path}]\n      ${e.message}`;
  return [...errors.map(line('✖')), ...warnings.map(line('⚠'))].join('\n');
}
