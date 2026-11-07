import { describe, it, expect } from "vitest";
import { emitStyle } from "../src/emitStyle.js";

const ctx = {
  breakpoints: { pc: "1024px", tablet: "768px" },
  classPrefix: "som",
  breakpoint: "1024px",
};

describe("emitStyle atomic", () => {
  it("is stable for the same options", () => {
    const a = emitStyle(
      { base: { display: "flex" }, pc: { "flex-direction": "row" } },
      ctx
    );
    const b = emitStyle(
      { base: { display: "flex" }, pc: { "flex-direction": "row" } },
      ctx
    );
    expect(a.className).toBe(b.className);
    expect(a.css).toBe(b.css);
    expect(a.css).toContain("@media (min-width: 1024px)");
    expect(a.css).toContain("display:flex");
  });

  it("reuses the same atom for the same declaration", () => {
    const a = emitStyle({ base: { display: "flex", gap: "1rem" } }, ctx);
    const b = emitStyle({ base: { display: "flex", padding: "8px" } }, ctx);
    const aClasses = a.className.split(" ");
    const bClasses = b.className.split(" ");
    const shared = aClasses.filter((c) => bClasses.includes(c));
    expect(shared.length).toBeGreaterThanOrEqual(1);
    expect(a.css).toContain("display:flex");
    expect(b.css).toContain("display:flex");
  });

  it("prefixes breakpoint atoms and wraps them in media queries", () => {
    const out = emitStyle(
      { base: { display: "flex" }, pc: { display: "grid" } },
      ctx
    );
    expect(out.className.split(" ").some((c) => c.includes("-pc-"))).toBe(
      true
    );
    expect(out.css).toMatch(
      /@media \(min-width: 1024px\)\{\.[^{]+\{display:grid;\}\}/
    );
  });

  it("keeps nested selectors as a compound class", () => {
    const out = emitStyle(
      {
        base: {
          display: "flex",
          "&:hover": { color: "red" },
        },
      },
      ctx
    );
    expect(out.className.split(" ").some((c) => /-n/.test(c))).toBe(true);
    expect(out.css).toContain(":hover");
    expect(out.css).toContain("color:red");
  });

  it("scopes every selector in a comma-separated list", () => {
    const out = emitStyle(
      {
        base: {
          "& a, & button": { color: "red" },
          "a, button": { color: "blue" },
          "& :is(a, button), &.active": { color: "green" },
        },
      },
      ctx
    );
    const compoundClass = out.className
      .split(" ")
      .find((className) => /-n/.test(className));
    const scope = `.${compoundClass}`;
    expect(out.css).toContain(`${scope} a, ${scope} button { color:red; }`);
    expect(out.css).toContain(`${scope} a, ${scope} button { color:blue; }`);
    expect(out.css).toContain(
      `${scope} :is(a, button), ${scope}.active { color:green; }`
    );
  });

  it("nests a selector inside its parent selector", () => {
    const out = emitStyle(
      { base: { "&:hover, &:focus": { "& span": { color: "red" } } } },
      ctx
    );
    const compoundClass = out.className.split(" ").find((c) => /-n/.test(c));
    const scope = `.${compoundClass}`;
    expect(out.css).toContain(
      `${scope}:hover span, ${scope}:focus span { color:red; }`
    );
  });

  it("wraps at-rule keys around the current selector", () => {
    const out = emitStyle(
      {
        base: { "@media (hover: hover)": { color: "red" } },
        pc: { "& a": { "@supports (display: grid)": { display: "grid" } } },
      },
      ctx
    );
    const [baseCompound, pcCompound] = out.className
      .split(" ")
      .filter((c) => /-n/.test(c));
    expect(out.css).toContain(
      `@media (hover: hover){.${baseCompound} { color:red; }}`
    );
    expect(out.css).toContain(
      `@media (min-width: 1024px){@supports (display: grid){.${pcCompound} a { display:grid; }}}`
    );
  });
});

