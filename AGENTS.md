# Agent notes (som-style)

- Mobile first, always: `base` is the phone layout. Write that first, then add
  `tablet` / `pc` only for the properties that actually change. Never write the
  desktop layout into `base` and shrink it down in a breakpoint.
- Prefer a value that is responsive on its own over a breakpoint override:
  `repeat(auto-fit, minmax(...))`, `clamp()`, `flex-wrap` + `flex-basis`.
  Fewer declarations to keep in sync.
- Use `style({ base, pc })` or app `som-style/components`.
- Page styles: put them anywhere you like; `style.js` in scaffold is only an example.
- To change a few properties, use `handle.extend({ base: { ... } })`.
- Call `style` / `.extend` only at module top level, not inside render.
- All theme tokens: app `som-style/theme.js` (`defineTheme` light/dark → `--som-theme-*`, `theme.*`).
- Spacing: `constant.js` rem. No package CSS/token black box — `src/` is logic only.
- Prefer OKLCH string literals over hex for palette colors.
