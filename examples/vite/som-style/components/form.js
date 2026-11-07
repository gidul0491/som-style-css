import { style } from "som-style";
import { theme } from "../theme.js";

export const input = style({
  base: {
    display: "block",
    width: "100%",
    "max-width": "100%",
    "min-width": "0",
    "box-sizing": "border-box",
    padding: "0.7rem 0.85rem",
    "border-radius": "0.65rem",
    border: `1px solid ${theme.borderStrong}`,
    background: `color-mix(in oklch, ${theme.surface} 88%, transparent)`,
    color: theme.text,
    "font-size": "1rem",
    "line-height": "1.4",
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset`,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
    "&:focus": {
      "border-color": theme.primary,
      "box-shadow":
        `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 0 0 3px ${theme.primaryFocus}`,
    },
  },
});

export const label = style({
  base: {
    display: "block",
    color: theme.textMuted,
    "font-size": "0.8rem",
    "font-weight": "600",
    "letter-spacing": "0.04em",
    "text-transform": "uppercase",
    "margin-bottom": "0.4rem",
  },
});
