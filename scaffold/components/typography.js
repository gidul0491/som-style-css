import { style } from "som-style";
import { theme } from "../theme.js";

export const heading = style({
  base: {
    margin: "0",
    color: theme.textHeading,
    "font-size": "2rem",
    "line-height": "1.15",
    "font-weight": "600",
    "letter-spacing": "-0.03em",
  },
  pc: {
    "font-size": "2.75rem",
  },
});

export const lede = style({
  base: {
    margin: "0",
    color: theme.textMuted,
    "font-size": "1.05rem",
    "line-height": "1.55",
    "max-width": "36rem",
  },
});

export const muted = style({
  base: {
    color: theme.textMuted,
    "font-size": "0.92rem",
    "line-height": "1.5",
  },
});

export const kicker = style({
  base: {
    margin: "0",
    color: theme.primary,
    "font-size": "0.8rem",
    "font-weight": "650",
    "letter-spacing": "0.08em",
    "text-transform": "uppercase",
  },
});
