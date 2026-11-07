import {
  compareCascadePosition,
  cssIdent,
  layerName,
  parsePxNumeric,
  type EmitAtom,
  type EmitStyleContext,
} from "./emitStyle.js";

export type ComposeCssOptions = {
  /** Wrap each rule in its bucket's `@layer` and declare the order up front. */
  cascadeLayers?: boolean;
};

/**
 * Dedupe by atom id (first wins), then order base → ascending breakpoints,
 * shorthands before longhands inside each bucket.
 */
export const sortAtoms = (atoms: Iterable<EmitAtom>): EmitAtom[] => {
  const seen = new Set<string>();
  const unique: EmitAtom[] = [];
  for (const atom of atoms) {
    if (seen.has(atom.id)) continue;
    seen.add(atom.id);
    unique.push(atom);
  }
  // Array#sort is stable, so equal positions keep emission order.
  return unique.sort(compareCascadePosition);
};

/** An atom's standalone rules, each layer-wrapped when cascade layers are on. */
export const atomRules = (
  atom: EmitAtom,
  options: ComposeCssOptions = {}
): string[] =>
  options.cascadeLayers
    ? atom.rules.map((rule) => `@layer ${atom.layer}{${rule}}`)
    : atom.rules;

/** `@layer som.base, som.pc;` — must come before any layered rule. */
export const layerOrderRule = (layers: string[]): string => {
  const unique = [...new Set(layers)];
  return unique.length ? `@layer ${unique.join(", ")};` : "";
};

/**
 * Every layer this config can produce, ordered base → widest breakpoint.
 * Used by the runtime, which injects atoms one at a time and cannot wait
 * for the full set before declaring the order.
 *
 * `extra` covers breakpoints that never appear in config — an inline
 * `"768px": { ... }` key. An undeclared layer sorts after every declared one,
 * so leaving it out would let a narrow inline breakpoint beat a wide named one.
 */
export const layerOrderForContext = (
  ctx: EmitStyleContext,
  extra: Array<{ order: number; layer: string }> = []
): string => {
  const entries = [
    ...Object.entries(ctx.breakpoints).map(([key, value]) => ({
      order: Math.max(1, parsePxNumeric(value)),
      layer: layerName(ctx.classPrefix, key),
    })),
    ...extra,
  ].sort((a, b) => a.order - b.order);

  return layerOrderRule([
    `${cssIdent(ctx.classPrefix)}.base`,
    ...entries.map((e) => e.layer),
  ]);
};

/**
 * Stable sheet text: base rules first, then breakpoints by ascending
 * min-width. Shared atoms are deduped, so a base rule can otherwise land
 * after a wider-breakpoint rule it is supposed to lose to.
 */
export const composeAtomCss = (
  atoms: Iterable<EmitAtom>,
  options: ComposeCssOptions = {}
): string => {
  const sorted = sortAtoms(atoms);
  const rules = sorted.flatMap((atom) => atomRules(atom, options));
  if (!options.cascadeLayers) return rules.join("\n");
  const order = layerOrderRule(sorted.map((atom) => atom.layer));
  return [order, ...rules].filter(Boolean).join("\n");
};
