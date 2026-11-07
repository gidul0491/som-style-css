/**
 * Checks what the browser actually applies, not just the CSS text we emit.
 * Every scenario runs twice: once with the sheet the Vite build would ship,
 * once with the runtime injecting rules through style() in the page.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { emitStyle, type EmitStyleContext } from "../../src/emitStyle.js";
import { buildSharedCss } from "../../src/vite-plugin.js";
import type { ResponsiveStyleOptions } from "../../src/types.js";

const repoRoot = join(import.meta.dirname, "..", "..");
const PAGE_ORIGIN = "http://som-style.test";

const styleContext: EmitStyleContext = {
  breakpoints: { sm: "640px", pc: "1024px" },
  classPrefix: "som",
  breakpoint: "1024px",
};

type SheetSource = "build" | "runtime";

type Scenario = {
  /** Style modules in the order a bundle would evaluate them. */
  modules: ResponsiveStyleOptions[];
  /** Page body; `{0}`, `{1}` … become the class names of `modules`. */
  bodyHtml: string;
  viewportWidth?: number;
  cascadeLayers?: boolean;
};

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe.each<SheetSource>(["build", "runtime"])("in the browser (%s sheet)", (sheetSource) => {
  it("lets a longhand beat its shorthand whichever module came first", async () => {
    const page = await openScenario(sheetSource, {
      modules: [
        { base: { paddingTop: "8px", borderTopColor: "rgb(255, 0, 0)" } },
        {
          base: {
            padding: 0,
            paddingTop: "8px",
            border: "1px solid rgb(0, 0, 255)",
            borderTopColor: "rgb(255, 0, 0)",
          },
        },
      ],
      bodyHtml: `<div id="card" class="{1}"></div>`,
    });

    expect(await computedStyle(page, "#card", "padding-top")).toBe("8px");
    expect(await computedStyle(page, "#card", "padding-left")).toBe("0px");
    expect(await computedStyle(page, "#card", "border-top-color")).toBe("rgb(255, 0, 0)");
    expect(await computedStyle(page, "#card", "border-left-color")).toBe("rgb(0, 0, 255)");
  });

  it.each([
    { viewportWidth: 400, expected: "column" },
    { viewportWidth: 800, expected: "row-reverse" },
    { viewportWidth: 1200, expected: "row" },
  ])(
    "applies base, then breakpoints by width at $viewportWidth px",
    async ({ viewportWidth, expected }) => {
      const page = await openScenario(sheetSource, {
        modules: [
          { base: { display: "flex" }, pc: { flexDirection: "row" } },
          {
            base: { display: "flex", flexDirection: "column" },
            sm: { flexDirection: "row-reverse" },
            pc: { flexDirection: "row" },
          },
        ],
        bodyHtml: `<div id="box" class="{1}"></div>`,
        viewportWidth,
      });

      expect(await computedStyle(page, "#box", "flex-direction")).toBe(expected);
    }
  );

  it("keeps the breakpoint order with cascade layers on", async () => {
    const page = await openScenario(sheetSource, {
      modules: [
        { base: { display: "flex" }, pc: { flexDirection: "row" } },
        { base: { display: "flex", flexDirection: "column" }, pc: { flexDirection: "row" } },
      ],
      bodyHtml: `<div id="box" class="{1}"></div>`,
      viewportWidth: 1200,
      cascadeLayers: true,
    });

    expect(await computedStyle(page, "#box", "flex-direction")).toBe("row");
  });

  it("scopes every selector of a comma list to the class", async () => {
    const page = await openScenario(sheetSource, {
      modules: [{ base: { "& a, & button": { color: "rgb(255, 0, 0)" } } }],
      bodyHtml: `
        <div class="{0}"><a id="inside-link">a</a><button id="inside-button">b</button></div>
        <button id="outside-button">c</button>`,
    });

    expect(await computedStyle(page, "#inside-link", "color")).toBe("rgb(255, 0, 0)");
    expect(await computedStyle(page, "#inside-button", "color")).toBe("rgb(255, 0, 0)");
    expect(await computedStyle(page, "#outside-button", "color")).not.toBe("rgb(255, 0, 0)");
  });

  it("keeps the parent condition on a nested selector", async () => {
    const page = await openScenario(sheetSource, {
      modules: [{ base: { "&:hover": { "& span": { color: "rgb(255, 0, 0)" } } } }],
      bodyHtml: `<div id="row" class="{0}" style="padding:20px"><span id="label">x</span></div>`,
    });

    expect(await computedStyle(page, "#label", "color")).not.toBe("rgb(255, 0, 0)");
    await page.hover("#row");
    expect(await computedStyle(page, "#label", "color")).toBe("rgb(255, 0, 0)");
  });

  it("applies at-rule keys to the current selector", async () => {
    const page = await openScenario(sheetSource, {
      modules: [
        {
          base: {
            "@media (min-width: 1px)": { color: "rgb(255, 0, 0)" },
            "@supports (display: grid)": { display: "grid" },
            "@media (max-width: 1px)": { opacity: 0.5 },
          },
        },
      ],
      bodyHtml: `<div id="box" class="{0}"></div>`,
    });

    expect(await computedStyle(page, "#box", "color")).toBe("rgb(255, 0, 0)");
    expect(await computedStyle(page, "#box", "display")).toBe("grid");
    expect(await computedStyle(page, "#box", "opacity")).toBe("1");
  });

  it("lets a nested rule beat a flat declaration in the same bucket", async () => {
    const page = await openScenario(sheetSource, {
      modules: [
        { base: { "&.active": { color: "rgb(255, 0, 0)" } } },
        { base: { color: "rgb(0, 0, 255)", "&.active": { color: "rgb(255, 0, 0)" } } },
      ],
      bodyHtml: `<div id="tab" class="{1} active"></div>`,
    });

    expect(await computedStyle(page, "#tab", "color")).toBe("rgb(255, 0, 0)");
  });
});

/** Opens a fresh page whose sheet comes from the build output or the runtime. */
const openScenario = async (sheetSource: SheetSource, scenario: Scenario) => {
  const runContext = { ...styleContext, cascadeLayers: scenario.cascadeLayers };
  const classNames = scenario.modules.map(
    (moduleStyle) => emitStyle(moduleStyle, runContext).className
  );
  const bodyHtml = scenario.bodyHtml.replace(
    /\{(\d+)\}/g,
    (_, moduleIndex) => classNames[Number(moduleIndex)]
  );

  const page = await browser.newPage({
    viewport: { width: scenario.viewportWidth ?? 1200, height: 800 },
  });
  await serveRepoFiles(page);

  const headHtml =
    sheetSource === "build"
      ? `<style>${buildSheet(scenario.modules, runContext)}</style>`
      : runtimeScript(scenario.modules, runContext);
  await page.goto(`${PAGE_ORIGIN}/scenario.html`);
  await page.setContent(
    `<!doctype html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`
  );
  if (sheetSource === "runtime") await page.waitForFunction(() => "somStyleReady" in window);
  return page;
};

const buildSheet = (modules: ResponsiveStyleOptions[], runContext: EmitStyleContext) =>
  buildSharedCss(
    modules.map((moduleStyle) => ({
      atoms: emitStyle(moduleStyle, runContext).atoms,
    })),
    { cascadeLayers: runContext.cascadeLayers }
  );

const runtimeScript = (modules: ResponsiveStyleOptions[], runContext: EmitStyleContext) => `
  <script type="module">
    import { configure, style } from "${PAGE_ORIGIN}/dist/index.js";
    configure({
      isServer: () => false,
      breakpoints: ${JSON.stringify(runContext.breakpoints)},
      cascadeLayers: ${Boolean(runContext.cascadeLayers)},
    });
    for (const moduleStyle of ${JSON.stringify(modules)}) style(moduleStyle);
    window.somStyleReady = true;
  </script>`;

/** Serves the built `dist/` so the page can import the real runtime. */
const serveRepoFiles = (page: Page) =>
  page.route(`${PAGE_ORIGIN}/**`, async (route) => {
    const requestPath = new URL(route.request().url()).pathname;
    if (!requestPath.startsWith("/dist/")) {
      return route.fulfill({ contentType: "text/html", body: "" });
    }
    const body = await readFile(join(repoRoot, requestPath));
    return route.fulfill({ contentType: "text/javascript", body });
  });

const computedStyle = (page: Page, selector: string, property: string) =>
  page.$eval(
    selector,
    (element, cssProperty) => getComputedStyle(element).getPropertyValue(cssProperty),
    property
  );
