import { describe, it, expect } from "vitest";
import {
  transformForBuild,
  composeAtomCss,
  buildSharedCss,
} from "../src/vite-plugin.js";

const ctx = {
  breakpoints: { pc: "1024px" },
  classPrefix: "som",
  breakpoint: "1024px",
};

describe("transformForBuild", () => {
  it("replaces static call with class string and returns css", () => {
    const input = `import { style } from "som-style";\nexport const box = style({ base: { color: "red" } });`;
    const out = transformForBuild(input, "src/x.js", ctx);
    expect(out.code).toMatch(/export const box = Object\.assign\(Object\("[^"]+"\)/);
    expect(out.code).not.toMatch(/\bstyle\s*\(\s*\{/);
    expect(out.css.length).toBeGreaterThan(0);
    expect(out.atoms.length).toBeGreaterThan(0);
  });

  it("throws on dynamic call", () => {
    expect(() => transformForBuild(`style(x);`, "src/x.js", ctx)).toThrow(
      /static|extraction/i
    );
  });

  it("emits shared base atoms before @media so pc overrides win", () => {
    const input = `
      import { style } from "som-style";
      export const row = style({
        base: { display: "flex", "flex-direction": "column" },
        pc: { "flex-direction": "row" },
      });
      export const stack = style({
        base: { display: "flex", "flex-direction": "column", gap: "1rem" },
      });
    `;
    const out = transformForBuild(input, "src/components.js", ctx);
    const col = out.css.indexOf("flex-direction:column");
    const mediaRow = out.css.indexOf(
      "@media (min-width: 1024px){.som-pc-"
    );
    const rowDecl = out.css.indexOf("flex-direction:row");
    expect(col).toBeGreaterThanOrEqual(0);
    expect(mediaRow).toBeGreaterThan(col);
    expect(rowDecl).toBeGreaterThan(mediaRow);
    expect(out.css.indexOf("flex-direction:column", col + 1)).toBe(-1);
  });

  it("composeAtomCss dedupes the same atom across files", () => {
    const a = transformForBuild(
      `import { style } from "som-style";\nexport const x = style({ base: { display: "flex" } });`,
      "a.js",
      ctx
    );
    const b = transformForBuild(
      `import { style } from "som-style";\nexport const y = style({ base: { display: "flex", gap: "1rem" } });`,
      "b.js",
      ctx
    );
    const merged = composeAtomCss([...a.atoms, ...b.atoms]);
    const displayCount = merged.split("display:flex").length - 1;
    expect(displayCount).toBe(1);
    expect(merged).toContain("gap:1rem");
  });
});

describe("buildSharedCss", () => {
  it("keeps pc display:none after a later module reuses display:flex", () => {
    const mobileList = transformForBuild(
      `import { style } from "som-style";
       export const mobileList = style({
         base: { display: "flex" },
         pc: { display: "none" },
       });`,
      "mobile.js",
      ctx
    );
    const other = transformForBuild(
      `import { style } from "som-style";
       export const other = style({ base: { display: "flex", gap: "1rem" } });`,
      "other.js",
      ctx
    );

    const shared = buildSharedCss([
      { atoms: mobileList.atoms },
      { atoms: other.atoms },
    ]);

    expect(shared.split("display:flex").length - 1).toBe(1);
    const flexAt = shared.indexOf("display:flex");
    const mediaNoneAt = shared.indexOf(
      "@media (min-width: 1024px){.som-pc-"
    );
    const noneAt = shared.indexOf("display:none", mediaNoneAt);
    expect(flexAt).toBeGreaterThanOrEqual(0);
    expect(mediaNoneAt).toBeGreaterThan(flexAt);
    expect(noneAt).toBeGreaterThan(mediaNoneAt);
  });

  it("places theme css before atom rules", () => {
    const style = transformForBuild(
      `import { style } from "som-style";\nexport const x = style({ base: { color: "red" } });`,
      "x.js",
      ctx
    );
    const shared = buildSharedCss([
      { atoms: style.atoms, themeCss: ":root{--som-theme-hue:40;}" },
    ]);
    expect(shared.indexOf(":root")).toBeLessThan(shared.indexOf("color:red"));
  });
});
