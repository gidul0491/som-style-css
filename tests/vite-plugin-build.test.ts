import { describe, expect, it } from "vitest";
import { build, type Plugin, type Rollup } from "vite";
import { dirname, resolve } from "node:path";
import { somStyle } from "../src/vite-plugin.js";

const root = resolve(import.meta.dirname, "..");

const fixturePlugin = (files: Map<string, string>): Plugin => ({
  name: "som-style-route-chunk-fixture",
  resolveId(id, importer) {
    if (files.has(id)) return id;
    if (importer && id.startsWith(".")) {
      const resolved = resolve(dirname(importer), id);
      if (files.has(resolved)) return resolved;
    }
    return null;
  },
  load(id) {
    return files.get(id) ?? null;
  },
});

describe("somStyle production build", () => {
  it("keeps shared base rules before pc rules across lazy route chunks", async () => {
    const mainId = resolve(root, "__route_chunk_fixture__/main.js");
    const routeAId = resolve(root, "__route_chunk_fixture__/route-a.js");
    const routeBId = resolve(root, "__route_chunk_fixture__/route-b.js");
    const files = new Map([
      [
        mainId,
        `globalThis.loadA = () => import("./route-a.js");
         globalThis.loadB = () => import("./route-b.js");`,
      ],
      [
        routeAId,
        `import { style, variants } from "som-style";
export const panel = style({
           base: { display: "block" },
           pc: { width: "248px" },
         });
         console.log(panel);`,
      ],
      [
        routeBId,
        `import { style, variants } from "som-style";
export const content = style({
           base: { width: "100%" },
           pc: { width: "248px" },
         });
         console.log(content);`,
      ],
    ]);

    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [fixturePlugin(files), somStyle()],
      build: {
        cssCodeSplit: true,
        minify: false,
        write: false,
        rollupOptions: { input: mainId },
      },
    });
    const output = (result as Rollup.RollupOutput).output;
    const cssAssets = output.filter(
      (item): item is Rollup.OutputAsset =>
        item.type === "asset" && item.fileName.endsWith(".css")
    );

    expect(cssAssets).toHaveLength(1);
    const css = String(cssAssets[0].source);
    expect(css.split("width:100%")).toHaveLength(2);
    expect(css.indexOf("width:100%")).toBeLessThan(
      css.indexOf("@media (min-width: 1024px)")
    );
    expect(css.indexOf("@media (min-width: 1024px)")).toBeLessThan(
      css.indexOf("width:248px")
    );

    const lazyChunks = output.filter(
      (item): item is Rollup.OutputChunk =>
        item.type === "chunk" && /route-[ab]-/.test(item.fileName)
    );
    expect(lazyChunks).toHaveLength(2);
    for (const chunk of lazyChunks) {
      expect(chunk.viteMetadata?.importedCss).toEqual(
        new Set([cssAssets[0].fileName])
      );
    }
  });

  it("emits one shared base atom, ahead of the pc rule, for two modules", async () => {
    // Wiring check only: Rollup decides transform order, so this cannot force
    // the hazardous sequence. Ordering itself is pinned by the unit tests in
    // cascadeOrder.test.ts, which control atom order directly.
    const mainId = resolve(root, "__shared_base_fixture__/main.js");
    const qualityId = resolve(root, "__shared_base_fixture__/quality.js");
    const keywordsId = resolve(root, "__shared_base_fixture__/keywords.js");
    const files = new Map([
      [
        mainId,
        `import "./quality.js";
         import "./keywords.js";`,
      ],
      [
        qualityId,
        `import { style, variants } from "som-style";
export const grid = style({
           base: { display: "grid" },
           pc: { gridTemplateColumns: "repeat(4,minmax(0,1fr))" },
         });
         console.log(grid);`,
      ],
      [
        keywordsId,
        `import { style, variants } from "som-style";
export const form = style({
           base: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" },
         });
         console.log(form);`,
      ],
    ]);

    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [fixturePlugin(files), somStyle()],
      build: {
        minify: false,
        write: false,
        rollupOptions: { input: mainId },
      },
    });
    const output = (result as Rollup.RollupOutput).output;
    const css = String(
      output.find(
        (item): item is Rollup.OutputAsset =>
          item.type === "asset" && item.fileName.endsWith(".css")
      )!.source
    );

    // One shared base atom, and it must precede the pc override.
    expect(css.split("repeat(2,minmax(0,1fr))")).toHaveLength(2);
    expect(css.indexOf("repeat(2,minmax(0,1fr))")).toBeLessThan(
      css.indexOf("@media (min-width: 1024px)")
    );
    expect(css.indexOf("@media (min-width: 1024px)")).toBeLessThan(
      css.indexOf("repeat(4,minmax(0,1fr))")
    );
  });

  it("ships every module's atoms, not just those seen when the sheet loaded", async () => {
    // The virtual sheet is imported by the first styled module, so Rollup
    // loads it long before the rest of the graph is transformed. Serving the
    // sheet at load time silently dropped every module transformed after it.
    const COUNT = 8;
    const mainId = resolve(root, "__sheet_completeness_fixture__/main.js");
    const moduleIds = Array.from({ length: COUNT }, (_, i) =>
      resolve(root, `__sheet_completeness_fixture__/mod-${i}.js`)
    );
    // Chained, not flat: sibling imports are all transformed before the
    // virtual sheet loads, which would hide the bug.
    const files = new Map<string, string>([[mainId, `import "./mod-0.js";`]]);
    moduleIds.forEach((id, i) => {
      const next = i + 1 < COUNT ? `import "./mod-${i + 1}.js";\n` : "";
      files.set(
        id,
        `import { style, variants } from "som-style";
${next}export const box = style({ base: { zIndex: ${100 + i} } });
         console.log(box);`
      );
    });

    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [fixturePlugin(files), somStyle()],
      build: {
        minify: false,
        write: false,
        rollupOptions: { input: mainId },
      },
    });
    const output = (result as Rollup.RollupOutput).output;
    const css = String(
      output.find(
        (item): item is Rollup.OutputAsset =>
          item.type === "asset" && item.fileName.endsWith(".css")
      )!.source
    );

    const missing = moduleIds
      .map((_, i) => `z-index:${100 + i}`)
      .filter((decl) => !css.includes(decl));
    expect(missing, `missing from the bundled sheet:\n${css}`).toEqual([]);
    expect(css).not.toContain("__som_style_sheet__");
  });

  it("leaves no placeholder rule behind when CSS is minified", async () => {
    const mainId = resolve(root, "__minified_fixture__/main.js");
    const files = new Map([
      [
        mainId,
        `import { style, variants } from "som-style";
export const box = style({ base: { color: "red" }, pc: { color: "blue" } });
         console.log(box);`,
      ],
    ]);

    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [fixturePlugin(files), somStyle()],
      build: { minify: true, write: false, rollupOptions: { input: mainId } },
    });
    const output = (result as Rollup.RollupOutput).output;
    const css = String(
      output.find(
        (item): item is Rollup.OutputAsset =>
          item.type === "asset" && item.fileName.endsWith(".css")
      )!.source
    );

    expect(css).not.toContain("__som_style_sheet__");
    expect(css).not.toContain("--som-style-sheet");
    expect(css).toContain("color:red");
    expect(css).toContain("color:blue");
  });
});
