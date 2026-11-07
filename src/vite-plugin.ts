import type { Plugin, ViteDevServer, ModuleNode } from "vite";
import { readFileSync } from "node:fs";
import { dirname, normalize, resolve as pathResolve } from "node:path";
import { emitStyle, type EmitAtom, type EmitStyleContext } from "./emitStyle.js";
import { composeAtomCss } from "./composeCss.js";
import {
  analyzeStyleCalls,
  type AnalyzeExtras,
  type StyleHandleBinding,
} from "./staticAnalyze.js";
import {
  loadSomStyleConfig,
  resolveSomStyleConfigPath,
  type LoadedStyleConfig,
} from "./loadConfig.js";
import {
  collectReExports,
  collectStyleImportRefs,
  evalAllExportedStringMaps,
  evalExportedStyleOptions,
} from "./resolveImports.js";
import { expandRecipeConfig, recipeSelectionKey } from "./recipeExpand.js";
import {
  evalExportedThemeHandles,
  transformThemeForBuild,
} from "./themeStatic.js";
import type { ResponsiveStyleOptions } from "./types.js";

const VIRTUAL_PREFIX = "virtual:som-style-css:";
const RESOLVED_PREFIX = "\0" + VIRTUAL_PREFIX;

/**
 * Build-only stand-in for the shared sheet. Rollup calls `load()` for the
 * virtual CSS module as soon as the first styled module imports it — long
 * before the rest of the graph is transformed — so the sheet is still growing
 * at that point. We emit this marker rule instead and swap the finished sheet
 * in from `generateBundle`, once every module has been seen.
 *
 * It has to be a real rule, not a comment: CSS minification runs first and
 * strips comments.
 */
const SHEET_PLACEHOLDER_CLASS = "__som_style_sheet__";
const SHEET_PLACEHOLDER_RULE = `.${SHEET_PLACEHOLDER_CLASS}{--som-style-sheet:1}`;
const SHEET_PLACEHOLDER_RE = new RegExp(
  `\\.${SHEET_PLACEHOLDER_CLASS}\\s*\\{[^}]*\\}`,
  "g"
);

const assetSourceToString = (source: string | Uint8Array): string =>
  typeof source === "string" ? source : new TextDecoder().decode(source);

export type TransformStaticResult = {
  code: string;
  /** Full CSS for this file's styles (tests / fallback). */
  css: string;
  /** Deduped atoms for tests / sheet composition. */
  atoms: EmitAtom[];
};

type ResolveFn = (
  id: string,
  importer?: string
) => Promise<string | { id: string } | null | undefined>;

/**
 * Everything static analysis needs from other project modules: imported
 * option objects, token maps (constant.js, theme.js) and style handles.
 * Every project file read is reported to `watchFile` so edits re-extract.
 */
const loadAnalyzeExtras = async (
  code: string,
  importerId: string,
  resolve: ResolveFn,
  watchFile?: (filePath: string) => void,
  visitingExports: Set<string> = new Set()
): Promise<AnalyzeExtras> => ({
  externalOptions: await loadExternalOptions(code, importerId, resolve),
  tokenMaps: await loadTokenMaps(code, importerId, resolve, watchFile),
  importedHandles: await loadImportedHandles(
    code,
    importerId,
    resolve,
    watchFile,
    visitingExports
  ),
});

const loadExternalOptions = async (
  code: string,
  importerId: string,
  resolve: ResolveFn
): Promise<Map<string, ResponsiveStyleOptions>> => {
  const externalOptions = new Map<string, ResponsiveStyleOptions>();
  for (const ref of collectStyleImportRefs(code)) {
    const importedModule = await readImportedModule(ref.source, importerId, resolve);
    if (!importedModule) continue;
    const options = evalExportedStyleOptions(importedModule.source, ref.imported);
    if (options) externalOptions.set(ref.local, options);
  }
  return externalOptions;
};

/** constant.js string maps (any export name) and theme.js `defineTheme` handles. */
const loadTokenMaps = async (
  code: string,
  importerId: string,
  resolve: ResolveFn,
  watchFile?: (filePath: string) => void
): Promise<Map<string, Record<string, string>>> => {
  const tokenMaps = new Map<string, Record<string, string>>();
  for (const ref of collectStyleImportRefs(code)) {
    const importedModule = await readImportedModule(ref.source, importerId, resolve);
    if (!importedModule) continue;

    const tokenMap =
      evalAllExportedStringMaps(importedModule.source).get(ref.imported) ??
      evalExportedThemeHandles(importedModule.source, ref.imported);
    if (!tokenMap) continue;
    watchFile?.(importedModule.filePath);
    tokenMaps.set(ref.local, tokenMap);
  }
  return tokenMaps;
};

/** Style handles imported from project modules, for cross-file `.extend()`. */
const loadImportedHandles = async (
  code: string,
  importerId: string,
  resolve: ResolveFn,
  watchFile: ((filePath: string) => void) | undefined,
  visitingExports: Set<string>
): Promise<Map<string, StyleHandleBinding>> => {
  const importedHandles = new Map<string, StyleHandleBinding>();
  for (const ref of collectStyleImportRefs(code)) {
    const handle = await resolveExportedHandle(
      ref.source,
      ref.imported,
      importerId,
      resolve,
      watchFile,
      visitingExports
    );
    if (handle) importedHandles.set(ref.local, handle);
  }
  return importedHandles;
};

/**
 * Follows `export { x } from` / `export * from` to the module that declares
 * the handle, then analyzes that module with its own imports.
 */
const resolveExportedHandle = async (
  source: string,
  exportName: string,
  importerId: string,
  resolve: ResolveFn,
  watchFile: ((filePath: string) => void) | undefined,
  visitingExports: Set<string>
): Promise<StyleHandleBinding | null> => {
  const importedModule = await readImportedModule(source, importerId, resolve);
  if (!importedModule) return null;
  const visitKey = `${importedModule.filePath}#${exportName}`;
  if (visitingExports.has(visitKey)) return null;
  visitingExports.add(visitKey);

  const reExportedHandle = await resolveReExportedHandle(
    importedModule,
    exportName,
    resolve,
    watchFile,
    visitingExports
  );
  if (reExportedHandle) return reExportedHandle;
  if (!mayContainSomStyleCalls(importedModule.source)) return null;

  try {
    const moduleExtras = await loadAnalyzeExtras(
      importedModule.source,
      importedModule.filePath,
      resolve,
      watchFile,
      visitingExports
    );
    const { exportedHandles } = analyzeStyleCalls(importedModule.source, moduleExtras);
    const handle = exportedHandles.get(exportName) ?? null;
    if (handle) watchFile?.(importedModule.filePath);
    return handle;
  } catch {
    // A module the parser cannot read holds no handle we could extend.
    return null;
  }
};

const resolveReExportedHandle = async (
  importedModule: ImportedModule,
  exportName: string,
  resolve: ResolveFn,
  watchFile: ((filePath: string) => void) | undefined,
  visitingExports: Set<string>
): Promise<StyleHandleBinding | null> => {
  let reExports: ReturnType<typeof collectReExports>;
  try {
    reExports = collectReExports(importedModule.source);
  } catch {
    return null;
  }

  for (const reExport of reExports) {
    if (reExport.kind === "named" && reExport.exported !== exportName) continue;
    const handle = await resolveExportedHandle(
      reExport.source,
      reExport.kind === "named" ? reExport.imported : exportName,
      importedModule.filePath,
      resolve,
      watchFile,
      visitingExports
    );
    if (handle) {
      watchFile?.(importedModule.filePath);
      return handle;
    }
  }
  return null;
};

type ImportedModule = { filePath: string; source: string };

/** Reads a project module an import points at; packages in node_modules are skipped. */
const readImportedModule = async (
  source: string,
  importerId: string,
  resolve: ResolveFn
): Promise<ImportedModule | null> => {
  // Vite's resolve often misses sibling ./ files at this point, so try the path first.
  if (source.startsWith(".")) {
    const filePath = normalize(pathResolve(dirname(importerId), source));
    const fileSource = readSourceFile(filePath);
    if (fileSource != null) return { filePath, source: fileSource };
  }

  const resolved = await resolve(source, importerId).catch(() => null);
  const resolvedId = typeof resolved === "string" ? resolved : resolved?.id ?? null;
  if (!resolvedId || resolvedId.startsWith("\0")) return null;
  const filePath = normalize(resolvedId.split("?")[0] ?? resolvedId);
  if (filePath.includes("node_modules")) return null;
  const fileSource = readSourceFile(filePath);
  return fileSource == null ? null : { filePath, source: fileSource };
};

const readSourceFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
};

/** Cheap text check before parsing; the analyzer decides what is really som-style. */
const mayContainSomStyleCalls = (code: string): boolean =>
  /\bstyle\s*\(/.test(code) ||
  /\.extend\s*\(/.test(code) ||
  /\bvariants\s*\(/.test(code) ||
  /\brecipe\s*\(/.test(code) ||
  /\bdefineTheme\s*\(/.test(code);

const emitRecipeLookupExpr = (
  classMap: Record<string, string>,
  defaults: Record<string, string>
): string => {
  const fallbackKey = recipeSelectionKey(defaults);
  return `((__p={})=>{const __d=${JSON.stringify(defaults)};const __s={...__d,...__p};const __k=Object.keys(__s).filter((k)=>__s[k]!=null&&__s[k]!=="").sort().map((k)=>k+"="+__s[k]).join("|");const __m=${JSON.stringify(classMap)};return __m[__k]||__m[${JSON.stringify(fallbackKey)}]||Object.values(__m)[0]||"";})`;
};

/** Keep `.className` / string coercion after static extract (bare strings break `.className`). */
const emitStaticHandleExpr = (className: string): string =>
  `Object.assign(Object(${JSON.stringify(className)}),{className:${JSON.stringify(className)}})`;

/**
 * Replaces static style(), variants(), recipe(), and same-file .extend() with
 * class-name strings / maps / lookups; emits CSS. Throws on dynamic args.
 */
export const transformForBuild = (
  code: string,
  fileId: string,
  ctx: EmitStyleContext,
  analyzeExtras: AnalyzeExtras = {}
): TransformStaticResult => {
  const { hits } = analyzeStyleCalls(code, analyzeExtras);
  if (hits.length === 0) {
    return { code, css: "", atoms: [] };
  }

  for (const hit of hits) {
    if (hit.kind === "dynamic") {
      throw new Error(
        `[som-style] ${fileId}: static extraction failed. ${hit.error ?? "Use a static style() / variants() / recipe() / .extend({ ... }) literal."}`.trim()
      );
    }
  }

  let next = code;
  const atomById = new Map<string, EmitAtom>();

  const collectAtoms = (atoms: EmitAtom[]) => {
    for (const atom of atoms) {
      if (!atomById.has(atom.id)) atomById.set(atom.id, atom);
    }
  };

  const staticHits = [...hits].sort((a, b) => b.start - a.start);
  for (const hit of staticHits) {
    if (hit.kind === "variants" && hit.variantMap) {
      const entries: string[] = [];
      for (const [key, options] of Object.entries(hit.variantMap)) {
        const emitted = emitStyle(options, ctx);
        collectAtoms(emitted.atoms);
        entries.push(
          `${JSON.stringify(key)}:${emitStaticHandleExpr(emitted.className)}`
        );
      }
      next =
        next.slice(0, hit.start) +
        `({${entries.join(",")}})` +
        next.slice(hit.end);
      continue;
    }

    if (hit.kind === "recipe" && hit.recipeConfig) {
      const expanded = expandRecipeConfig(hit.recipeConfig);
      const classMap: Record<string, string> = {};
      for (const entry of expanded.entries) {
        const emitted = emitStyle(entry.options, ctx);
        collectAtoms(emitted.atoms);
        classMap[entry.key] = emitted.className;
      }
      next =
        next.slice(0, hit.start) +
        emitRecipeLookupExpr(classMap, expanded.defaults) +
        next.slice(hit.end);
      continue;
    }

    const emitted = emitStyle(hit.options!, ctx);
    collectAtoms(emitted.atoms);
    next =
      next.slice(0, hit.start) +
      emitStaticHandleExpr(emitted.className) +
      next.slice(hit.end);
  }

  // Ordered base → ascending breakpoints; emission order must not decide.
  const css = composeAtomCss([...atomById.values()], {
    cascadeLayers: ctx.cascadeLayers,
  });

  return { code: next, css, atoms: [...atomById.values()] };
};

export { composeAtomCss } from "./composeCss.js";

/** Virtual CSS key for the app-wide atom sheet (one import across modules). */
export const SHARED_CSS_KEY = "__shared__";

export type SharedSheetEntry = {
  atoms: EmitAtom[];
  themeCss?: string;
};

/**
 * Merge per-module atoms/themes into one sheet: themes first, then atoms
 * ordered base → ascending breakpoints. Atoms are deduped across modules, so
 * their first-use position must not decide which breakpoint wins.
 */
export const buildSharedCss = (
  entries: Iterable<SharedSheetEntry>,
  options: { cascadeLayers?: boolean } = {}
): string => {
  const atomMap = new Map<string, EmitAtom>();
  const themes: string[] = [];
  for (const entry of entries) {
    if (entry.themeCss) themes.push(entry.themeCss);
    for (const atom of entry.atoms) {
      if (!atomMap.has(atom.id)) atomMap.set(atom.id, atom);
    }
  }
  return [...themes, composeAtomCss([...atomMap.values()], options)]
    .filter(Boolean)
    .join("\n");
};

export type SomStylePluginOptions = {
  configFile?: string;
};

const toVirtualImport = (key: string) => `${VIRTUAL_PREFIX}${key}.css`;

const toResolvedId = (key: string) => `${RESOLVED_PREFIX}${key}.css`;

const keyFromResolvedId = (resolvedId: string): string | null => {
  if (!resolvedId.startsWith(RESOLVED_PREFIX)) return null;
  let key = resolvedId.slice(RESOLVED_PREFIX.length);
  if (key.endsWith(".css")) key = key.slice(0, -4);
  return key;
};

/** Windows-safe path compare (Vite often uses `/`, Node `normalize` uses `\`). */
const canonPath = (p: string): string =>
  normalize(p.split("?")[0] ?? p)
    .replace(/\\/g, "/")
    .toLowerCase();

const isProjectConstantJs = (file: string): boolean =>
  /\/som-style\/constant\.[cm]?js$/.test(canonPath(file));

const isProjectThemeJs = (file: string): boolean =>
  /\/som-style\/theme\.[cm]?[jt]s$/.test(canonPath(file));

const isProjectConfigJs = (file: string): boolean => {
  const p = canonPath(file);
  return (
    /\/som-style\/config\.[cm]?[jt]s$/.test(p) ||
    /\/som-style\.config\.[cm]?[jt]s$/.test(p)
  );
};

/**
 * Vite plugin: static style extract + one shared virtual CSS sheet.
 * Atoms from every module are merged (deduped) with base rules before @media.
 * Prod path avoids the JS style engine when calls are static.
 *
 * `som-style` resolves to the real `som-style/runtime` file (not a virtual
 * module that re-exports a bare specifier — that can white-screen in the
 * browser when the specifier is left unresolved).
 */
export function somStyle(opts: SomStylePluginOptions = {}): Plugin[] {
  let styleConfig: LoadedStyleConfig = {
    breakpoints: { pc: "1024px" },
    classPrefix: "som",
    breakpoint: "1024px",
    cascadeLayers: false,
  };
  let root = process.cwd();
  let isBuild = false;
  let server: ViteDevServer | undefined;
  const cssByKey = new Map<string, string>();
  /** Per consumer module: atoms + optional theme CSS for the shared sheet. */
  const sheetByConsumer = new Map<string, SharedSheetEntry>();
  /** canon(token file) → canon(consumer module paths) */
  const tokenFileConsumers = new Map<string, Set<string>>();
  /** Dev: the browser already holds a copy of the shared sheet. */
  let sheetServed = false;
  let sheetReloadTimer: ReturnType<typeof setTimeout> | null = null;

  const invalidateVirtualCss = (key: string) => {
    if (!server) return;
    const id = toResolvedId(key);
    const mod = server.moduleGraph.getModuleById(id);
    if (!mod) return;
    server.moduleGraph.invalidateModule(mod);
  };

  /**
   * Dev: modules are transformed on demand, so the sheet can still grow after
   * the browser has fetched it — invalidating alone does not make it re-fetch.
   * Reload once things settle. The graph is warm by then, so the next serve is
   * complete and this does not fire again.
   */
  const scheduleSheetReload = () => {
    if (!server) return;
    if (sheetReloadTimer) clearTimeout(sheetReloadTimer);
    sheetReloadTimer = setTimeout(() => {
      sheetReloadTimer = null;
      sheetServed = false;
      server?.ws.send({ type: "full-reload" });
    }, 100);
  };

  const rebuildSharedSheet = () => {
    const previous = cssByKey.get(SHARED_CSS_KEY);
    const css = buildSharedCss(sheetByConsumer.values(), {
      cascadeLayers: styleConfig.cascadeLayers,
    });
    if (css) cssByKey.set(SHARED_CSS_KEY, css);
    else cssByKey.delete(SHARED_CSS_KEY);
    invalidateVirtualCss(SHARED_CSS_KEY);
    if (sheetServed && previous !== css) scheduleSheetReload();
  };

  const applyExtractedCss = (
    consumerKey: string,
    themeCss: string,
    styleResult: TransformStaticResult
  ): string => {
    const hasAtoms = styleResult.atoms.length > 0;
    const hasTheme = Boolean(themeCss);
    if (hasAtoms || hasTheme) {
      sheetByConsumer.set(consumerKey, {
        atoms: styleResult.atoms,
        themeCss: themeCss || undefined,
      });
    } else {
      sheetByConsumer.delete(consumerKey);
    }
    rebuildSharedSheet();
    if (!hasAtoms && !hasTheme) return styleResult.code;
    return `import "${toVirtualImport(SHARED_CSS_KEY)}";\n${styleResult.code}`;
  };

  const trackTokenConsumer = (tokenFile: string, consumerId: string) => {
    const file = canonPath(tokenFile);
    const consumer = canonPath(consumerId);
    let set = tokenFileConsumers.get(file);
    if (!set) {
      set = new Set();
      tokenFileConsumers.set(file, set);
    }
    set.add(consumer);
  };

  const findGraphModules = (
    devServer: ViteDevServer,
    consumerCanon: string
  ): ModuleNode[] => {
    const out: ModuleNode[] = [];
    for (const mod of devServer.moduleGraph.idToModuleMap.values()) {
      const id = mod.id ? canonPath(mod.id) : "";
      const file = mod.file ? canonPath(mod.file) : "";
      if (id === consumerCanon || file === consumerCanon) out.push(mod);
    }
    return out;
  };

  const collectConsumersForTokenChange = (
    file: string,
    modules: ModuleNode[]
  ): Set<string> => {
    const fileCanon = canonPath(file);
    const consumers = new Set<string>();

    for (const [tokenPath, set] of tokenFileConsumers) {
      if (tokenPath === fileCanon) {
        for (const c of set) consumers.add(c);
      }
    }

    // Path map miss (slash/casing) — still treat project constant.js as hot
    if (consumers.size === 0 && (isProjectConstantJs(file) || isProjectThemeJs(file))) {
      for (const set of tokenFileConsumers.values()) {
        for (const c of set) consumers.add(c);
      }
    }

    for (const mod of modules) {
      for (const importer of mod.importers) {
        if (importer.id) consumers.add(canonPath(importer.id));
        if (importer.file) consumers.add(canonPath(importer.file));
      }
    }

    return consumers;
  };

  /** Re-read tokens + re-extract CSS into cssByKey before full-reload. */
  const reextractConsumer = async (
    consumerCanon: string,
    resolve: ResolveFn
  ): Promise<void> => {
    // Prefer real filesystem path from the module graph
    let filePath: string | null = null;
    if (server) {
      for (const mod of findGraphModules(server, consumerCanon)) {
        if (mod.file) {
          filePath = mod.file;
          break;
        }
      }
    }
    if (!filePath) {
      // consumerCanon is like c:/git/.../main.js
      filePath = consumerCanon;
    }

    let source: string;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    if (!mayContainSomStyleCalls(source)) return;

    const normalizedId = normalize(filePath);
    const themeResult = transformThemeForBuild(source, filePath);
    const analyzeExtras = await loadAnalyzeExtras(
      themeResult.code,
      normalizedId,
      resolve,
      (dependencyFile) => trackTokenConsumer(dependencyFile, normalizedId)
    );
    const styleResult = transformForBuild(
      themeResult.code,
      filePath,
      styleConfig,
      analyzeExtras
    );
    const consumerKey = encodeURIComponent(filePath);
    applyExtractedCss(consumerKey, themeResult.css, styleResult);
  };

  const plugin: Plugin = {
    name: "som-style",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      isBuild = config.command === "build";
    },
    configureServer(devServer) {
      server = devServer;
    },
    async buildStart() {
      const configPath = await resolveSomStyleConfigPath(root, opts.configFile);
      if (configPath) this.addWatchFile(configPath);
      styleConfig = await loadSomStyleConfig(root, opts.configFile);
      cssByKey.clear();
      sheetByConsumer.clear();
      tokenFileConsumers.clear();
      sheetServed = false;
    },
    async handleHotUpdate({ file, modules, server: devServer }) {
      if (isProjectConfigJs(file)) {
        styleConfig = await loadSomStyleConfig(root, opts.configFile);
        cssByKey.clear();
        sheetByConsumer.clear();
        const rootCanon = canonPath(root);
        for (const mod of [...devServer.moduleGraph.idToModuleMap.values()]) {
          const id = mod.id ?? "";
          const modFile = mod.file ?? "";
          const underRoot =
            modFile &&
            canonPath(modFile).startsWith(rootCanon) &&
            !modFile.includes("node_modules");
          if (
            id.includes(VIRTUAL_PREFIX) ||
            id.startsWith(RESOLVED_PREFIX) ||
            underRoot
          ) {
            devServer.moduleGraph.invalidateModule(mod);
          }
        }
        for (const mod of modules) {
          devServer.moduleGraph.invalidateModule(mod);
        }
        devServer.ws.send({ type: "full-reload" });
        return [];
      }

      const fileCanon = canonPath(file);
      const tracked =
        tokenFileConsumers.has(fileCanon) ||
        isProjectConstantJs(file) ||
        isProjectThemeJs(file) ||
        modules.some(
          (m) =>
            (m.file &&
              (isProjectConstantJs(m.file) || isProjectThemeJs(m.file))) ||
            (m.id && (isProjectConstantJs(m.id) || isProjectThemeJs(m.id)))
        );

      if (!tracked) return;

      const consumers = collectConsumersForTokenChange(file, modules);
      const resolve: ResolveFn = async (source, importer) => {
        const result = await devServer.pluginContainer.resolveId(
          source,
          importer
        );
        return result;
      };

      for (const consumer of consumers) {
        await reextractConsumer(consumer, resolve);
        for (const mod of findGraphModules(devServer, consumer)) {
          devServer.moduleGraph.invalidateModule(mod);
        }
      }

      for (const mod of modules) {
        devServer.moduleGraph.invalidateModule(mod);
      }

      // Hashed class names in JS must refresh with CSS.
      devServer.ws.send({ type: "full-reload" });
      return [];
    },
    async resolveId(id, importer, options) {
      if (id === "som-style") {
        return this.resolve("som-style/runtime", importer, {
          skipSelf: true,
          ...options,
        });
      }
      if (id === "som-style/solid") {
        return this.resolve("som-style/solid-runtime", importer, {
          skipSelf: true,
          ...options,
        });
      }
      if (id.startsWith(VIRTUAL_PREFIX) && id.endsWith(".css")) {
        return RESOLVED_PREFIX + id.slice(VIRTUAL_PREFIX.length);
      }
      return null;
    },
    load(id) {
      const key = keyFromResolvedId(id);
      if (key === null) return null;
      // See SHEET_PLACEHOLDER_RULE — during build the sheet is incomplete here.
      if (isBuild && key === SHARED_CSS_KEY) return SHEET_PLACEHOLDER_RULE;
      if (key === SHARED_CSS_KEY) sheetServed = true;
      return cssByKey.get(key) ?? "";
    },
    async transform(code, id) {
      const normalizedId = normalize(id.split("?")[0] ?? id);
      const normalizedRoot = normalize(root);
      if (!normalizedId.startsWith(normalizedRoot)) return null;
      if (
        !/\.[cm]?[jt]sx?$/.test(normalizedId) ||
        normalizedId.includes("node_modules")
      ) {
        return null;
      }
      if (!mayContainSomStyleCalls(code)) return null;

      try {
        const resolve: ResolveFn = async (source, importer) => {
          const result = await this.resolve(source, importer, {
            skipSelf: true,
          });
          return result;
        };
        const themeResult = transformThemeForBuild(code, id);
        const analyzeExtras = await loadAnalyzeExtras(
          themeResult.code,
          normalizedId,
          resolve,
          (dependencyFile) => {
            this.addWatchFile(dependencyFile);
            trackTokenConsumer(dependencyFile, normalizedId);
          }
        );
        const styleResult = transformForBuild(
          themeResult.code,
          id,
          styleConfig,
          analyzeExtras
        );
        const consumerKey = encodeURIComponent(id);
        const out = applyExtractedCss(
          consumerKey,
          themeResult.css,
          styleResult
        );
        if (
          out === styleResult.code &&
          !themeResult.css &&
          styleResult.atoms.length === 0
        ) {
          return { code: styleResult.code, map: null };
        }
        return { code: out, map: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.error(message);
        return null;
      }
    },
  };

  /**
   * Runs after Vite has emitted (and minified) the CSS assets, so the sheet
   * we drop in is the complete one. Without this the bundle keeps only the
   * atoms that existed when the virtual module was first loaded.
   */
  const sheetPlugin: Plugin = {
    name: "som-style:sheet",
    enforce: "post",
    apply: "build",
    generateBundle(_options, bundle) {
      const css = cssByKey.get(SHARED_CSS_KEY) ?? "";
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
        const source = assetSourceToString(file.source);
        if (!source.includes(SHEET_PLACEHOLDER_CLASS)) continue;
        file.source = source.replace(SHEET_PLACEHOLDER_RE, () => css);
      }
    },
  };

  return [plugin, sheetPlugin];
}

export default somStyle;
