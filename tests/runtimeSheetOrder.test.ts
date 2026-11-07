/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type * as RuntimeModule from "../src/createResponsiveStyle.js";

/** Fresh module instance — the sheet buckets and atom cache are module state. */
const freshRuntime = async (): Promise<typeof RuntimeModule> => {
  vi.resetModules();
  document.head.innerHTML = "";
  return import("../src/createResponsiveStyle.js");
};

const sheetIds = () =>
  [...document.head.children].map((el) => (el as HTMLElement).id);

const sheetText = (id: string) => {
  const el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) return "";
  if (el.textContent) return el.textContent;
  return [...(el.sheet?.cssRules ?? [])].map((r) => r.cssText).join("\n");
};

describe("runtime sheet order", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("puts a later-injected base atom in the base sheet, ahead of pc", async () => {
    const { style, configure } = await freshRuntime();
    configure({ isServer: () => false, breakpoints: { pc: "1024px" } });

    // Injects the pc atom first — the base value below is new at that point.
    style({
      base: { display: "grid" },
      pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
    });
    style({
      base: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
      pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
    });

    expect(sheetIds()).toEqual(["som-sheet-base", "som-sheet-pc"]);
    expect(sheetText("som-sheet-base")).toContain("repeat(2,minmax(0,1fr))");
    expect(sheetText("som-sheet-pc")).toContain("repeat(4,minmax(0,1fr))");
  });

  it("inserts a narrower breakpoint sheet before an existing wider one", async () => {
    const { style, configure } = await freshRuntime();
    configure({
      isServer: () => false,
      breakpoints: { sm: "640px", pc: "1024px" },
    });

    style({ base: { color: "gray" }, pc: { color: "blue" } });
    style({ base: { color: "gray" }, sm: { color: "green" } });

    expect(sheetIds()).toEqual([
      "som-sheet-base",
      "som-sheet-sm",
      "som-sheet-pc",
    ]);
  });

  it("declares the layer order before every sheet when cascadeLayers is on", async () => {
    const { style, configure } = await freshRuntime();
    configure({
      isServer: () => false,
      breakpoints: { sm: "640px", pc: "1024px" },
      cascadeLayers: true,
    });

    style({ base: { color: "gray" }, pc: { color: "blue" } });

    expect(sheetIds()[0]).toBe("som-layer-order");
    expect(sheetText("som-layer-order")).toBe("@layer som.base, som.sm, som.pc;");
    expect(sheetText("som-sheet-pc")).toContain("@layer som.pc{");
  });

  it("declares an inline px breakpoint in the layer order too", async () => {
    const { style, configure } = await freshRuntime();
    configure({
      isServer: () => false,
      breakpoints: { pc: "1024px" },
      cascadeLayers: true,
    });

    style({ base: { color: "gray" }, pc: { color: "blue" } });
    style({ base: { color: "gray" }, "768px": { color: "green" } });

    // An undeclared layer sorts after every declared one, so a narrow inline
    // breakpoint would otherwise beat the wider named one.
    expect(sheetText("som-layer-order")).toBe(
      "@layer som.base, som.bp-768px, som.pc;"
    );
    expect(sheetIds()).toEqual([
      "som-layer-order",
      "som-sheet-base",
      "som-sheet-bp-768px",
      "som-sheet-pc",
    ]);
  });

  it("emits no @layer by default", async () => {
    const { style, configure } = await freshRuntime();
    configure({ isServer: () => false, breakpoints: { pc: "1024px" } });
    style({ base: { color: "gray" }, pc: { color: "blue" } });

    expect(sheetIds()).not.toContain("som-layer-order");
    expect(sheetText("som-sheet-pc")).not.toContain("@layer");
  });

  it("injects each atom once across repeated style() calls", async () => {
    const { style, configure } = await freshRuntime();
    configure({ isServer: () => false, breakpoints: { pc: "1024px" } });

    style({ base: { color: "gray" } });
    style({ base: { color: "gray" }, pc: { color: "blue" } });
    style({ base: { color: "gray" } });

    expect(sheetText("som-sheet-base").split("color: gray").length - 1).toBe(1);
  });

  it("keeps a longhand after a later-injected shorthand", async () => {
    const { style, configure } = await freshRuntime();
    configure({ isServer: () => false, breakpoints: { pc: "1024px" } });

    style({ base: { paddingTop: "8px" } });
    style({ base: { padding: 0, paddingTop: "8px" } });

    const baseText = sheetText("som-sheet-base");
    expect(baseText.indexOf("padding: 0")).toBeGreaterThan(-1);
    expect(baseText.indexOf("padding: 0")).toBeLessThan(
      baseText.indexOf("padding-top: 8px")
    );
  });
});

describe("SSR collected styles", () => {
  it("orders base before breakpoints and keeps global CSS first", async () => {
    const { style, configure, injectGlobalCss, getCollectedStyles } =
      await freshRuntime();
    configure({
      isServer: () => true,
      breakpoints: { sm: "640px", pc: "1024px" },
    });

    injectGlobalCss(":root{--som-theme-primary:red}", "theme");
    style({ base: { display: "grid" }, pc: { color: "blue" } });
    style({ base: { color: "gray" }, sm: { color: "green" } });

    const css = getCollectedStyles();
    const at = (needle: string) => {
      const i = css.indexOf(needle);
      expect(i, `expected ${needle} in:\n${css}`).toBeGreaterThan(-1);
      return i;
    };

    expect(at("--som-theme-primary")).toBeLessThan(at("color:gray"));
    expect(at("color:gray")).toBeLessThan(at("@media (min-width: 640px)"));
    expect(at("@media (min-width: 640px)")).toBeLessThan(
      at("@media (min-width: 1024px)")
    );
  });

  it("clearCollectedStyles empties both globals and atoms", async () => {
    const { style, configure, injectGlobalCss, getCollectedStyles, clearCollectedStyles } =
      await freshRuntime();
    configure({ isServer: () => true, breakpoints: { pc: "1024px" } });

    injectGlobalCss(":root{--x:1}", "theme");
    style({ base: { color: "gray" }, pc: { color: "blue" } });
    expect(getCollectedStyles()).not.toBe("");

    clearCollectedStyles();
    expect(getCollectedStyles()).toBe("");
  });
});
