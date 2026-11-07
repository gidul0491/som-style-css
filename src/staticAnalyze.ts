import { parse } from "@babel/parser";
import type {
  CallExpression,
  Expression,
  Node,
  ObjectExpression,
  VariableDeclaration,
  VariableDeclarator,
} from "@babel/types";
import { mergeResponsiveOptions } from "./extendStyle.js";
import { evalRecipeConfigNode } from "./recipeStatic.js";
import type { RecipeConfig } from "./recipeExpand.js";
import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

export type AnalyzeHit = {
  start: number;
  end: number;
  kind: "static" | "dynamic" | "variants" | "recipe";
  options?: ResponsiveStyleOptions;
  /** Present when kind === "variants" */
  variantMap?: Record<string, ResponsiveStyleOptions>;
  /** Present when kind === "recipe" */
  recipeConfig?: RecipeConfig;
  error?: string;
};

export type AnalyzeExtras = {
  /** Local name → options resolved from another module's exported object literal */
  externalOptions?: Map<string, ResponsiveStyleOptions>;
  /**
   * Local binding → token map (project constant.js exports, theme.js handles,
   * same-file const). Values are used as-is for static extract.
   */
  tokenMaps?: Map<string, Record<string, string>>;
  /** Local name → style handle exported by another project module. */
  importedHandles?: Map<string, StyleHandleBinding>;
};

/** A som-style handle a module declares: its options, or why they are not static. */
export type StyleHandleBinding =
  | { ok: true; options: ResponsiveStyleOptions }
  | { ok: false; error: string };

export type StyleModuleAnalysis = {
  hits: AnalyzeHit[];
  /** Exported name → handle, so other modules can statically `.extend()` it. */
  exportedHandles: Map<string, StyleHandleBinding>;
};

/** Active during analyzeStyleCalls — any constant.js export name resolves here first. */
let activeTokenMaps: Map<string, Record<string, string>> = new Map();
/** Active during analyzeStyleCalls — same-file `const gap = "8px"` literals. */
let activeConstValues: Map<string, string | number> = new Map();

const SOM_STYLE_SOURCE = /^som-style(\/(solid|runtime|solid-runtime))?$/;

type SomStyleFunction = "style" | "variants" | "recipe";

/** Local names bound to som-style's own functions, so look-alikes are left alone. */
type SomStyleImports = {
  localNames: Map<string, SomStyleFunction>;
  namespaces: Set<string>;
};

const collectSomStyleImports = (ast: Node): SomStyleImports => {
  const somStyleImports: SomStyleImports = {
    localNames: new Map(),
    namespaces: new Set(),
  };
  walk(ast, (node) => {
    if (node.type !== "ImportDeclaration") return;
    if (!SOM_STYLE_SOURCE.test(node.source.value)) return;
    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        somStyleImports.namespaces.add(specifier.local.name);
        continue;
      }
      if (specifier.type !== "ImportSpecifier") continue;
      const importedName =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported.value;
      if (isSomStyleFunction(importedName)) {
        somStyleImports.localNames.set(specifier.local.name, importedName);
      }
    }
  });
  return somStyleImports;
};

const isSomStyleFunction = (name: string): name is SomStyleFunction =>
  name === "style" || name === "variants" || name === "recipe";

/** `style(…)`, `css(…)` from `import { style as css }`, or `som.style(…)`. */
const somStyleFunctionOf = (
  callee: CallExpression["callee"],
  somStyleImports: SomStyleImports
): SomStyleFunction | null => {
  if (callee.type === "Identifier") {
    return somStyleImports.localNames.get(callee.name) ?? null;
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    somStyleImports.namespaces.has(callee.object.name) &&
    callee.property.type === "Identifier" &&
    isSomStyleFunction(callee.property.name)
  ) {
    return callee.property.name;
  }
  return null;
};

const isExtendCallee = (
  node: CallExpression["callee"]
): node is CallExpression["callee"] & {
  type: "MemberExpression";
  object: Expression;
  property: { type: "Identifier"; name: "extend" };
} => {
  if (node.type !== "MemberExpression" || node.computed) return false;
  return (
    node.property.type === "Identifier" && node.property.name === "extend"
  );
};

export const evalLiteral = (
  node: Expression
): string | number | boolean | null | undefined => {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "NumericLiteral") return node.value;
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "NumericLiteral"
  ) {
    return -node.argument.value;
  }
  if (node.type === "BooleanLiteral") return node.value;
  if (node.type === "NullLiteral") return null;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? "").join("");
  }
  return undefined;
};

/**
 * Resolve foo.bar to a CSS value.
 * 1) tokenMaps / constant.js
 * 2) theme.* → var(--som-theme-*)
 */
const camelToKebabCss = (str: string) =>
  str.replace(/([A-Z])/g, "-$1").toLowerCase();

const memberPropName = (node: Expression): string | undefined => {
  if (node.type !== "MemberExpression") return undefined;
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (node.computed && node.property.type === "StringLiteral") {
    return node.property.value;
  }
  if (node.computed && node.property.type === "NumericLiteral") {
    return String(node.property.value);
  }
  return undefined;
};

const tokenMemberToCssVar = (group: string, prop: string): string | undefined => {
  const tokenMap = activeTokenMaps.get(group);
  if (tokenMap) return tokenMap[prop];

  if (group === "theme") {
    return `var(--som-theme-${camelToKebabCss(prop)})`;
  }

  return undefined;
};

/** `theme.primry` when theme.js has no `primry`: name it instead of a generic error. */
const findUndefinedToken = (node: Node): string | undefined => {
  let undefinedToken: string | undefined;
  walk(node, (child) => {
    if (undefinedToken || child.type !== "MemberExpression") return;
    if (child.object.type !== "Identifier") return;
    const tokenMap = activeTokenMaps.get(child.object.name);
    const prop = memberPropName(child as Expression);
    if (tokenMap && prop && tokenMap[prop] == null) {
      undefinedToken = `${child.object.name}.${prop}`;
    }
  });
  return undefinedToken;
};

const evalTokenMember = (node: Expression): string | undefined => {
  if (node.type !== "MemberExpression") return undefined;
  if (node.object.type !== "Identifier") return undefined;
  const prop = memberPropName(node);
  if (!prop) return undefined;
  return tokenMemberToCssVar(node.object.name, prop);
};

/**
 * Values safe for Vite static extract: literals, design tokens, and
 * template strings that only interpolate those.
 */
const evalStaticValue = (
  node: Expression
): string | number | boolean | null | undefined => {
  const lit = evalLiteral(node);
  if (lit !== undefined) return lit;

  if (node.type === "Identifier" && activeConstValues.has(node.name)) {
    return activeConstValues.get(node.name);
  }

  const token = evalTokenMember(node);
  if (token !== undefined) return token;

  if (node.type === "TemplateLiteral") {
    let out = "";
    for (let i = 0; i < node.quasis.length; i++) {
      out += node.quasis[i]?.value.cooked ?? "";
      const expr = node.expressions[i];
      if (!expr) continue;
      const part = evalStaticValue(expr as Expression);
      if (typeof part !== "string" && typeof part !== "number") {
        return undefined;
      }
      out += String(part);
    }
    return out;
  }

  return undefined;
};

const evalStyleObject = (
  node: ObjectExpression
): { ok: true; value: StyleObject } | { ok: false; error: string } => {
  const out: Record<string, string | number | StyleObject> = {};

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return {
        ok: false,
        error: "SpreadElement is not allowed in static style options",
      };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return {
        ok: false,
        error: "Only static object properties are allowed in style options",
      };
    }

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
    else {
      return {
        ok: false,
        error: "Unsupported property key in style options",
      };
    }

    const valueNode = prop.value;
    if (valueNode.type === "ObjectExpression") {
      const nested = evalStyleObject(valueNode);
      if (!nested.ok) return nested;
      out[key] = nested.value;
      continue;
    }

    const lit = evalStaticValue(valueNode as Expression);
    if (lit === undefined) {
      const undefinedToken = findUndefinedToken(valueNode);
      return {
        ok: false,
        error: undefinedToken
          ? `"${undefinedToken}" is not defined (used for "${key}")`
          : `Dynamic value for "${key}" is not allowed in static style options`,
      };
    }
    if (lit === null) continue;
    out[key] = lit as string | number | StyleObject;
  }

  return { ok: true, value: out as StyleObject };
};

const walk = (node: Node, visit: (n: Node) => void) => {
  visit(node);
  for (const key of Object.keys(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "leadingComments" ||
      key === "innerComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    const child = (node as unknown as Record<string, unknown>)[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in (item as object)) {
          walk(item as Node, visit);
        }
      }
    } else if (typeof child === "object" && "type" in (child as object)) {
      walk(child as Node, visit);
    }
  }
};

const collectConstObjectBindings = (
  ast: Node
): Map<string, ObjectExpression> => {
  const bindings = new Map<string, ObjectExpression>();

  walk(ast, (node) => {
    if (node.type !== "VariableDeclaration") return;
    const decl = node as VariableDeclaration;
    if (decl.kind !== "const") return;

    for (const d of decl.declarations as VariableDeclarator[]) {
      if (d.id.type !== "Identifier") continue;
      if (!d.init || d.init.type !== "ObjectExpression") continue;
      bindings.set(d.id.name, d.init);
    }
  });

  return bindings;
};

/** `const gap = "8px"` / `const offset = -1` so `{ gap }` stays static. */
const collectConstLiteralBindings = (
  ast: Node
): Map<string, string | number> => {
  const bindings = new Map<string, string | number>();
  walk(ast, (node) => {
    if (node.type !== "VariableDeclaration") return;
    const declaration = node as VariableDeclaration;
    if (declaration.kind !== "const") return;
    for (const declarator of declaration.declarations as VariableDeclarator[]) {
      if (declarator.id.type !== "Identifier" || !declarator.init) continue;
      const literal = evalLiteral(declarator.init as Expression);
      if (typeof literal === "string" || typeof literal === "number") {
        bindings.set(declarator.id.name, literal);
      }
    }
  });
  return bindings;
};

const resolveOptionsArg = (
  arg: Expression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
):
  | { ok: true; node: ObjectExpression }
  | { ok: true; options: ResponsiveStyleOptions }
  | { ok: false; error: string } => {
  if (arg.type === "ObjectExpression") {
    return { ok: true, node: arg };
  }

  if (arg.type === "Identifier") {
    const bound = constObjects.get(arg.name);
    if (bound) {
      return { ok: true, node: bound };
    }
    const external = externalOptions?.get(arg.name);
    if (external) {
      return { ok: true, options: external };
    }
    return {
      ok: false,
      error: `Unknown or non-literal style object "${arg.name}". Use an inline object, a same-file const, or an imported exported object literal.`,
    };
  }

  return {
    ok: false,
    error:
      "style() / .extend() argument must be a static object literal, same-file const, or imported exported object when using the Vite plugin",
  };
};

const evalOptionsFromArg = (
  arg: Expression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
):
  | { ok: true; options: ResponsiveStyleOptions }
  | { ok: false; error: string } => {
  const resolved = resolveOptionsArg(arg, constObjects, externalOptions);
  if (!resolved.ok) return resolved;
  if ("options" in resolved) return { ok: true, options: resolved.options };

  const evaluated = evalStyleObject(resolved.node);
  if (!evaluated.ok) return evaluated;

  const options = evaluated.value as ResponsiveStyleOptions;
  if (!options.base || typeof options.base !== "object") {
    return {
      ok: false,
      error: 'static options must include a "base" object',
    };
  }
  return { ok: true, options };
};

const analyzeVariantsCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "variants() requires a static object map",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static variants()",
    };
  }

  const resolved = resolveOptionsArg(arg, constObjects, externalOptions);
  if (!resolved.ok) {
    return { start, end, kind: "dynamic", error: resolved.error };
  }
  if (!("node" in resolved)) {
    return {
      start,
      end,
      kind: "dynamic",
      error:
        "variants() map must be an object literal or same-file const (not a style-options import)",
    };
  }

  const variantMap: Record<string, ResponsiveStyleOptions> = {};

  for (const prop of resolved.node.properties) {
    if (prop.type === "SpreadElement") {
      return {
        start,
        end,
        kind: "dynamic",
        error: "SpreadElement is not allowed in static variants()",
      };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return {
        start,
        end,
        kind: "dynamic",
        error: "variants() keys must be static identifiers or string literals",
      };
    }

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else {
      return {
        start,
        end,
        kind: "dynamic",
        error: "Unsupported variants() key",
      };
    }

    if (
      prop.value.type !== "ObjectExpression" &&
      prop.value.type !== "Identifier"
    ) {
      return {
        start,
        end,
        kind: "dynamic",
        error: `variants()["${key}"] must be a static style options object`,
      };
    }

    const evaluated = evalOptionsFromArg(
      prop.value,
      constObjects,
      externalOptions
    );
    if (!evaluated.ok) {
      return { start, end, kind: "dynamic", error: evaluated.error };
    }
    variantMap[key] = evaluated.options;
  }

  return { start, end, kind: "variants", variantMap };
};

const analyzeRecipeCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "recipe() requires a static config object",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static recipe()",
    };
  }

  let node: ObjectExpression | null = null;
  if (arg.type === "ObjectExpression") node = arg;
  else if (arg.type === "Identifier") {
    node = constObjects.get(arg.name) ?? null;
  }

  if (!node) {
    return {
      start,
      end,
      kind: "dynamic",
      error:
        "recipe() config must be an inline object or same-file const object literal",
    };
  }

  const evaluated = evalRecipeConfigNode(node);
  if (!evaluated.ok) {
    return { start, end, kind: "dynamic", error: evaluated.error };
  }
  return { start, end, kind: "recipe", recipeConfig: evaluated.config };
};

const analyzeStyleCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const arg = call.arguments[0];

  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: "style() requires a static object literal argument",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static style()",
    };
  }

  const evaluated = evalOptionsFromArg(arg, constObjects, externalOptions);
  if (!evaluated.ok) {
    return { start, end, kind: "dynamic", error: evaluated.error };
  }
  return { start, end, kind: "static", options: evaluated.options };
};

/**
 * `.extend()` on a som-style handle: one declared in this file or imported
 * from another project module. Anything else (zod schemas, `dayjs.extend`)
 * is not ours and returns null.
 */
const analyzeExtendCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  handleBindings: Map<string, StyleHandleBinding>,
  somStyleImports: SomStyleImports,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit | null => {
  const start = call.start ?? 0;
  const end = call.end ?? start;
  const callee = call.callee;
  if (!isExtendCallee(callee)) return null;

  if (callee.object.type !== "Identifier") {
    if (!isSomStyleHandleExpression(callee.object, somStyleImports)) return null;
    return {
      start,
      end,
      kind: "dynamic",
      error:
        ".extend() base must be a const style handle, not an inline call. Assign the handle to a const first.",
    };
  }

  const baseHandle = handleBindings.get(callee.object.name);
  if (!baseHandle) return null;
  if (!baseHandle.ok) {
    return {
      start,
      end,
      kind: "dynamic",
      error: `.extend() base "${callee.object.name}" is not static: ${baseHandle.error}`,
    };
  }

  const arg = call.arguments[0];
  if (!arg) {
    return {
      start,
      end,
      kind: "dynamic",
      error: ".extend() requires a static object literal argument",
    };
  }
  if (arg.type === "SpreadElement" || arg.type === "ArgumentPlaceholder") {
    return {
      start,
      end,
      kind: "dynamic",
      error: "Spread arguments are not allowed in static .extend()",
    };
  }

  const patchEval = evalOptionsFromArg(arg, constObjects, externalOptions);
  if (!patchEval.ok) {
    return {
      start,
      end,
      kind: "dynamic",
      error: patchEval.error,
    };
  }

  const options = mergeResponsiveOptions(baseHandle.options, patchEval.options);
  return { start, end, kind: "static", options };
};

/** `style({…}).extend(…)` or `handle.extend({…}).extend(…)`. */
const isSomStyleHandleExpression = (
  node: Expression,
  somStyleImports: SomStyleImports
): boolean =>
  node.type === "CallExpression" &&
  (somStyleFunctionOf(node.callee, somStyleImports) === "style" ||
    (isExtendCallee(node.callee) &&
      isSomStyleHandleExpression(node.callee.object, somStyleImports)));

const collectConstStringMaps = (
  constObjects: Map<string, ObjectExpression>
): Map<string, Record<string, string>> => {
  const out = new Map<string, Record<string, string>>();
  for (const [name, node] of constObjects) {
    const map: Record<string, string> = {};
    let ok = true;
    for (const prop of node.properties) {
      if (prop.type === "SpreadElement" || prop.type !== "ObjectProperty" || prop.computed) {
        ok = false;
        break;
      }
      const keyNode = prop.key;
      let key: string;
      if (keyNode.type === "Identifier") key = keyNode.name;
      else if (keyNode.type === "StringLiteral") key = keyNode.value;
      else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
      else {
        ok = false;
        break;
      }
      const lit = evalLiteral(prop.value as Expression);
      if (typeof lit !== "string" && typeof lit !== "number") {
        ok = false;
        break;
      }
      map[key] = String(lit);
    }
    if (ok && Object.keys(map).length > 0) out.set(name, map);
  }
  return out;
};

/**
 * Finds som-style's style(), variants(), recipe() and `.extend()` calls on
 * som-style handles, and which handles the module exports.
 */
export const analyzeStyleCalls = (
  code: string,
  extras: AnalyzeExtras = {}
): StyleModuleAnalysis => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const somStyleImports = collectSomStyleImports(ast);
  const constObjects = collectConstObjectBindings(ast);
  const handleBindings = new Map<string, StyleHandleBinding>(
    extras.importedHandles ?? []
  );
  const tokenMaps = new Map<string, Record<string, string>>([
    ...collectConstStringMaps(constObjects),
    ...(extras.tokenMaps ?? []),
  ]);
  const previousTokenMaps = activeTokenMaps;
  const previousConstValues = activeConstValues;
  activeTokenMaps = tokenMaps;
  activeConstValues = collectConstLiteralBindings(ast);

  try {
    const hits = collectHits(
      ast,
      constObjects,
      handleBindings,
      somStyleImports,
      extras.externalOptions
    );
    const exportedHandles = collectExportedHandles(ast, handleBindings);
    return { hits, exportedHandles };
  } finally {
    activeTokenMaps = previousTokenMaps;
    activeConstValues = previousConstValues;
  }
};

/**
 * Const declarations first, in source order, so a later `.extend()` sees the
 * handle it builds on; then every remaining call (inline expressions).
 */
const collectHits = (
  ast: Node,
  constObjects: Map<string, ObjectExpression>,
  handleBindings: Map<string, StyleHandleBinding>,
  somStyleImports: SomStyleImports,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit[] => {
  const hits: AnalyzeHit[] = [];
  const seenCalls = new Set<string>();

  const analyzeCall = (call: CallExpression): AnalyzeHit | null => {
    const callKey = `${call.start ?? 0}:${call.end ?? 0}`;
    if (seenCalls.has(callKey)) return null;

    const hit = analyzeSomStyleCall(
      call,
      constObjects,
      handleBindings,
      somStyleImports,
      externalOptions
    );
    if (!hit) return null;
    seenCalls.add(callKey);
    hits.push(hit);
    return hit;
  };

  walk(ast, (node) => {
    if (node.type !== "VariableDeclaration") return;
    const declaration = node as VariableDeclaration;
    if (declaration.kind !== "const") return;

    for (const declarator of declaration.declarations as VariableDeclarator[]) {
      if (declarator.id.type !== "Identifier") continue;
      if (declarator.init?.type !== "CallExpression") continue;
      const hit = analyzeCall(declarator.init);
      if (hit && (hit.kind === "static" || hit.kind === "dynamic")) {
        handleBindings.set(
          declarator.id.name,
          hit.kind === "static"
            ? { ok: true, options: hit.options! }
            : { ok: false, error: hit.error ?? "dynamic style options" }
        );
      }
    }
  });

  walk(ast, (node) => {
    if (node.type === "CallExpression") analyzeCall(node as CallExpression);
  });

  return hits;
};

const analyzeSomStyleCall = (
  call: CallExpression,
  constObjects: Map<string, ObjectExpression>,
  handleBindings: Map<string, StyleHandleBinding>,
  somStyleImports: SomStyleImports,
  externalOptions?: Map<string, ResponsiveStyleOptions>
): AnalyzeHit | null => {
  switch (somStyleFunctionOf(call.callee, somStyleImports)) {
    case "style":
      return analyzeStyleCall(call, constObjects, externalOptions);
    case "variants":
      return analyzeVariantsCall(call, constObjects, externalOptions);
    case "recipe":
      return analyzeRecipeCall(call, constObjects);
    default:
      return analyzeExtendCall(
        call,
        constObjects,
        handleBindings,
        somStyleImports,
        externalOptions
      );
  }
};

/** `export const button = style(…)` and `export { button as primaryButton }`. */
const collectExportedHandles = (
  ast: Node,
  handleBindings: Map<string, StyleHandleBinding>
): Map<string, StyleHandleBinding> => {
  const exportedHandles = new Map<string, StyleHandleBinding>();
  walk(ast, (node) => {
    if (node.type !== "ExportNamedDeclaration" || node.source) return;
    if (node.declaration?.type === "VariableDeclaration") {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id.type !== "Identifier") continue;
        const binding = handleBindings.get(declarator.id.name);
        if (binding) exportedHandles.set(declarator.id.name, binding);
      }
      return;
    }
    for (const specifier of node.specifiers) {
      if (specifier.type !== "ExportSpecifier") continue;
      const binding = handleBindings.get(specifier.local.name);
      const exportedName =
        specifier.exported.type === "Identifier"
          ? specifier.exported.name
          : specifier.exported.value;
      if (binding) exportedHandles.set(exportedName, binding);
    }
  });
  return exportedHandles;
};
