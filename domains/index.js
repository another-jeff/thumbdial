/**
 * The domain registry — every list type ThumbDial can be pointed at.
 *
 * A domain pack is `{ id, title, tree, grammar?, copy?, hint?, formatSelection? }`.
 * Everything except `tree` is optional; ThumbDial has sensible defaults and
 * builds its reference formatter from `grammar` unless a pack overrides it
 * outright with `formatSelection` (for a domain whose reference isn't
 * "<title> <index><joiner><ranges>" at all).
 *
 * The pack shape is an APP convention, not part of the component's API: App.js
 * spreads a pack onto explicit ThumbDial props, so the engine never learns what
 * a domain is. Adding a list type means adding one file here.
 */
// Explicit .js extensions: Metro doesn't need them, but plain Node ESM does, and
// the test layer imports this registry directly.
import bible from './bible.js';
import grocery from './grocery.js';

export const domains = [bible, grocery];

export const byId = Object.fromEntries(domains.map((d) => [d.id, d]));

export { bible, grocery };
