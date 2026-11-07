import type { ResponsiveStyleOptions, RxStyleConfig } from "./types.js";
import {
  cssIdent,
  emitStyle,
  type EmitAtom,
  type EmitStyleContext,
} from "./emitStyle.js";
import {
  atomRules,
  composeAtomCss,
  layerOrderForContext,
} from "./composeCss.js";
import {
  cloneResponsiveOptions,
  mergeResponsiveOptions,
  type StyleExtendPatch,
} from "./extendStyle.js";

export type { StyleExtendPatch } from "./extendStyle.js";
export {
  mergeResponsiveOptions,
  mergeStyleObject,
  cloneResponsiveOptions,
} from "./extendStyle.js";

type StyleCacheEntry = {
  className: string;
  atoms: EmitAtom[];
};

/**
 * Style result: string-like for React `className={box}` / `class={box}`;
 * call extend() to override properties. `.className` is the same string.
 */
export type StyleHandle = string & {
  readonly className: string;
  readonly options: ResponsiveStyleOptions;
  extend(patch: StyleExtendPatch): StyleHandle;
};

const injectedAtoms = new Set<string>();
const styleCache = new Map<string, StyleCacheEntry>();
/** SSR: raw global CSS (theme vars) kept separate from ordered atoms. */
const globalCssRegistry = new Set<string>();
/** SSR: atoms are composed on read so order does not depend on first use. */
const ssrAtoms = new Map<string, EmitAtom>();

let config: {
  isServer: () => boolean;
  breakpoint: string;
  breakpoints: Record<string, string>;
  classPrefix: string;
  cascadeLayers: boolean;
} = {
  isServer: () => typeof document === "undefined",
  breakpoint: "1024px",
  breakpoints: { pc: "1024px" },
  classPrefix: "som",
  cascadeLayers: false,
};

export const configure = (options: RxStyleConfig) => {
  const defaultBp = options.breakpoint ?? config.breakpoint;
  const userBreakpoints = options.breakpoints ?? {};

  config = {
    ...config,
    ...options,
    isServer: options.isServer ?? config.isServer,
    breakpoint: defaultBp,
    breakpoints: {
      pc: defaultBp,
      ...config.breakpoints,
      ...userBreakpoints,
    },
    classPrefix: options.classPrefix ?? config.classPrefix,
    cascadeLayers: options.cascadeLayers ?? config.cascadeLayers,
  };

  // Breakpoints may have grown — keep the declared layer order in sync.
  if (!config.isServer() && typeof document !== "undefined") {
    syncLayerOrderElement();
  }
};

/** Snapshot used by runtime emit and the Vite plugin. */
export const getStyleConfig = (): EmitStyleContext => ({
  breakpoints: { ...config.breakpoints },
  classPrefix: config.classPrefix,
  breakpoint: config.breakpoint,
  cascadeLayers: config.cascadeLayers,
});

/** Returns CSS collected during SSR. */
export const getCollectedStyles = () =>
  [
    ...globalCssRegistry,
    composeAtomCss(ssrAtoms.values(), {
      cascadeLayers: config.cascadeLayers,
    }),
  ]
    .filter(Boolean)
    .join("\n");

/** Clears the SSR style registry. */
export const clearCollectedStyles = () => {
  globalCssRegistry.clear();
  ssrAtoms.clear();
};

/** Injects global CSS on the client, or collects it for SSR. */
export const injectGlobalCss = (css: string, id: string) => {
  if (!config.isServer() && typeof document !== "undefined") {
    const elId = `som-global-${id}`;
    const existing = document.getElementById(elId);
    if (existing) {
      existing.textContent = css;
      return;
    }
    const styleEl = document.createElement("style");
    styleEl.id = elId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  } else {
    globalCssRegistry.add(css);
  }
};

/**
 * One <style> per cascade bucket (base, then each breakpoint), kept in
 * ascending DOM order. Atoms are shared across modules and arrive in
 * first-use order, so a single sheet would let a deduped base rule land
 * after the breakpoint rule that is supposed to override it.
 */
type SheetBucket = {
  order: number;
  layer: string;
  el: HTMLStyleElement;
  /** Kept sorted by atom priority so longhands land after their shorthands. */
  rules: Array<{ priority: number; rule: string }>;
  /** insertRule failed once — this element is text-driven from now on. */
  textMode: boolean;
};

/** Sorted ascending by `order`; DOM order matches. */
const sheetBuckets: SheetBucket[] = [];
let layerOrderEl: HTMLStyleElement | null = null;

const LAYER_ORDER_ID = "som-layer-order";

const bucketElementId = (bpKey: string | null) =>
  `som-sheet-${bpKey ? cssIdent(bpKey) : "base"}`;

/** Declare `@layer` order ahead of every layered rule (no-op when off). */
const syncLayerOrderElement = () => {
  if (!config.cascadeLayers) return;
  const css = layerOrderForContext(
    getStyleConfig(),
    sheetBuckets
      .filter((b) => b.order > 0)
      .map((b) => ({ order: b.order, layer: b.layer }))
  );
  if (!css) return;

  if (!layerOrderEl) {
    layerOrderEl =
      (document.getElementById(LAYER_ORDER_ID) as HTMLStyleElement | null) ??
      document.createElement("style");
    layerOrderEl.id = LAYER_ORDER_ID;
  }
  if (!layerOrderEl.parentNode) {
    document.head.insertBefore(layerOrderEl, sheetBuckets[0]?.el ?? null);
  }
  if (layerOrderEl.textContent !== css) layerOrderEl.textContent = css;
};

const getBucket = (atom: EmitAtom): SheetBucket | null => {
  if (config.isServer() || typeof document === "undefined") return null;

  syncLayerOrderElement();

  const existing = sheetBuckets.find((b) => b.order === atom.order);
  if (existing) return existing;

  const elId = bucketElementId(atom.bpKey);
  let el = document.getElementById(elId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = elId;
  }

  const nextIdx = sheetBuckets.findIndex((b) => b.order > atom.order);
  if (!el.parentNode) {
    if (nextIdx === -1) {
      const last = sheetBuckets[sheetBuckets.length - 1];
      document.head.insertBefore(el, last ? last.el.nextSibling : null);
    } else {
      document.head.insertBefore(el, sheetBuckets[nextIdx].el);
    }
  }

  const bucket: SheetBucket = {
    order: atom.order,
    layer: atom.layer,
    el,
    rules: [],
    textMode: false,
  };
  if (nextIdx === -1) sheetBuckets.push(bucket);
  else sheetBuckets.splice(nextIdx, 0, bucket);
  // A brand-new bucket may be an inline breakpoint the config never named.
  syncLayerOrderElement();
  return bucket;
};

const insertIntoBucket = (bucket: SheetBucket, atom: EmitAtom, rules: string[]) => {
  const nextHigherIndex = bucket.rules.findIndex(
    (entry) => entry.priority > atom.priority
  );
  const insertIndex =
    nextHigherIndex === -1 ? bucket.rules.length : nextHigherIndex;
  bucket.rules.splice(
    insertIndex,
    0,
    ...rules.map((rule) => ({ priority: atom.priority, rule }))
  );

  if (!bucket.textMode && bucket.el.sheet) {
    try {
      rules.forEach((rule, offset) =>
        bucket.el.sheet!.insertRule(rule, insertIndex + offset)
      );
      return;
    } catch {
      // Writing textContent re-parses the sheet, discarding insertRule work —
      // so once we fall back, this element stays text-driven.
      bucket.textMode = true;
    }
  }

  bucket.textMode = true;
  bucket.el.textContent = bucket.rules.map((entry) => entry.rule).join("\n");
};

const ensureAtoms = (atoms: EmitAtom[]) => {
  if (!config.isServer() && typeof document !== "undefined") {
    const options = { cascadeLayers: config.cascadeLayers };
    for (const atom of atoms) {
      if (injectedAtoms.has(atom.id)) continue;
      const bucket = getBucket(atom);
      if (!bucket) continue;
      injectedAtoms.add(atom.id);
      insertIntoBucket(bucket, atom, atomRules(atom, options));
    }
    return;
  }

  for (const atom of atoms) {
    if (!ssrAtoms.has(atom.id)) ssrAtoms.set(atom.id, atom);
  }
};

/** @internal drop injected sheets/caches (tests). */
export const __resetStyleSheetsForTests = () => {
  injectedAtoms.clear();
  styleCache.clear();
  clearCollectedStyles();
  for (const bucket of sheetBuckets) bucket.el.remove();
  sheetBuckets.length = 0;
  layerOrderEl?.remove();
  layerOrderEl = null;
};

const isStyleHandle = (value: unknown): value is StyleHandle =>
  typeof value === "object" &&
  value !== null &&
  "className" in value &&
  "options" in value &&
  typeof (value as StyleHandle).extend === "function";

/**
 * Merge style declarations (or a StyleHandle's options) then pass to style().
 * Prefer this over stacking class names that set the same CSS property.
 */
export const extend = (
  base: ResponsiveStyleOptions | StyleHandle,
  patch: StyleExtendPatch
): ResponsiveStyleOptions => {
  const baseOptions = isStyleHandle(base) ? base.options : base;
  return mergeResponsiveOptions(baseOptions, patch);
};

/**
 * Bind an already-emitted class list to options (Vite extract + .extend()).
 * Prefer style() in app code; the plugin emits this helper.
 * Returns a String object so React/DOM accept `className={handle}`.
 */
export const makeStyleHandle = (
  className: string,
  options: ResponsiveStyleOptions
): StyleHandle => {
  const stored = cloneResponsiveOptions(options);

  const handle = Object.assign(new String(className), {
    className,
    options: stored,
    extend(patch: StyleExtendPatch) {
      return style(mergeResponsiveOptions(stored, patch));
    },
  });

  return handle as StyleHandle;
};

/**
 * Mobile-first styles from a CSS-like object.
 * Returns a handle: stringifies to class names; use .extend() to override props.
 */
export const style = (options: ResponsiveStyleOptions): StyleHandle => {
  warnIfLikelyInRender();

  let opts = options;
  if (!opts || typeof opts !== "object") {
    console.error(
      "[som-style] Invalid options passed to style(). Expected an object."
    );
    opts = { base: {} };
  }

  if (!opts.base) {
    console.warn(
      '[som-style] Missing "base" property in style({ ... }). Defaulting to empty base styles.'
    );
  }

  const ctx = getStyleConfig();

  const emitted = emitStyle(opts, ctx);
  const cached = styleCache.get(emitted.styleKey);
  if (cached) {
    ensureAtoms(cached.atoms);
    return makeStyleHandle(cached.className, opts);
  }

  ensureAtoms(emitted.atoms);
  styleCache.set(emitted.styleKey, {
    className: emitted.className,
    atoms: emitted.atoms,
  });
  return makeStyleHandle(emitted.className, opts);
};

let warnedRenderCall = false;

/** @internal reset render-warning latch (tests). */
export const __resetStyleWarningsForTests = () => {
  warnedRenderCall = false;
};

const isProduction = () =>
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

/** Dev-only: warn when style() looks like it runs inside a React render. */
const warnIfLikelyInRender = () => {
  if (isProduction() || warnedRenderCall) return;
  const stack = new Error().stack ?? "";
  if (
    /renderWithHooks|finishFunctionComponent|renderNodeDestructive|renderToString/.test(
      stack
    )
  ) {
    warnedRenderCall = true;
    console.warn(
      "[som-style] style() looks like it ran during React render. Call style() / recipe() at module top level, then pick classes in render."
    );
  }
};
