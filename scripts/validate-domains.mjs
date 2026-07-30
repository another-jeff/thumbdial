#!/usr/bin/env node
/**
 * Validate every registered domain against schema/node.schema.json.
 *
 *   npm run validate              # all domains
 *   node scripts/validate-domains.mjs bible
 *   node scripts/validate-domains.mjs --quiet     # errors only, no warnings
 *
 * Exits non-zero if any domain has errors (warnings alone don't fail).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { domains } from '../domains/index.js';
import { validateDomain, unsupportedKeywords, formatReport } from '../lib/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'schema', 'node.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const wanted = args.filter((a) => !a.startsWith('--'));
const targets = wanted.length ? domains.filter((d) => wanted.includes(d.id)) : domains;

if (wanted.length && targets.length !== wanted.length) {
  const missing = wanted.filter((w) => !domains.some((d) => d.id === w));
  console.error(`unknown domain(s): ${missing.join(', ')}`);
  console.error(`known: ${domains.map((d) => d.id).join(', ')}`);
  process.exit(2);
}

// If the schema grows a keyword the validator can't enforce, say so loudly —
// silently under-validating is worse than not validating.
const unsupported = [...unsupportedKeywords(schema)];
if (unsupported.length) {
  console.error(`schema uses keywords lib/validate.js cannot enforce: ${unsupported.join(', ')}`);
  process.exit(2);
}

let failed = 0;
let totalWarnings = 0;

for (const d of targets) {
  const result = validateDomain(d, schema);
  const nodes = countNodes(d.tree);
  if (result.valid && !result.warnings.length) {
    console.log(`✔ ${d.id}  ${nodes} nodes, no problems`);
    continue;
  }
  const marks = [
    result.errors.length ? `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}` : null,
    result.warnings.length ? `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  console.log(`${result.valid ? '⚠' : '✖'} ${d.id}  ${nodes} nodes, ${marks.join(', ')}`);
  const shown = quiet ? { errors: result.errors, warnings: [] } : result;
  if (shown.errors.length || shown.warnings.length) console.log(formatReport(shown));
  if (!result.valid) failed++;
  totalWarnings += result.warnings.length;
}

const summary = `${targets.length} domain${targets.length === 1 ? '' : 's'} checked`;
if (failed) {
  console.error(`\n${summary}, ${failed} with errors`);
  process.exit(1);
}
console.log(`\n${summary}, all valid${totalWarnings && !quiet ? ` (${totalWarnings} warning(s))` : ''}`);

function countNodes(node) {
  if (!node || typeof node !== 'object') return 0;
  return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0);
}
