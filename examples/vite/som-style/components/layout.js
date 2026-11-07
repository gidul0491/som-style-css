import { style } from "som-style";

export const stack = style({
  base: {
    display: "flex",
    "flex-direction": "column",
    gap: "1rem",
    "min-width": "0",
  },
  pc: {
    gap: "1.25rem",
  },
});

export const row = style({
  base: {
    display: "flex",
    "flex-direction": "column",
    gap: "0.75rem",
    "align-items": "stretch",
    "min-width": "0",
  },
  pc: {
    "flex-direction": "row",
    "align-items": "center",
    gap: "1rem",
  },
});

export const rowWrap = style({
  base: {
    display: "flex",
    "flex-wrap": "wrap",
    gap: "0.65rem",
    "align-items": "center",
    "min-width": "0",
  },
});

export const container = style({
  base: {
    width: "100%",
    "max-width": "72rem",
    margin: "0 auto",
    padding: "1.25rem",
    "box-sizing": "border-box",
  },
  pc: {
    padding: "2rem 2.5rem",
  },
});
