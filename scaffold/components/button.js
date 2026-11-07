import { style } from "som-style";
import { theme } from "../theme.js";

export const button = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.7rem 1.15rem",
    "border-radius": "0.65rem",
    "font-size": "0.95rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "7.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: `1px solid ${theme.softBorderOnFill}`,
    background:
      `linear-gradient(180deg, color-mix(in oklch, ${theme.primary} 88%, ${theme.onPrimary}) 0%, ${theme.primary} 48%, color-mix(in oklch, ${theme.primary} 78%, black) 100%)`,
    color: theme.onPrimary,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}`,
    "&:hover": {
      filter: "brightness(1.03)",
      "box-shadow":
        `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 2px 6px ${theme.shadowStrong}`,
    },
    "&:active": {
      transform: "translateY(1px)",
      "box-shadow":
        `0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}`,
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.primaryFocus}`,
      "outline-offset": "2px",
    },
  },
});

export const buttonGhost = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.7rem 1.15rem",
    "border-radius": "0.65rem",
    "font-size": "0.95rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "7.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: `1px solid ${theme.softBorder}`,
    background: `color-mix(in oklch, ${theme.surface} 55%, transparent)`,
    "backdrop-filter": "blur(8px)",
    color: theme.textHeading,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}`,
    "&:hover": {
      background: `color-mix(in oklch, ${theme.surface} 88%, transparent)`,
    },
    "&:active": {
      transform: "translateY(1px)",
      filter: "brightness(0.98)",
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.primaryFocus}`,
      "outline-offset": "2px",
    },
  },
});

export const buttonSoft = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.7rem 1.15rem",
    "border-radius": "0.65rem",
    "font-size": "0.95rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "7.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: `1px solid ${theme.softBorder}`,
    background: theme.surfaceMuted,
    color: theme.textHeading,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset`,
    "&:active": {
      transform: "translateY(1px)",
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.primaryFocus}`,
      "outline-offset": "2px",
    },
  },
});

export const buttonQuiet = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.7rem 1.15rem",
    "border-radius": "0.65rem",
    "font-size": "0.95rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "7.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: "1px solid transparent",
    background: "transparent",
    color: theme.textHeading,
    "box-shadow": "none",
    "&:hover": {
      background: `color-mix(in oklch, ${theme.text} 8%, transparent)`,
    },
    "&:active": {
      transform: "translateY(1px)",
      background: `color-mix(in oklch, ${theme.text} 12%, transparent)`,
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.primaryFocus}`,
      "outline-offset": "2px",
    },
  },
});

export const buttonDanger = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.7rem 1.15rem",
    "border-radius": "0.65rem",
    "font-size": "0.95rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "7.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: `1px solid ${theme.softBorderOnFill}`,
    background:
      `linear-gradient(180deg, color-mix(in oklch, ${theme.danger} 88%, ${theme.onPrimary}) 0%, ${theme.danger} 48%, color-mix(in oklch, ${theme.danger} 78%, black) 100%)`,
    color: theme.onPrimary,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px color-mix(in oklch, ${theme.danger} 25%, transparent)`,
    "&:hover": {
      filter: "brightness(1.03)",
      "box-shadow":
        `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 2px 6px color-mix(in oklch, ${theme.danger} 28%, transparent)`,
    },
    "&:active": {
      transform: "translateY(1px)",
      "box-shadow":
        `0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px color-mix(in oklch, ${theme.danger} 20%, transparent)`,
    },
    "&:focus-visible": {
      outline: `2px solid color-mix(in oklch, ${theme.danger} 50%, transparent)`,
      "outline-offset": "2px",
    },
  },
});

export const buttonSmall = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "0.5rem",
    padding: "0.45rem 0.8rem",
    "border-radius": "0.65rem",
    "font-size": "0.82rem",
    "font-weight": "600",
    "letter-spacing": "0.01em",
    "line-height": "1.2",
    cursor: "pointer",
    "text-decoration": "none",
    "box-sizing": "border-box",
    "min-width": "5.5rem",
    transition:
      "transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease",
    border: `1px solid ${theme.softBorderOnFill}`,
    background:
      `linear-gradient(180deg, color-mix(in oklch, ${theme.primary} 88%, ${theme.onPrimary}) 0%, ${theme.primary} 48%, color-mix(in oklch, ${theme.primary} 78%, black) 100%)`,
    color: theme.onPrimary,
    "box-shadow":
      `0 1px 0 ${theme.edgeShine} inset, 0 -1px 0 ${theme.edgeShade} inset, 0 1px 2px ${theme.shadow}`,
    "&:active": {
      transform: "translateY(1px)",
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.primaryFocus}`,
      "outline-offset": "2px",
    },
  },
});
