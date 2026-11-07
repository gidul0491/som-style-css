import { parse } from "@babel/parser";
import type {
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  Node,
  ObjectExpression,
  VariableDeclaration,
  VariableDeclarator,
} from "@babel/types";
import { evalLiteral } from "./staticAnalyze.js";
import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

const evalStyleObject = (
  node: ObjectExpression
): { ok: true; value: StyleObject } | { ok: false; error: string } => {
  const out: Record<string, string | number | StyleObject> = {};

  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      return { ok: false, error: "SpreadElement is not allowed" };
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return { ok: false, error: "Only static object properties are allowed" };
    }

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
    else return { ok: false, error: "Unsupported property key" };

    const valueNode = prop.value;
    if (valueNode.type === "ObjectExpression") {
      const nested = evalStyleObject(valueNode);
      if (!nested.ok) return nested;
      out[key] = nested.value;
      continue;
    }

    const lit = evalLiteral(valueNode as Expression);
    if (lit === undefined) return { ok: false, error: `Dynamic value for "${key}"` };
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

const optionsFromObject = (
  node: ObjectExpression
): ResponsiveStyleOptions | null => {
  const evaluated = evalStyleObject(node);
  if (!evaluated.ok) return null;
  const options = evaluated.value as ResponsiveStyleOptions;
  if (!options.base || typeof options.base !== "object") return null;
  return options;
};

export type StyleImportRef = {
  local: string;
  imported: string;
  source: string;
};

/**
 * Named imports that may hold style options, tokens or handles. Bare package
 * names are kept too, because path aliases (`@/som-style/components`) look
 * the same; the caller resolves them and skips anything in node_modules.
 */
export const collectStyleImportRefs = (code: string): StyleImportRef[] => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const refs: StyleImportRef[] = [];

  walk(ast, (node) => {
    if (node.type !== "ImportDeclaration") return;
    const source = node.source.value;
    if (/^som-style(\/|$)/.test(source)) return;

    for (const spec of node.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      if (spec.imported.type !== "Identifier") continue;
      refs.push({
        local: spec.local.name,
        imported: spec.imported.name,
        source,
      });
    }
  });

  return refs;
};

/**
 * Object literal whose values are all static string/number literals → string map.
 */
export const evalObjectStringMap = (
  node: ObjectExpression
): Record<string, string> | null => {
  const out: Record<string, string> = {};
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") return null;
    if (prop.type !== "ObjectProperty" || prop.computed) return null;

    const keyNode = prop.key;
    let key: string;
    if (keyNode.type === "Identifier") key = keyNode.name;
    else if (keyNode.type === "StringLiteral") key = keyNode.value;
    else if (keyNode.type === "NumericLiteral") key = String(keyNode.value);
    else return null;

    const lit = evalLiteral(prop.value as Expression);
    if (typeof lit !== "string" && typeof lit !== "number") return null;
    out[key] = String(lit);
  }
  return out;
};

/**
 * All `export const name = { key: "..." }` string maps in a module.
 */
export const evalAllExportedStringMaps = (
  code: string
): Map<string, Record<string, string>> => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const out = new Map<string, Record<string, string>>();
  const constObjects = collectConstObjectBindings(ast);

  const trySet = (name: string, node: ObjectExpression) => {
    const map = evalObjectStringMap(node);
    if (map) out.set(name, map);
  };

  for (const [name, node] of constObjects) {
    trySet(name, node);
  }

  walk(ast, (node) => {
    if (node.type !== "ExportNamedDeclaration") return;
    const exp = node as ExportNamedDeclaration;

    if (exp.declaration?.type === "VariableDeclaration") {
      const decl = exp.declaration;
      if (decl.kind !== "const") return;
      for (const d of decl.declarations) {
        if (d.id.type !== "Identifier") continue;
        if (d.init?.type === "ObjectExpression") trySet(d.id.name, d.init);
      }
      return;
    }

    for (const spec of exp.specifiers) {
      if (spec.type !== "ExportSpecifier") continue;
      const s = spec as ExportSpecifier;
      const exported =
        s.exported.type === "Identifier" ? s.exported.name : null;
      if (!exported) continue;
      const obj = constObjects.get(s.local.name);
      if (obj) trySet(exported, obj);
    }
  });

  return out;
};

/**
 * Resolve `export const name = { base: ... }` or `export { name }` object
 * literals from a module's source.
 */
export const evalExportedStyleOptions = (
  code: string,
  exportName: string
): ResponsiveStyleOptions | null => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const constObjects = collectConstObjectBindings(ast);

  let found: ObjectExpression | null = null;

  walk(ast, (node) => {
    if (node.type !== "ExportNamedDeclaration") return;
    const exp = node as ExportNamedDeclaration;

    if (exp.declaration?.type === "VariableDeclaration") {
      const decl = exp.declaration;
      if (decl.kind !== "const") return;
      for (const d of decl.declarations) {
        if (d.id.type !== "Identifier" || d.id.name !== exportName) continue;
        if (d.init?.type === "ObjectExpression") found = d.init;
      }
      return;
    }

    for (const spec of exp.specifiers) {
      if (spec.type !== "ExportSpecifier") continue;
      const s = spec as ExportSpecifier;
      const exported =
        s.exported.type === "Identifier" ? s.exported.name : null;
      if (exported !== exportName) continue;
      const local = s.local.name;
      const obj = constObjects.get(local);
      if (obj) found = obj;
    }
  });

  return found ? optionsFromObject(found) : null;
};

export type ReExport =
  | { kind: "named"; exported: string; imported: string; source: string }
  | { kind: "all"; source: string };

/** `export { button } from "./button.js"` and `export * from "./button.js"`. */
export const collectReExports = (code: string): ReExport[] => {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const reExports: ReExport[] = [];

  walk(ast, (node) => {
    if (node.type === "ExportAllDeclaration") {
      reExports.push({ kind: "all", source: node.source.value });
      return;
    }
    if (node.type !== "ExportNamedDeclaration" || !node.source) return;
    for (const specifier of node.specifiers) {
      if (specifier.type !== "ExportSpecifier") continue;
      const exported =
        specifier.exported.type === "Identifier"
          ? specifier.exported.name
          : specifier.exported.value;
      reExports.push({
        kind: "named",
        exported,
        imported: specifier.local.name,
        source: node.source.value,
      });
    }
  });

  return reExports;
};

