# som-style

A tool for writing screen styles (color, layout, spacing, etc.) in JavaScript.

Apply styles with a mobile focus, and override only the parts that should differ on PC or tablet.  
(**Mobile-first**: mobile first; PC/tablet only when needed)

Colors use **OKLCH**.  
OKLCH describes a color as three numbers: lightness / chroma / hue.  
Similar lightness and chroma are easier to pick, so this library uses OKLCH by default.  
Do not write palette colors as hex (`#FF7A00`) or `rgb(...)`.

**Works with:** vanilla JavaScript, React, and Solid.js.  
For Solid SSR, import from `som-style/solid`. Otherwise use `som-style`.

[Korean README](./README.md)

---

## Install

```bash
npm install som-style
# or
pnpm add som-style
```

Upgrading from 0.1.x? Read [CHANGELOG.md](./CHANGELOG.md) first  -  it covers a dropped-CSS fix and two compatibility changes.

Create a `som-style/` folder at the project root and copy the scaffold:

```bash
mkdir som-style
cp node_modules/som-style/scaffold/{constant.js,theme.js,config.js,style.js} som-style/
cp -R node_modules/som-style/scaffold/components som-style/
```

---

## Quick start

**Recommended:** enable the `somStyle()` Vite plugin so static `style` / `variants` / `.extend` extract to CSS at build time.

```js
// vite.config.js
import { somStyle } from "som-style/vite";

export default {
  plugins: [somStyle()],
};
```

```js
import {
  style,
  variants,
  extend,
  configure,
  defineTheme,
  setTheme,
  getTheme,
} from "som-style";
// Solid SSR: import { ... } from "som-style/solid";
```

All theme tokens (colors, hue, soft-border, shadow) live in project `som-style/theme.js` via `defineTheme({ light, dark })`.

Shared UI styles live in project `som-style/components/` (`button.js`, `panel.js`, ...).

```js
import { button, panel, stack } from "./som-style/components";
```

Add custom styles with `style()` wherever you prefer.

Without a bundler (or without `somStyle()`), `defineTheme` / `style()` inject CSS at runtime, so styles may apply with a delay.

---

## Layout

`style` takes `base` (defaults including mobile) and breakpoint overrides (`pc`, etc.).  
Prefer **camelCase** property keys; kebab-case (`"flex-direction"`) is also accepted.  
In templates/JSX it works like a class string; use `.extend()` to change properties.

```js
const box = style({
  base: { display: "flex", flexDirection: "column", gap: "1rem" },
  pc: { flexDirection: "row" },
});

const boxTight = box.extend({
  base: { gap: "0.5rem" },
});
```

```jsx
<div class={box}>...</div>
```

In React, `className={box}` works (the handle behaves like a string). `box.className` is the same value. For raw DOM, `el.className = box` is enough.

`style` option shape:

- **`base`**: styles applied at every width, including mobile (required)
- **`pc`**: overrides for the default PC breakpoint (default: 1024px and up)
- **`tablet`**, **`xl`**, **`"1440px"`**, etc.: overrides for breakpoints registered in `som-style/config.js` or written as CSS lengths (optional)

**Where to call:** Call `style` / `.extend` **once at module top level**. Do not call them inside render on every update.

To reuse the same style across components, define it once in a style module (for example `som-style/style.js`) and export the **handle**.

```js
// som-style/style.js
import { style } from "som-style";
import { theme } from "./theme.js";
import { space } from "./constant.js";

export const box = style({
  base: { display: "flex", gap: space.s4, color: theme.text },
  pc: { flexDirection: "row" },
});
```

```js
// Box.jsx
import { box } from "./som-style/style.js";

export function Box(props) {
  return <div class={box}>{props.children}</div>;
}
```

```js
// Avoid  -  called every render
export function Box(props) {
  const box = style({ base: { display: "flex" } });
  return <div class={box}>{props.children}</div>;
}
```

---

## AI agents / vibe coding

Installing the package does **not** install Cursor/Copilot rules into your app.  
To steer agents, copy the block below into **your app repo root**.

**Recommended:** `AGENTS.md` at the project root (used by Cursor, Claude Code, and others).  
For Cursor-only, you can also put the same text in `.cursor/rules/som-style.mdc`.

```md
# som-style

- Use `style({ base, pc })` or app `som-style/components/` only.
- To change a few properties: `handle.extend({ base: { ... } })`.
- Call `style` / `.extend` only at module top level (not inside render).
- Theme: `defineTheme({ light, dark })` in `theme.js`; use `theme.primary` in style().
- Spacing: `constant.js` rem. Theme: `theme.js`. Shared UI: `components/`. Page styles: anywhere you prefer.
- Prefer OKLCH string literals over hex for palette colors.
```

`extend` / `.extend()` overwrites existing keys and adds missing ones (deep-merge for nested objects).

---

## Configuration

Edit the files under the project **`som-style/`** folder (config, theme, constants, shared UI styles, optional example styles).

```
my-app/
  som-style/
    config.js
    theme.js
    constant.js
    components/     # shared UI (button.js, panel.js, ...)
      index.js
    style.js        # optional example only
  src/              # page styles live wherever you prefer
```

### `som-style/config.js` example

```js
// som-style/config.js
import { configure } from "som-style"; // Solid SSR: "som-style/solid"
import "./theme.js";

configure({
  breakpoints: {
    tablet: "768px",
    pc: "1280px",
    xl: "1440px",
  },
});
```

### Breakpoint precedence and `cascadeLayers`

som-style emits one atomic class per declaration, and the same `property: value` shares one class across the whole project. `@media` does not raise specificity, so when `base` and `pc:` land on the same element, **whichever rule comes later in the sheet wins**.

som-style always composes the sheet as **base → narrow breakpoints → wide breakpoints**, regardless of emission order. The runtime keeps one `<style>` per bucket in DOM order, and the Vite plugin sorts the shared sheet. Another module declaring the same value first can no longer kill your `pc:` override.

That is enough inside one app. Once your CSS is mixed with third-party sheets or a separate build output, order is no longer yours to control  -  turn on `cascadeLayers` for that.

```js
configure({
  breakpoints: { sm: "640px", pc: "1024px" },
  cascadeLayers: true,
});
```

```css
@layer som.base, som.sm, som.pc;
@layer som.base { .som-1l2w6rg{grid-template-columns:repeat(2,minmax(0,1fr));} }
@layer som.pc   { @media (min-width: 1024px){ .som-pc-zrz4ai{...repeat(4,...);} } }
```

The layer order is declared up front, so the outcome is identical no matter what order the rules arrive in.

> **Caveat (why it defaults to `false`)**: layered CSS **always loses to unlayered CSS**, regardless of specificity. Turning this on lets a reset or a global `.css` file start beating som-style classes. Enable it only when you can move consumer CSS into layers too. (Browsers: Chrome/Edge 99+, Safari 15.4+, Firefox 97+)

### `som-style/theme.js` example

`defineTheme` emits CSS variables and returns **handles**. `theme.primary`  ->  `"var(--som-theme-primary)"`.

- **`light` / `dark`**: all theme tokens (colors, hue, soft border, shadow)  ->  `--som-theme-*`, handles like `theme.text` / `theme.softBorder`.

```js
// som-style/theme.js
import { defineTheme } from "som-style"; // Solid SSR: "som-style/solid"

export const theme = defineTheme({
  defaultTheme: "light",
  light: {
    hue: "44.63",
    softBorder: "color-mix(in oklch, var(--som-theme-border-strong) 42%, transparent)",
    shadow: "oklch(0.2 0.02 var(--som-theme-hue) / 0.14)",
    primary: "oklch(0.7 0.18 var(--som-theme-hue))",
    text: "oklch(0.35 0.02 var(--som-theme-hue))",
    bg: "oklch(1 0 0)",
    surface: "oklch(1 0 0)",
    border: "oklch(0.92 0.01 var(--som-theme-hue))",
    success: "oklch(0.62 0.15 150)",
    danger: "oklch(0.63 0.19 35)",
  },
  dark: {
    softBorder: "oklch(1 0 0 / 0.08)",
    shadow: "oklch(0 0 0 / 0.45)",
    primary: "oklch(0.7 0.18 calc(var(--som-theme-hue) + 180))",
    text: "oklch(0.98 0 0)",
    bg: "oklch(0.2 0.000001 var(--som-theme-hue))",
    surface: "oklch(0.25 0.001 var(--som-theme-hue))",
    border: "oklch(0.35 0.001 var(--som-theme-hue))",
  },
});
```

### `som-style/constant.js` example

Manage spacing, radius, font size, and similar rem/px values.

```js
// som-style/constant.js
export const space = {
  s1: "0.25rem",
  s4: "1rem",
  s8: "3rem",
};

export const radius = {
  md: "0.65rem",
  lg: "0.875rem",
};

export const fontSize = {
  md: "1rem",
  lg: "1.125rem",
};
```

### What each file does

- **`config.js`**: `configure({ breakpoints })` for responsive breakpoints. `import "./theme.js"` registers the theme once.
- **`theme.js`**: `defineTheme({ defaultTheme, light, dark })`  ->  `--som-theme-*`. Export `theme` handles for `style()`.
- **`constant.js`**: `space`, `radius`, `fontSize` rem/px literals. Optional app-only `custom` object.
- **`components/`**: shared UI styles (`button.js`, `panel.js`, ...). Re-export from `index.js`.
- **`style.js`**: example only. Put page styles wherever your project prefers.

### How to import in your app

Import `som-style/config.js` once at the top of your app entry.

```js
// Examples: Vite (src/main.js), SolidStart (src/app.tsx), Next.js, etc.
import "./som-style/config.js";
```

Import style handles from your style modules (for example `som-style/style.js`):

```js
import { app, hero } from "./som-style/style.js";
import { theme } from "./som-style/theme.js";
import { space } from "./som-style/constant.js";
```

---

## Using with Vite (recommended  -  near zero-runtime)

With `somStyle()`, static styles are bundled as **real CSS** in both development and production, so style application is not delayed.  
`style({ ... })` and `variants({ ... })` imported from `som-style`, and `.extend({ ... })` on their handles, become class-name strings (or a variants map). Extending a handle imported from another file (`button` from `./som-style/components`) works too. Calls that are not som-style's, such as zod's `schema.extend()`, are left alone.

```js
// vite.config.js
import { somStyle } from "som-style/vite";

export default {
  plugins: [somStyle()],
};
```

```js
// OK  -  extracted
const box = style({ base: { color: "red", padding: "1rem" } });
const tight = box.extend({ base: { padding: "0.5rem" } });
const tone = variants({
  ok: { base: { color: "green" } },
  bad: { base: { color: "red" } },
});
el.className = tone[status]; // only status is runtime

// Not OK  -  build error with the plugin (patch/base not fixed at build time)
for (const p of patches) box.extend(p);
box.extend(userTheme);
```

Why loops / programmatic `.extend` cannot become static CSS: the build **reads files before running them**. Loop counts, API values, and runtime branches are unknown then, so the set of CSS rules cannot be fixed. (Literals written in the file can be extracted.)

To share styles across files, either works (both are extracted):

1. Export the **`style()` handle**  -  most common. After the plugin, it is a class-name string.
2. Export an **options object** (`{ base: ... }`) and call `style(imported)` in another file  -  relative imports are extracted too.

```js
// OK  -  inline
export const box = style({
  base: { display: "flex" },
});

// OK  -  same-file const
const styles = { base: { display: "flex" } };
export const box = style(styles);

// OK  -  import options object into style()
// shared.js: export const styles = { base: { display: "flex" } };
import { styles } from "./shared.js";
export const box = style(styles);

// OK  -  import the handle for markup
// style.js: export const box = style({ base: { display: "flex" } });
import { box } from "./style.js";

// OK  -  import a handle from another file and .extend() it
import { button } from "./som-style/components";
export const wideButton = button.extend({ base: { width: "100%" } });
```

Numbers get `px` like React inline styles (`width: 320` -> `320px`). Properties that take a bare number, such as `opacity`, `zIndex`, `lineHeight` and `flex`, are left as is.

Edits during development update the page immediately.

---

## Changing styles with for / fetch

Put only **values known up front** into som-style `style()`.

Do **not** put runtime-only values (fetched colors, measured widths) into som-style.

### 1. A fixed set of keys  -  `variants`

```js
import { variants } from "som-style";
import { theme } from "./som-style/theme.js";

const badge = variants({
  success: { base: { color: theme.success } },
  danger: { base: { color: theme.danger } },
});

const status = await getStatus(); // "success" | "danger"

<span className={badge[status]}>Saved</span>
```

### 2. Fully dynamic values  -  inline `style` (not som-style)

Keep fixed layout in `style()`, and put changing color/size in React/DOM **inline `style`**.

```js
import { style } from "som-style";
import { theme } from "./som-style/theme.js";
import { space, radius } from "./som-style/constant.js";

const card = style({
  base: {
    display: "flex",
    gap: space.s4,
    padding: space.s5,
    borderRadius: radius.lg,
    color: theme.text,
  },
});

const fg = await fetchColor();
const w = measureWidth();

<div
  className={card}
  style={{ color: fg, width: w }}
/>
```

- `className={card}`  ->  som-style (CSS at build time)
- `style={{ color: fg, width: w }}`  ->  browser inline (dynamic values only)

---

## Color

### 1. Spacing, radius, font size (`constant.js`)

Import the project `som-style/constant.js`.

```js
import { style } from "som-style";
import { theme } from "./som-style/theme.js";
import { space, radius, fontSize } from "./som-style/constant.js";

const card = style({
  base: {
    gap: space.s4,
    padding: space.s5,
    borderRadius: radius.lg,
    fontSize: fontSize.md,
    color: theme.text,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
  },
});
```

| Constant | Example keys |
|---|---|
| `space` | `s1`...`s8` (extend in your project) |
| `radius` | `sm` `md` `lg` `full` |
| `fontSize` | `sm` `md` `lg` `xl` `2xl` |

### 2. Theme palette (`theme.js`)

`defineTheme` creates light/dark CSS variables (`--som-theme-*`) and returns **handles** for `style()`.

```js
import { theme } from "./som-style/theme.js";

style({
  base: {
    color: theme.text,
    background: theme.surface,
    border: `1px solid ${theme.border}`,
  },
});
```

| Handle | Use |
|---|---|
| `theme.primary` | Brand / accent |
| `theme.primaryHover` | Primary hover |
| `theme.primaryFocus` | Focus ring |
| `theme.onPrimary` | Text on primary |
| `theme.text` | Body text |
| `theme.textHeading` | Heading |
| `theme.textMuted` | Muted text |
| `theme.bg` | Page background |
| `theme.surface` | Card / panel |
| `theme.surfaceMuted` | Soft surface |
| `theme.border` | Border |
| `theme.borderStrong` | Stronger border |
| `theme.success` | Success |
| `theme.danger` | Danger |
| `theme.warning` | Warning |
| `theme.mark` | Highlight |

Add missing keys as OKLCH string literals in the `light` / `dark` objects.  
Write values like `"oklch(0.35 0.02 var(--som-theme-hue))"`. When defining tokens inside `theme.js`, reference other tokens with the CSS variable form `var(--som-theme-hue)`, not `theme.hue` (handles are for consuming styles outside `defineTheme`).

## Light / dark

Set the first theme with `defineTheme({ defaultTheme: "light" | "dark" })` in `theme.js`.

```js
setTheme("dark"); // switch theme
setTheme("light");

getTheme(); // current theme: "light" | "dark"
```

Theme toggle example:

```js
setTheme(getTheme() === "dark" ? "light" : "dark");
```

---

## SSR (when the server assembles HTML)

**Needed when:** the **server builds the HTML response**  -  JSP, Thymeleaf, SolidStart / Next SSR, etc.  
There is no `document` on the server, so som-style cannot inject a `<style>` into `<head>` by itself.  
CSS from `style()` / `defineTheme` is only collected in memory; you must embed it in the HTML to avoid a flash of unstyled content (FOUC).

Add once to the document `<head>`:

```jsx
<style id="som-server-styles" innerHTML={getCollectedStyles()} />
```

(Attribute names differ by framework  -  React uses `dangerouslySetInnerHTML`, Solid uses `innerHTML`, etc.)

**Not needed when:**

- Client-only SPA  -  styles inject into `document.head` automatically.
- Vite + `somStyle()`  -  CSS is extracted at build time and shipped by Vite (`getCollectedStyles` not required).

---

## Local demo

After cloning this repo:

```bash
git clone https://github.com/gidul0491/som-style-css.git
cd som-style-css
npm install
cd examples/vite
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

The in-repo example uses `file:../..` (the local package you just built).  
In your own app, install with `npm install som-style` as in the Install section.

Edit these for the demo:

- `examples/vite/main.js`  -  layout, copy
- `examples/vite/som-style/`  -  `config.js`, `theme.js`, `constant.js`, `components/`, (demo) `style.js`

After changing library `src/`, run `npm run build` at the repo root, then refresh the example dev server.
