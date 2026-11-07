import type { Properties, PropertiesHyphen } from "csstype";

/**
 * Flat CSS declarations (camelCase preferred; kebab-case also ok),
 * plus `&…` nested selectors and `@media` / `@supports` / `@container`
 * condition blocks. Emit normalizes keys to kebab-case CSS.
 * Unknown property names error on object literals (typo / autocomplete).
 */
export type StyleObject = {
  [K in keyof Properties]?: Properties[K] | null;
} & {
  [K in keyof PropertiesHyphen]?: PropertiesHyphen[K] | null;
} & {
  [K in `&${string}`]?: StyleObject | null | undefined;
} & {
  [K in `@${string}`]?: StyleObject | null | undefined;
};

export type CSSValue = string | number;

export type ResponsiveStyleOptions = {
  /** Styles applied by default (mobile-first) */
  base: StyleObject;
  /** Breakpoint-specific styles (e.g. pc, tablet, or custom px keys) */
  [breakpoint: string]: StyleObject;
};

export type RxStyleConfig = {
  /** Server detection. Default: typeof document === "undefined" */
  isServer?: () => boolean;
  /** Desktop breakpoint for the "pc" key. Default: "1024px" */
  breakpoint?: string;
  /** Map of named breakpoints (e.g. { tablet: "768px", pc: "1024px" }) */
  breakpoints?: Record<string, string>;
  /** Class name prefix. Default: "som" */
  classPrefix?: string;
  /**
   * Emit rules inside `@layer <prefix>.base` / `@layer <prefix>.<breakpoint>`
   * and declare the layer order up front. Breakpoint precedence then no longer
   * depends on the order rules land in the sheet. Default: false.
   *
   * Trade-off: layered CSS loses to *any* unlayered CSS regardless of
   * specificity, so a plain reset or global stylesheet will start winning over
   * som-style classes once this is on.
   */
  cascadeLayers?: boolean;
};
