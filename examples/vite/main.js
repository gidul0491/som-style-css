import "./som-style/config.js";
import {
  app,
  brand,
  customChip,
  customDemo,
  field,
  flush,
  footer,
  frostCompare,
  frostTint,
  grid,
  hero,
  inset,
  sectionTitle,
} from "./som-style/style.js";
import { setTheme, getTheme } from "som-style";
import {
  button,
  buttonDanger,
  buttonGhost,
  buttonQuiet,
  buttonSmall,
  buttonSoft,
  container,
  input,
  kicker,
  label,
  lede,
  muted,
  panel,
  panelPrimary,
  row,
  rowWrap,
  stack,
} from "./som-style/components";

const root = document.querySelector("#app");
root.className = app;
root.innerHTML = `
  <main class="${container}">
    <section class="${hero} ${stack}">
      <p class="${kicker}">CSS-identical objects</p>
      <h1 class="${brand}">som-style</h1>
      <p class="${lede}">
        CSS 문법과 동일한 객체를 만드세요. <br>모바일 퍼스트로 스타일을 설계하고,
        필요할 때만 PC 스타일을 덮어쓰세요.
      </p>
      <div class="${row}">
        <a class="${button}" href="#components">공통 UI 보기</a>
        <a class="${buttonGhost}" href="https://github.com/gidul0491/som-style-css">GitHub</a>
        <button type="button" class="${buttonGhost}" id="theme-toggle">테마</button>
      </div>
    </section>

    <section id="components" class="${grid}">
      <article class="${panel} ${stack}">
        <h2 class="${sectionTitle}">Panel</h2>
        <p class="${muted}">
          공통 패널입니다. 테두리와 약한 그림자가 있습니다.
        </p>
        <div class="${frostCompare}">
          <div class="${panelPrimary} ${frostTint}" aria-hidden="true"></div>
          <div class="${panel} ${inset}">
            <p class="${muted} ${flush}">
              패널은 반투명합니다.
            </p>
          </div>
        </div>
        <div class="${field}">
          <label class="${label}" for="email">Email</label>
          <input class="${input}" id="email" type="email" placeholder="you@studio.dev" />
        </div>
        <div class="${row}">
          <button type="button" class="${button}">Continue</button>
          <button type="button" class="${buttonGhost}">Skip</button>
        </div>
      </article>

      <article class="${panel} ${stack}">
        <h2 class="${sectionTitle}">Buttons</h2>
        <p class="${muted}">
          버튼은 역할별로 나뉩니다. <br>Primary는 강조, Danger는 경고에 사용하세요.
        </p>
        <div class="${rowWrap}">
          <button type="button" class="${button}">Primary</button>
          <button type="button" class="${buttonGhost}">Ghost</button>
          <button type="button" class="${buttonSoft}">Soft</button>
          <button type="button" class="${buttonQuiet}">Quiet</button>
          <button type="button" class="${buttonDanger}">Danger</button>
          <button type="button" class="${buttonSmall}">Small</button>
        </div>
      </article>
    </section>

    <section class="${panel} ${stack}" style="margin-top: 1.25rem">
      <h2 class="${sectionTitle}">Custom tokens</h2>
      <p class="${muted}">
        defineTheme 커스텀 색 · space.s9 · constant.js 리터럴
      </p>
      <div class="${customDemo}" id="custom-demo">
        <span class="${customChip}" id="custom-chip">customColor</span>
        <p class="${flush} ${muted}">
          theme.warning · space.s9 · custom.customSize
        </p>
      </div>
    </section>

    <footer class="${footer}">
      <p class="${muted}">panel.extend · style() · som-style/components/</p>
    </footer>
  </main>
`;

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  setTheme(getTheme() === "dark" ? "light" : "dark");
});
