import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

export type EmitStyleContext = {
  breakpoints: Record<string, string>;
  classPrefix: string;
  breakpoint: string;
  /**
   * Wrap emitted rules in `@layer <prefix>.<bucket>` and declare the layer
   * order up front. Makes breakpoint precedence independent of source order
   * even across separately-authored sheets. Opt-in: layered CSS always loses
   * to unlayered CSS, so enabling it changes how consumer CSS interacts.
   */
  cascadeLayers?: boolean;
};

export type EmitAtom = {
  id: string;
  /**
   * Standalone rules (media-wrapped for breakpoints), without any `@layer`.
   * A flat declaration has one; a nested compound can have several.
   */
  rules: string[];
  /**
   * Cascade bucket. 0 for base, otherwise the breakpoint min-width in px.
   * Sorting atoms by this makes emission order irrelevant.
   */
  order: number;
  /**
   * Position inside one bucket: shorthands first, then longhands, then nested
   * compounds. Keeps `paddingTop` winning over `padding` in any emission order.
   */
  priority: number;
  /** Breakpoint key this atom belongs to (null for base). */
  bpKey: string | null;
  /** Layer name used when `cascadeLayers` is on (e.g. `som.pc`). */
  layer: string;
};

export type EmitStyleResult = {
  /** Space-separated class names (atoms + optional nested compound). */
  className: string;
  /** CSS for all atoms/compounds used by this style (may overlap other emits). */
  css: string;
  styleKey: string;
  atoms: EmitAtom[];
};

export const hash = (str: string) => {
  let h = 5381;
  let i = str.length;
  while (i) h = (h * 33) ^ str.charCodeAt(--i);
  return (h >>> 0).toString(36);
};

const camelToKebab = (str: string) =>
  str.replace(/([A-Z])/g, "-$1").toLowerCase();

/**
 * Numbers get `px` like React inline styles (`width: 100` → `100px`), except
 * on properties that take a bare number. Strings only collapse whitespace so
 * multiline template literals still emit valid CSS.
 */
const cssValue = (kebabProperty: string, value: string | number): string => {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (value === 0 || kebabProperty.startsWith("--")) return String(value);
  return UNITLESS_PROPERTIES.has(kebabProperty) ? String(value) : `${value}px`;
};

const UNITLESS_PROPERTIES = new Set([
  "animation-iteration-count",
  "aspect-ratio",
  "border-image-outset",
  "border-image-slice",
  "border-image-width",
  "column-count",
  "columns",
  "fill-opacity",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flood-opacity",
  "font-weight",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "initial-letter",
  "line-clamp",
  "-webkit-line-clamp",
  "line-height",
  "opacity",
  "order",
  "orphans",
  "scale",
  "stop-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "widows",
  "z-index",
  "zoom",
]);

const bpToken = (key: string) => {
  const t = key.trim().replace(/[^a-zA-Z0-9_-]+/g, "");
  return t || "bp";
};

/** CSS ident for `@layer` names — must not start with a digit. */
export const cssIdent = (raw: string): string => {
  const t = raw.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!t) return "x";
  return /^[0-9]/.test(t) ? `bp-${t}` : t;
};

/** Layer name for a bucket: `som.base` / `som.pc` / `som.bp-768px`. */
export const layerName = (classPrefix: string, bpKey: string | null): string =>
  `${cssIdent(classPrefix)}.${bpKey ? cssIdent(bpKey) : "base"}`;

const splitFlatAndNested = (style: StyleObject) => {
  const flat: Record<string, string | number> = {};
  const nested: Record<string, StyleObject> = {};

  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      nested[key] = value as StyleObject;
    } else {
      flat[key] = value as string | number;
    }
  }

  return { flat, nested };
};

/**
 * Turns a nested style object into standalone rules under `parentSelector`.
 * Selector keys (`&:hover`, `& a`, `a`) nest inside the parent selector, so
 * `"&:hover": { "& span": … }` targets `.c:hover span`. At-rule keys
 * (`@media`, `@supports`, `@container`) wrap the parent's rules in that condition.
 */
const nestedRules = (style: StyleObject, parentSelector: string): string[] => {
  let declarations = "";
  const childRules: string[] = [];

  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue;

    if (typeof value !== "object" || Array.isArray(value)) {
      const kebabProperty = camelToKebab(key);
      declarations += `${kebabProperty}:${cssValue(kebabProperty, value as string | number)};`;
    } else if (key.startsWith("@")) {
      const conditionedRules = nestedRules(value, parentSelector);
      childRules.push(...conditionedRules.map((rule) => `${key}{${rule}}`));
    } else {
      const childSelector = scopeSelectorList(key, parentSelector);
      childRules.push(...nestedRules(value, childSelector));
    }
  }

  const parentRule = declarations
    ? [`${parentSelector} { ${declarations} }`]
    : [];
  return [...parentRule, ...childRules];
};

/**
 * Scopes every selector in a comma list to every parent selector:
 * `& a, & button` under `.c` -> `.c a, .c button`; `a, button` likewise.
 * Commas inside `()`, `[]` or quotes (e.g. `:is(a, b)`) do not split a list.
 */
const scopeSelectorList = (selectorList: string, parentSelectorList: string) =>
  splitTopLevelCommas(parentSelectorList)
    .flatMap((parentSelector) =>
      splitTopLevelCommas(selectorList).map((selector) =>
        selector.includes("&")
          ? selector.split("&").join(parentSelector)
          : `${parentSelector} ${selector}`
      )
    )
    .join(", ");

const splitTopLevelCommas = (selectorList: string) => {
  const selectors: string[] = [];
  let bracketDepth = 0;
  let openQuote: string | null = null;
  let selectorStart = 0;

  for (let index = 0; index < selectorList.length; index++) {
    const char = selectorList[index];
    if (openQuote) {
      if (char === "\\") index++;
      else if (char === openQuote) openQuote = null;
    } else if (char === '"' || char === "'") {
      openQuote = char;
    } else if (char === "(" || char === "[") {
      bracketDepth++;
    } else if (char === ")" || char === "]") {
      bracketDepth--;
    } else if (char === "," && bracketDepth === 0) {
      selectors.push(selectorList.slice(selectorStart, index));
      selectorStart = index + 1;
    }
  }
  selectors.push(selectorList.slice(selectorStart));

  return selectors.map((selector) => selector.trim()).filter(Boolean);
};

export const parsePxNumeric = (val: string): number => {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  if (val.endsWith("rem") || val.endsWith("em")) return num * 16;
  return num;
};

const isValidCssLength = (val: string): boolean => {
  return /^\d+(\.\d+)?(px|rem|em|vw|vh|%|vmin|vmax)$/i.test(val.trim());
};

/** Breakpoint atoms must never tie with base (order 0) after sorting. */
const bucketOrder = (numValue: number) => Math.max(1, numValue);

/**
 * A longhand must sit after its shorthand, or `padding:0` emitted later by
 * another module would erase `padding-top:8px`. Hyphen count follows
 * shorthand depth for almost every property (`border` < `border-top` <
 * `border-top-color`, `flex` < `flex-grow`); the table holds the exceptions.
 */
const propertyPriority = (kebabProperty: string): number =>
  SHORTHAND_DEPTH_EXCEPTIONS[kebabProperty] ??
  (kebabProperty.match(/-/g)?.length ?? 0);

const SHORTHAND_DEPTH_EXCEPTIONS: Record<string, number> = {
  "flex-flow": 0,
  "place-content": 0,
  "place-items": 0,
  "place-self": 0,
  top: 2,
  right: 2,
  bottom: 2,
  left: 2,
};

/** Nested rules (`&:hover`, `@supports` …) come after every flat atom. */
const NESTED_COMPOUND_PRIORITY = 100;

/** Sheet order: base → ascending breakpoints, shorthand → longhand inside each. */
export const compareCascadePosition = (a: EmitAtom, b: EmitAtom) =>
  a.order - b.order || a.priority - b.priority;

const wrapInMinWidth = (rule: string, mediaMinWidth: string | null) =>
  mediaMinWidth ? `@media (min-width: ${mediaMinWidth}){${rule}}` : rule;

const makeAtom = (
  prefix: string,
  bpKey: string | null,
  prop: string,
  value: string | number,
  mediaMinWidth: string | null,
  order: number
): EmitAtom => {
  const kebab = camelToKebab(prop);
  const normalized = cssValue(kebab, value);
  const core = hash(`${kebab}:${normalized}`);
  const id = bpKey
    ? `${prefix}-${bpToken(bpKey)}-${core}`
    : `${prefix}-${core}`;
  return {
    id,
    rules: [wrapInMinWidth(`.${id}{${kebab}:${normalized};}`, mediaMinWidth)],
    order,
    priority: propertyPriority(kebab),
    bpKey,
    layer: layerName(prefix, bpKey),
  };
};

const makeNestedCompound = (
  prefix: string,
  bpKey: string | null,
  nested: StyleObject,
  mediaMinWidth: string | null,
  order: number
): EmitAtom | null => {
  if (Object.keys(nested).length === 0) return null;

  const nestHash = hash(JSON.stringify({ nested, bpKey }));
  const id = bpKey
    ? `${prefix}-${bpToken(bpKey)}-n${nestHash}`
    : `${prefix}-n${nestHash}`;
  const compoundRules = nestedRules(nested, `.${id}`);
  if (compoundRules.length === 0) return null;

  return {
    id,
    rules: compoundRules.map((rule) => wrapInMinWidth(rule, mediaMinWidth)),
    order,
    priority: NESTED_COMPOUND_PRIORITY,
    bpKey,
    layer: layerName(prefix, bpKey),
  };
};

type ResolvedBreakpoint = {
  key: string;
  bpValue: string;
  numValue: number;
  style: StyleObject;
};

const resolveBreakpoints = (
  bpStyles: Record<string, StyleObject | undefined>,
  ctx: EmitStyleContext
): ResolvedBreakpoint[] =>
  Object.entries(bpStyles)
    .filter(([_, style]) => style && Object.keys(style).length > 0)
    .map(([key, style]) => {
      let bpValue = ctx.breakpoints[key];
      if (!bpValue) {
        if (isValidCssLength(key)) {
          bpValue = key;
        } else {
          console.warn(
            `[som-style] Unknown breakpoint "${key}". Expected a configured name (e.g. "pc") or valid CSS length (e.g. "768px"). Falling back to default pc breakpoint (${ctx.breakpoint}).`
          );
          bpValue = ctx.breakpoint;
        }
      }
      return {
        key,
        bpValue,
        numValue: parsePxNumeric(bpValue),
        style: style!,
      };
    })
    .sort((a, b) => a.numValue - b.numValue);

const emitLayer = (
  style: StyleObject,
  ctx: EmitStyleContext,
  bpKey: string | null,
  mediaMinWidth: string | null,
  order: number,
  atoms: EmitAtom[],
  classList: string[]
) => {
  const { flat, nested } = splitFlatAndNested(style);

  for (const prop of Object.keys(flat).sort()) {
    const atom = makeAtom(
      ctx.classPrefix,
      bpKey,
      prop,
      flat[prop],
      mediaMinWidth,
      order
    );
    atoms.push(atom);
    classList.push(atom.id);
  }

  const compound = makeNestedCompound(
    ctx.classPrefix,
    bpKey,
    nested,
    mediaMinWidth,
    order
  );
  if (compound) {
    atoms.push(compound);
    classList.push(compound.id);
  }
};

/**
 * Atomic CSS emission shared by runtime and the Vite build plugin.
 * Flat declarations become reusable atoms (with breakpoint prefixes when needed).
 * Nested selectors remain a compound class.
 */
export const emitStyle = (
  options: ResponsiveStyleOptions,
  ctx: EmitStyleContext
): EmitStyleResult => {
  const styleKey = JSON.stringify({
    options,
    bpMap: ctx.breakpoints,
    prefix: ctx.classPrefix,
    layers: Boolean(ctx.cascadeLayers),
  });

  const { base, ...bpStyles } = options;
  const atoms: EmitAtom[] = [];
  const classList: string[] = [];

  emitLayer(base || {}, ctx, null, null, 0, atoms, classList);

  for (const bp of resolveBreakpoints(bpStyles, ctx)) {
    emitLayer(
      bp.style,
      ctx,
      bp.key,
      bp.bpValue,
      bucketOrder(bp.numValue),
      atoms,
      classList
    );
  }

  const seen = new Set<string>();
  const uniqueAtoms: EmitAtom[] = [];
  for (const atom of atoms) {
    if (seen.has(atom.id)) continue;
    seen.add(atom.id);
    uniqueAtoms.push(atom);
  }

  const uniqueClasses: string[] = [];
  const seenClass = new Set<string>();
  for (const id of classList) {
    if (seenClass.has(id)) continue;
    seenClass.add(id);
    uniqueClasses.push(id);
  }

  return {
    className: uniqueClasses.join(" "),
    css: [...uniqueAtoms]
      .sort(compareCascadePosition)
      .flatMap((atom) => atom.rules)
      .join("\n"),
    styleKey,
    atoms: uniqueAtoms,
  };
};
