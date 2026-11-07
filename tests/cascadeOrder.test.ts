import { describe, it, expect } from "vitest";
import { emitStyle, type EmitStyleContext } from "../src/emitStyle.js";
import { composeAtomCss, layerOrderForContext } from "../src/composeCss.js";
import { buildSharedCss, transformForBuild } from "../src/vite-plugin.js";

const ctx: EmitStyleContext = {
  breakpoints: { sm: "640px", pc: "1024px" },
  classPrefix: "som",
  breakpoint: "1024px",
};

const indexOfAll = (css: string, needle: string) => {
  const at = css.indexOf(needle);
  expect(at, `expected ${needle} in:\n${css}`).toBeGreaterThan(-1);
  return at;
};

describe("cascade ordering", () => {
  it("keeps a shared base atom before an earlier-emitted breakpoint rule", () => {
    // Module A only declares the pc value; the base value comes from module B.
    // Deduping made B's base atom land after A's @media before this fix.
    const a = emitStyle(
      { base: { display: "grid" }, pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" } },
      ctx
    );
    const b = emitStyle(
      {
        base: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
        pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
      },
      ctx
    );

    const css = composeAtomCss([...a.atoms, ...b.atoms]);
    expect(indexOfAll(css, "repeat(2,minmax(0,1fr))")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 1024px)")
    );
  });

  it("orders breakpoints by min-width no matter which module emitted first", () => {
    const a = emitStyle({ base: { color: "gray" }, pc: { color: "blue" } }, ctx);
    const b = emitStyle(
      { base: { color: "gray" }, sm: { color: "green" }, pc: { color: "blue" } },
      ctx
    );

    const css = composeAtomCss([...a.atoms, ...b.atoms]);
    expect(indexOfAll(css, "@media (min-width: 640px)")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 1024px)")
    );
  });

  it("sorts em/rem breakpoints numerically, not lexically", () => {
    const emCtx: EmitStyleContext = {
      ...ctx,
      breakpoints: { wide: "80em", tablet: "48em" },
    };
    const a = emitStyle({ base: { color: "gray" }, wide: { color: "blue" } }, emCtx);
    const b = emitStyle({ base: { color: "gray" }, tablet: { color: "green" } }, emCtx);

    const css = composeAtomCss([...a.atoms, ...b.atoms]);
    expect(indexOfAll(css, "@media (min-width: 48em)")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 80em)")
    );
  });

  it("dedupes atoms and keeps emission order inside one bucket", () => {
    const a = emitStyle({ base: { color: "gray" } }, ctx);
    const b = emitStyle({ base: { color: "gray" }, pc: { color: "blue" } }, ctx);
    const css = composeAtomCss([...a.atoms, ...b.atoms, ...a.atoms]);
    expect(css.split("color:gray")).toHaveLength(2);
  });

  it("puts longhands after their shorthands no matter which module emitted first", () => {
    const a = emitStyle(
      { base: { paddingTop: "8px", borderTopColor: "red", top: 0 } },
      ctx
    );
    const b = emitStyle(
      { base: { padding: 0, paddingTop: "8px", border: "1px solid", inset: 0 } },
      ctx
    );

    const css = composeAtomCss([...a.atoms, ...b.atoms]);
    expect(indexOfAll(css, "{padding:0;}")).toBeLessThan(
      indexOfAll(css, "padding-top:8px")
    );
    expect(indexOfAll(css, "border:1px solid")).toBeLessThan(
      indexOfAll(css, "border-top-color:red")
    );
    expect(indexOfAll(css, "inset:0")).toBeLessThan(indexOfAll(css, "{top:0;}"));
  });

  it("puts nested rules after flat atoms in the same bucket", () => {
    const a = emitStyle({ base: { "&:hover": { color: "red" } } }, ctx);
    const b = emitStyle({ base: { color: "gray" } }, ctx);
    const css = composeAtomCss([...a.atoms, ...b.atoms]);
    expect(indexOfAll(css, "color:gray")).toBeLessThan(indexOfAll(css, ":hover"));
  });

  it("buildSharedCss puts theme CSS first, then ordered atoms", () => {
    const a = emitStyle({ base: { display: "grid" }, pc: { color: "blue" } }, ctx);
    const b = emitStyle({ base: { color: "gray" }, sm: { color: "green" } }, ctx);

    const css = buildSharedCss([
      { atoms: a.atoms, themeCss: ":root{--som-theme-primary:red}" },
      { atoms: b.atoms },
    ]);

    expect(indexOfAll(css, "--som-theme-primary")).toBeLessThan(
      indexOfAll(css, "color:gray")
    );
    expect(indexOfAll(css, "color:gray")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 640px)")
    );
    expect(indexOfAll(css, "@media (min-width: 640px)")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 1024px)")
    );
  });
});

describe("cascadeLayers", () => {
  const layered = { cascadeLayers: true };

  it("declares the layer order before any layered rule", () => {
    const a = emitStyle(
      { base: { color: "gray" }, sm: { color: "green" }, pc: { color: "blue" } },
      ctx
    );
    const css = composeAtomCss(a.atoms, layered);

    expect(css.startsWith("@layer som.base, som.sm, som.pc;")).toBe(true);
    expect(css).toContain("@layer som.base{.");
    expect(css).toContain("@layer som.sm{@media (min-width: 640px)");
    expect(css).toContain("@layer som.pc{@media (min-width: 1024px)");
  });

  it("is off by default", () => {
    const a = emitStyle({ base: { color: "gray" } }, ctx);
    expect(composeAtomCss(a.atoms)).not.toContain("@layer");
  });

  it("makes a numeric breakpoint key a valid layer ident", () => {
    const pxCtx: EmitStyleContext = { ...ctx, breakpoints: {} };
    const a = emitStyle({ base: { color: "gray" }, "768px": { color: "blue" } }, pxCtx);
    const css = composeAtomCss(a.atoms, layered);
    expect(css).toContain("@layer som.bp-768px");
    expect(css).not.toMatch(/@layer som\.\d/);
  });

  it("layerOrderForContext lists every configured breakpoint ascending", () => {
    expect(layerOrderForContext({ ...ctx, cascadeLayers: true })).toBe(
      "@layer som.base, som.sm, som.pc;"
    );
  });
});

describe("transformForBuild ordering", () => {
  const source = `import { style, variants } from "som-style";

    export const grid = style({
      base: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
      sm: { gap: "8px" },
      pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
    });
  `;

  it("emits base, then breakpoints ascending", () => {
    const { css } = transformForBuild(source, "grid.js", ctx);
    expect(indexOfAll(css, "repeat(2,minmax(0,1fr))")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 640px)")
    );
    expect(indexOfAll(css, "@media (min-width: 640px)")).toBeLessThan(
      indexOfAll(css, "@media (min-width: 1024px)")
    );
  });

  it("honours cascadeLayers from the resolved config", () => {
    const { css } = transformForBuild(source, "grid.js", {
      ...ctx,
      cascadeLayers: true,
    });
    expect(css.startsWith("@layer som.base, som.sm, som.pc;")).toBe(true);
  });

  it("extracts nested at-rule keys", () => {
    const { css } = transformForBuild(
      `import { style, variants } from "som-style";
export const link = style({ base: { "@media (hover: hover)": { "&:hover": { color: "red" } } } });`,
      "link.js",
      ctx
    );
    expect(css).toMatch(/@media \(hover: hover\)\{\.som-n[a-z0-9]+:hover \{ color:red; \}\}/);
  });
});

