import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, type Rollup } from "vite";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { somStyle } from "../src/vite-plugin.js";

/**
 * Cross-file analysis reads imported modules from disk, so this fixture is a
 * real folder inside the repo (where `som-style` resolves to this package).
 */
const repoRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = join(repoRoot, "__crossfile_fixture__");

const fixtureFiles: Record<string, string> = {
  "som-style/theme.js": `
    import { defineTheme } from "som-style";
    export const theme = defineTheme({
      light: { primary: "oklch(0.6 0.2 40)" },
      dark: { primary: "oklch(0.7 0.2 40)" },
    });`,
  "som-style/constant.js": `export const space = { s4: "1rem" };`,
  "som-style/components/button.js": `
    import { style } from "som-style";
    import { theme } from "../theme.js";
    import { space } from "../constant.js";
    export const button = style({
      base: { color: theme.primary, padding: space.s4, width: "auto" },
    });`,
  "som-style/components/index.js": `export { button } from "./button.js";`,
  "schema.js": `
    const baseSchema = { extend: (fields) => ({ ...fields }) };
    export const adminSchema = baseSchema.extend({ role: "admin" });`,
  "page.js": `
    import { button } from "./som-style/components";
    import { adminSchema } from "./schema.js";
    export const wideButton = button.extend({ base: { width: 320 } });
    console.log(String(wideButton), adminSchema);`,
};

const writeFixture = (files: Record<string, string>) => {
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(fixtureRoot, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
  }
};

const buildFixture = async (entry: string) => {
  const result = await build({
    root: fixtureRoot,
    configFile: false,
    logLevel: "silent",
    plugins: [somStyle()],
    build: {
      minify: false,
      write: false,
      rollupOptions: { input: join(fixtureRoot, entry) },
    },
  });
  const output = (result as Rollup.RollupOutput).output;
  const css = output
    .filter((item): item is Rollup.OutputAsset => item.type === "asset" && item.fileName.endsWith(".css"))
    .map((asset) => String(asset.source))
    .join("\n");
  const js = output
    .filter((item): item is Rollup.OutputChunk => item.type === "chunk")
    .map((chunk) => chunk.code)
    .join("\n");
  return { css, js };
};

describe("somStyle build across files", () => {
  beforeAll(() => writeFixture(fixtureFiles));
  afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it("extends a handle re-exported by components/index.js and ignores non-som-style .extend()", async () => {
    const { css, js } = await buildFixture("page.js");

    expect(css).toContain("width:320px");
    expect(css).toContain("color:var(--som-theme-primary)");
    expect(css).toContain("padding:1rem");
    expect(js).not.toMatch(/button\.extend\(/);
    expect(js).toMatch(/\.extend\(\{\s*role: "admin"\s*\}\)/);
  });

  it("fails the build on a theme token theme.js does not define", async () => {
    writeFixture({
      "typo.js": `
        import { style } from "som-style";
        import { theme } from "./som-style/theme.js";
        export const box = style({ base: { color: theme.primry } });
        console.log(String(box));`,
    });

    await expect(buildFixture("typo.js")).rejects.toThrow(/"theme\.primry" is not defined/);
  });
});
