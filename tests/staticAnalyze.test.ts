import { describe, it, expect } from "vitest";
import { analyzeStyleCalls } from "../src/staticAnalyze.js";
import { transformForBuild } from "../src/vite-plugin.js";

describe("staticAnalyze", () => {
  it("accepts object literal", () => {
    const code = `import { style, variants } from "som-style";
const box = style({ base: { display: "flex" }, pc: { gap: "1rem" } });`;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({ display: "flex" });
  });

  it("accepts same-file const object", () => {
    const code = `import { style, variants } from "som-style";

      const styles = { base: { display: "flex" }, pc: { gap: "1rem" } };
      const box = style(styles);
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({ display: "flex" });
  });

  it("marks unresolved variable as dynamic", () => {
    const code = `import { style, variants } from "som-style";
const box = style(opts);`;
    const { hits } = analyzeStyleCalls(code);
    expect(hits[0].kind).toBe("dynamic");
  });

  it("statically merges same-file .extend()", () => {
    const code = `import { style, variants } from "som-style";

      const box = style({ base: { color: "red", padding: "1rem" } });
      const tight = box.extend({ base: { padding: "0.5rem" } });
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.kind === "static")).toBe(true);
    expect(hits[1].options?.base).toEqual({
      color: "red",
      padding: "0.5rem",
    });
  });

  it("marks .extend with dynamic patch as dynamic", () => {
    const code = `import { style, variants } from "som-style";

      const box = style({ base: { color: "red" } });
      for (const p of patches) {
        box.extend(p);
      }
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits.some((h) => h.kind === "dynamic")).toBe(true);
  });

  it("accepts static variants() map", () => {
    const code = `import { style, variants } from "som-style";

      const tone = variants({
        ok: { base: { color: "green" } },
        bad: { base: { color: "red" } },
      });
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("variants");
    expect(hits[0].variantMap?.ok?.base).toEqual({ color: "green" });
    expect(hits[0].variantMap?.bad?.base).toEqual({ color: "red" });
  });

  it("accepts theme.* / space.* tokens and templates that interpolate them", () => {
    const code = `
      import { style } from "som-style";
      import { theme } from "./som-style/theme.js";
      import { space } from "./som-style/constant.js";
      const box = style({
        base: {
          color: theme.text,
          gap: space.s4,
          background: \`linear-gradient(\${theme.primary}, \${theme.bg})\`,
        },
      });
    `;
    const { hits } = analyzeStyleCalls(code, {
      tokenMaps: new Map([["space", { s4: "1rem" }]]),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({
      color: "var(--som-theme-text)",
      gap: "1rem",
      background: "linear-gradient(var(--som-theme-primary), var(--som-theme-bg))",
    });
  });

  it("accepts defineTheme custom names without a fixed whitelist", () => {
    const code = `
      import { style } from "som-style";
      import { theme } from "./som-style/theme.js";
      const box = style({
        base: { color: theme.warning, border: theme.softBorder },
      });
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({
      color: "var(--som-theme-warning)",
      border: "var(--som-theme-soft-border)",
    });
  });

  it("maps app.* / token.* from project constant.js", () => {
    const code = `
      import { style } from "som-style";
      import { space, token } from "./som-style/constant.js";
      const box = style({
        base: {
          gap: space.s9,
          padding: token.customSize,
          background: token.userAwesome,
        },
      });
    `;
    const { hits } = analyzeStyleCalls(code, {
      tokenMaps: new Map([
        ["space", { s9: "4rem" }],
        [
          "token",
          {
            customSize: "20px",
            userAwesome: "oklch(0.62 0.14 280)",
          },
        ],
      ]),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({
      gap: "4rem",
      padding: "20px",
      background: "oklch(0.62 0.14 280)",
    });
  });

  it("accepts any constant.js export name (no group whitelist)", () => {
    const code = `
      import { style } from "som-style";
      import { brand } from "./som-style/constant.js";
      const box = style({
        base: { gap: brand.heroGap, color: brand.accent },
      });
    `;
    const { hits } = analyzeStyleCalls(code, {
      tokenMaps: new Map([
        [
          "brand",
          {
            heroGap: "var(--som-hero-gap)",
            accent: "oklch(0.7 0.1 200)",
          },
        ],
      ]),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({
      gap: "var(--som-hero-gap)",
      color: "oklch(0.7 0.1 200)",
    });
  });

  it("fails loud when custom group has no tokenMaps (no fake CSS vars)", () => {
    const code = `
      import { style } from "som-style";
      const box = style({
        base: { padding: myStuff.customPad },
      });
    `;
    const { hits } = analyzeStyleCalls(code);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("dynamic");
    expect(hits[0].error).toMatch(/padding/);
  });
});

describe("only som-style calls are analyzed", () => {
  it.each([
    ["zod .extend()", `import { z } from "zod"; const User = z.object({ id: z.string() }); export const Admin = User.extend({ role: z.string() });`],
    ["dayjs.extend()", `import dayjs from "dayjs"; import utc from "dayjs/plugin/utc"; dayjs.extend(utc);`],
    ["d3 .style()", `import * as d3 from "d3"; d3.select("svg").style("fill", "red");`],
    ["a local style() helper", `const style = (o) => o; export const s = style({ color: "red" });`],
  ])("leaves %s alone", (_, code) => {
    expect(analyzeStyleCalls(code).hits).toEqual([]);
  });

  it("follows renamed and namespace imports", () => {
    const { hits } = analyzeStyleCalls(`
      import { style as css } from "som-style";
      import * as som from "som-style/solid";
      export const a = css({ base: { color: "red" } });
      export const b = som.style({ base: { color: "blue" } });
    `);
    expect(hits.map((hit) => hit.options?.base)).toEqual([
      { color: "red" },
      { color: "blue" },
    ]);
  });

  it("extends a handle imported from another module", () => {
    const { hits } = analyzeStyleCalls(
      `import { button } from "./som-style/components";
       export const wideButton = button.extend({ base: { width: "100%" } });`,
      {
        importedHandles: new Map([
          ["button", { ok: true, options: { base: { color: "red", width: "auto" } } }],
        ]),
      }
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({ color: "red", width: "100%" });
  });

  it("reports which handles a module exports", () => {
    const { exportedHandles } = analyzeStyleCalls(`
      import { style } from "som-style";
      const panel = style({ base: { padding: "1rem" } });
      export const button = style({ base: { color: "red" } });
      export { panel as card };
    `);
    expect([...exportedHandles.keys()]).toEqual(["button", "card"]);
  });
});

describe("static values", () => {
  const themeTokens = new Map([["theme", { primary: "var(--som-theme-primary)" }]]);

  it("names a theme token theme.js does not define", () => {
    const { hits } = analyzeStyleCalls(
      `import { style } from "som-style";
       import { theme } from "./som-style/theme.js";
       export const box = style({ base: { border: \`1px solid \${theme.primry}\` } });`,
      { tokenMaps: themeTokens }
    );
    expect(hits[0].kind).toBe("dynamic");
    expect(hits[0].error).toContain('"theme.primry" is not defined');
  });

  it("accepts negative numbers and same-file const values", () => {
    const { hits } = analyzeStyleCalls(`
      import { style } from "som-style";
      const gap = "8px";
      export const box = style({ base: { gap, marginTop: -1 } });
    `);
    expect(hits[0].kind).toBe("static");
    expect(hits[0].options?.base).toEqual({ gap: "8px", marginTop: -1 });
  });
});

describe("transformForBuild", () => {
  const ctx = {
    breakpoints: { pc: "1024px" },
    classPrefix: "som",
    breakpoint: "1024px",
  };

  it("replaces style() with a class string", () => {
    const input = `import { style } from "som-style";\nexport const box = style({ base: { color: "red" } });`;
    const out = transformForBuild(input, "src/x.js", ctx);
    expect(out.code).toMatch(/export const box = Object\.assign\(Object\("[^"]+"\)/);
    expect(out.code).not.toMatch(/\bstyle\s*\(/);
    expect(out.css.length).toBeGreaterThan(0);
  });

  it("replaces same-file .extend() with a class string", () => {
    const input = `
      import { style } from "som-style";
      const box = style({ base: { color: "red", padding: "1rem" } });
      export const tight = box.extend({ base: { padding: "0.5rem" } });
    `;
    const out = transformForBuild(input, "src/y.js", ctx);
    expect(out.code).toMatch(/export const tight = Object\.assign\(Object\("[^"]+"\)/);
    expect(out.code).not.toMatch(/\.extend\s*\(/);
    expect(out.css.length).toBeGreaterThan(0);
  });

  it("replaces variants() with a class-name map", () => {
    const input = `
      import { variants } from "som-style";
      export const tone = variants({
        ok: { base: { color: "green" } },
        bad: { base: { color: "red" } },
      });
    `;
    const out = transformForBuild(input, "src/z.js", ctx);
    expect(out.code).toMatch(/export const tone = \(\{/);
    expect(out.code).toMatch(/"ok":Object\.assign\(Object\("[^"]+"\)/);
    expect(out.code).toMatch(/"bad":Object\.assign\(Object\("[^"]+"\)/);
    expect(out.code).not.toMatch(/\bvariants\s*\(/);
    expect(out.css).toContain("color:green");
    expect(out.css).toContain("color:red");
  });

  it("replaces recipe() with a class lookup (no style engine call left)", () => {
    const input = `
      import { recipe } from "som-style";
      export const btn = recipe({
        base: { base: { display: "flex" } },
        variants: {
          size: {
            sm: { base: { padding: "4px" } },
            md: { base: { padding: "8px" } },
          },
        },
        defaultVariants: { size: "md" },
      });
    `;
    const out = transformForBuild(input, "src/r.js", ctx);
    expect(out.code).not.toMatch(/\brecipe\s*\(/);
    expect(out.code).toMatch(/__m\[__k\]/);
    expect(out.css).toContain("display:flex");
    expect(out.css).toContain("padding:4px");
    expect(out.css).toContain("padding:8px");
  });

  it("throws on dynamic style()", () => {
    expect(() => transformForBuild(`import { style, variants } from "som-style";
style(x);`, "src/x.js", ctx)).toThrow(
      /static/i
    );
  });
});
