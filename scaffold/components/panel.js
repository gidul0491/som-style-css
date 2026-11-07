import { style } from "som-style";
import { theme } from "../theme.js";

export const panel = style({
  base: {
    "min-width": "0",
    "box-sizing": "border-box",
    background: `color-mix(in oklch, ${theme.surface} 82%, transparent)`,
    "backdrop-filter": "blur(12px)",
    "-webkit-backdrop-filter": "blur(12px)",
    border: `1px solid ${theme.softBorder}`,
    "border-radius": "0.875rem",
    padding: "1.25rem",
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}, 0 10px 28px ${theme.shadow}`,
  },
  pc: {
    padding: "1.5rem",
  },
});

export const panelPrimary = panel.extend({
  base: {
    "backdrop-filter": "none",
    "-webkit-backdrop-filter": "none",
    border: `1px solid ${theme.softBorderOnFill}`,
    background:
      `linear-gradient(180deg, color-mix(in oklch, ${theme.primary} 88%, ${theme.onPrimary}) 0%, ${theme.primary} 48%, color-mix(in oklch, ${theme.primary} 78%, black) 100%)`,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}, 0 10px 28px ${theme.shadow}`,
  },
});
