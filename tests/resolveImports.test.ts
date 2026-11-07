import { describe, it, expect } from "vitest";
import { analyzeStyleCalls } from "../src/staticAnalyze.js";
import { transformForBuild } from "../src/vite-plugin.js";
import {
  collectStyleImportRefs,
  evalExportedStyleOptions,
} from "../src/resolveImports.js";

describe("cross-file style options", () => {
  it("collects relative named imports", () => {
    const refs = collectStyleImportRefs(`
      import { boxOpts as opts } from "./shared.js";
      import { colors } from "som-style";
    `);
    expect(refs).toEqual([
      { local: "opts", imported: "boxOpts", source: "./shared.js" },
    ]);
  });

  it("evals exported const object options", () => {
    const opts = evalExportedStyleOptions(
      `export const boxOpts = { base: { display: "flex" }, pc: { gap: "1rem" } };`,
      "boxOpts"
    );
    expect(opts?.base).toEqual({ display: "flex" });
    expect(opts?.pc).toEqual({ gap: "1rem" });
  });

  it("evals export { name } re-export of const object", () => {
    const opts = evalExportedStyleOptions(
      `
        const panelOpts = { base: { padding: "1rem" } };
        export { panelOpts };
      `,
      "panelOpts"
    );
    expect(opts?.base).toEqual({ padding: "1rem" });
  });

  it("analyzes style(imported) when externalOptions provided", () => {
    const external = new Map([
      ["boxOpts", { base: { color: "red" } }],
    ]);
    const { hits } = analyzeStyleCalls(`import { style, variants } from "som-style";
const box = style(boxOpts);`, {
      externalOptions: external,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({ color: "red" });
  });

  it("transformForBuild extracts imported options", () => {
    const ctx = {
      breakpoints: { pc: "1024px" },
      classPrefix: "som",
      breakpoint: "1024px",
    };
    const external = new Map([
      ["boxOpts", { base: { color: "blue" } }],
    ]);
    const out = transformForBuild(
      `import { style, variants } from "som-style";
import { boxOpts } from "./shared.js";\nexport const box = style(boxOpts);`,
      "src/a.js",
      ctx,
      { externalOptions: external }
    );
    expect(out.code).toMatch(/export const box = Object\.assign\(Object\("[^"]+"\)/);
    expect(out.css).toContain("color:blue");
  });
});
