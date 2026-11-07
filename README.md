# som-style

화면 스타일(색, 배치, 간격 등)을 자바스크립트 코드로 적는 도구입니다.

모바일 위주로 스타일을 적용하고, PC나 태블릿에서만 다른 스타일 적용이 필요할 때 원하는 부분만 덮어쓸 수 있습니다.  
(**모바일 퍼스트**: 먼저 모바일, 필요할 때만 PC/태블릿)

색은 **OKLCH** 코드를 사용합니다.  
OKLCH는 색을 “밝기 / 진하기 / 색상(각도)” 세 숫자로 적는 방법입니다.  
사람이 보기에 비슷한 밝기·비슷한 진하기의 색을 고르기 쉬워서, 이 라이브러리에서는 OKLCH를 기본으로 씁니다.  
`#FF7A00` 같은 hex 코드나 `rgb(...)`로 팔레트 색을 직접 적지 마세요.

**어디서 쓰나요:** 바닐라 JavaScript, React, Solid.js 모두 가능합니다.  
Solid에서 서버 렌더링(SSR)을 쓰면 `som-style/solid`를 import 하세요. 그 외에는 `som-style`이면 됩니다.

[English README](./README.en.md)

---

## 설치

```bash
npm install som-style
# 또는
pnpm add som-style
```

0.1.x에서 올라오신다면 [CHANGELOG.md](./CHANGELOG.md)를 먼저 보세요 — CSS 유실 수정과 호환성 변경이 있습니다.

프로젝트 루트에 `som-style/` 폴더를 만들고 스캐폴드를 복사합니다.

```bash
mkdir som-style
cp node_modules/som-style/scaffold/{constant.js,theme.js,config.js,style.js} som-style/
cp -R node_modules/som-style/scaffold/components som-style/
```

---

## 시작하기

**권장:** Vite 프로젝트에서는 `somStyle()` 플러그인을 켜세요. 정적 `style` / `variants` / `.extend`가 빌드 때 CSS로 추출됩니다.

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

모든 테마 변수(색·hue·soft-border·shadow)는 프로젝트 `som-style/theme.js`의 `defineTheme({ light, dark })`에서 수정합니다.

공통 UI 스타일은 프로젝트 `som-style/components/`에 둡니다 (`button.js`, `panel.js` …).

```js
import { button, panel, stack } from "./som-style/components";
```

커스텀 스타일을 생성하려면 원하는 곳에 `style()`을 추가하면 됩니다.

번들러가 없거나 `somStyle()` 플러그인을 빼면 `defineTheme` / `style()`이 런타임에 CSS를 주입하여 스타일 적용이 지연될 수 있습니다.

---

## 레이아웃

`style`은 `base`(모바일 포함 기본)와 중단점 덮어쓰기(`pc` 등)를 담은 객체를 받습니다.  
속성 키는 **camelCase를 기본**으로 쓰고, kebab-case(`"flex-direction"`)도 됩니다.  
템플릿/JSX에서는 클래스 문자열처럼 쓸 수 있고, 속성만 바꿀 때는 `.extend()`를 씁니다.

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

React에서는 `className={box}`를 그대로 쓰면 됩니다 (`box`는 문자열처럼 동작하는 핸들). `box.className`도 동일합니다. DOM에 직접 넣을 때도 `el.className = box`면 충분합니다.

`style` 옵션 구조:

- **`base`**: 모바일을 포함한 모든 화면 너비에 기본 적용되는 스타일 (필수)
- **`pc`**: 기본 PC 화면(기본 1024px 이상)에서 덮어쓸 스타일
- **`tablet`**, **`xl`**, **`"1440px"`** 등: `som-style/config.js`에서 추가 등록했거나 직접 지정한 브레이크포인트에서 덮어쓸 스타일 (선택)

**호출 위치:** `style` / `.extend`는 **파일(모듈) 최상단**에서 한 번만 호출하세요. 컴포넌트 함수·렌더 안에서 매 렌더마다 호출하지 마세요.

여러 컴포넌트에서 같은 스타일을 쓰려면, `som-style/style.js`처럼 스타일 전용 파일에서 한 번 만들고 **핸들**을 export 하면 됩니다.

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
// 피하세요 — 렌더마다 호출
export function Box(props) {
  const box = style({ base: { display: "flex" } });
  return <div class={box}>{props.children}</div>;
}
```

---

## AI 에이전트 / 바이브코딩

`npm install`만으로는 Cursor·Copilot 규칙이 소비자 프로젝트에 자동으로 붙지 않습니다.  
에이전트가 som-style 규칙을 지키게 하려면 **앱 저장소 루트**에 아래를 복사해 두세요.

**추천:** 프로젝트 루트에 `AGENTS.md` (Cursor, Claude Code, 여러 도구가 참고)  
Cursor만 쓸 거면 `.cursor/rules/som-style.mdc`에도 같은 내용을 넣어도 됩니다.

```md
# som-style

- 스타일은 `style({ base, pc })` 또는 앱 `som-style/components/`만 사용.
- 일부 속성만 바꿀 때: `handle.extend({ base: { ... } })`.
- `style` / `.extend`는 모듈 최상단에서만 호출 (렌더 안 금지).
- 테마: `theme.js`에서 `defineTheme({ light, dark })`, style()에서는 `theme.primary`.
- 간격: `constant.js` rem. 테마: `theme.js`. 공통 UI: `components/`. 페이지 스타일: 원하는 위치.
- 팔레트 색은 OKLCH 문자열 리터럴. 임의 hex 지양.
```

`extend` / `.extend()`는 기존 키는 덮어쓰고, 없는 키는 추가합니다 (중첩 객체도 깊은 병합).

---

## 설정 바꾸기

프로젝트 루트에 생성된 **`som-style/`** 폴더내의 설정·테마·상수·스타일파일을 수정합니다.

```
my-app/
  som-style/
    config.js
    theme.js
    constant.js
    components/     # shared UI (button.js, panel.js, …)
      index.js
    style.js        # optional example only
  src/              # page styles live wherever you prefer
```


### `som-style/config.js` 예시

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

### 중단점 우선순위와 `cascadeLayers`

som-style은 선언 하나당 원자 클래스 하나를 만들고, 같은 `property: value`는 프로젝트 전체에서 같은 클래스를 공유합니다. `@media`는 특이도를 올리지 않으므로, `base`와 `pc:`가 같은 요소에 붙으면 **시트에서 뒤에 나온 규칙이 이깁니다**.

som-style은 방출 순서와 무관하게 항상 **base → 좁은 중단점 → 넓은 중단점** 순으로 시트를 조립합니다. 런타임은 버킷별 `<style>`을 순서대로 두고, Vite 플러그인은 공유 시트를 정렬해서 냅니다. 다른 모듈이 우연히 같은 값을 먼저 선언해도 `pc:`가 죽지 않습니다.

앱 안에서는 이걸로 충분하지만, 서드파티 시트나 별도 빌드 결과물과 섞이면 순서를 보장할 수 없습니다. 그럴 때 `cascadeLayers`를 켜세요.

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

레이어 순서를 미리 선언하므로 규칙이 어떤 순서로 들어오든 결과가 같습니다.

> **주의 (기본값이 `false`인 이유)**: 레이어에 든 CSS는 특이도와 무관하게 **레이어 없는 CSS에 무조건 집니다**. 켜는 순간 리셋이나 전역 `.css` 파일이 som-style 클래스를 이기기 시작합니다. 소비자 CSS도 같이 레이어로 옮길 수 있을 때만 켜세요. (브라우저: Chrome/Edge 99+, Safari 15.4+, Firefox 97+)

### `som-style/theme.js` 예시

`defineTheme`는 CSS 변수를 만들고, **핸들**을 반환합니다. `theme.primary` → `"var(--som-theme-primary)"`.

- **`light` / `dark`**: 모든 테마 토큰(색·hue·soft border·shadow) → `--som-theme-*`, 핸들은 `theme.text` / `theme.softBorder` 등.

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

### `som-style/constant.js` 예시

간격·둥글기·글자 크기 등을 관리합니다.

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

### 각 파일의 역할

- **`config.js`**: `configure({ breakpoints })`로 반응형 중단점 설정. `import "./theme.js"`로 최초 테마 등록.
- **`theme.js`**: `defineTheme({ defaultTheme, light, dark })` — `--som-theme-*`. `export const theme` 핸들을 style()에서 사용.
- **`constant.js`**: `space`, `radius`, `fontSize` 등 rem/px 리터럴. 앱 전용 `custom` 객체 추가 가능.
- **`components/`**: 공통 UI 스타일 (`button.js`, `panel.js` …). `index.js`로 re-export.
- **`style.js`**: 예시용. 페이지 스타일은 프로젝트 관례에 맞게 두세요.

### 앱에서 설정 불러오기

`som-style/config.js`를 앱 진입점에서 가장 먼저 한 번 `import` 하세요.

```js
// 예: Vite (src/main.js), SolidStart (src/app.tsx), Next.js 등
import "./som-style/config.js";
```

스타일 핸들은 `som-style/style.js` 등 스타일 파일에서 import 합니다.

```js
import { app, hero } from "./som-style/style.js";
import { theme } from "./som-style/theme.js";
import { space } from "./som-style/constant.js";
```

---

## Vite와 함께 쓰기 (권장 · 제로런타임에 가깝게)

`somStyle()`을 쓰면 개발·배포 모두에서 정적 스타일이 **미리 CSS**로 묶여 스타일 적용 지연을 방지합니다.
`som-style`에서 import한 `style({ ... })`, `variants({ ... })`와 그 핸들의 `.extend({ ... })`는 클래스 문자열(또는 variants 맵)로 바뀝니다. 다른 파일에서 가져온 핸들(`./som-style/components`의 `button` 등)에 `.extend()`해도 됩니다. zod의 `schema.extend()`처럼 som-style이 아닌 호출은 건드리지 않습니다.

```js
// vite.config.js
import { somStyle } from "som-style/vite";

export default {
  plugins: [somStyle()],
};
```

```js
// OK — 추출됨
const box = style({ base: { color: "red", padding: "1rem" } });
const tight = box.extend({ base: { padding: "0.5rem" } });
const tone = variants({
  ok: { base: { color: "green" } },
  bad: { base: { color: "red" } },
});
el.className = tone[status]; // status만 런타임

// 안 됨 — 플러그인 사용 시 빌드 에러 (패치/베이스를 빌드가 확정할 수 없음)
for (const p of patches) box.extend(p);
box.extend(userTheme);
```

반복·프로그래머틱 `.extend`를 정적 CSS로 못 만드는 이유: 빌드는 **실행해 보기 전에** 파일을 읽습니다. 루프 횟수·API에서 온 값·런타임 분기는 그 시점에 없어서, “어떤 CSS 규칙 집합이 필요한지”를 유한하게 확정할 수 없습니다. (리터럴이 파일에 다 적혀 있으면 추출 가능합니다.)

같은 스타일을 여러 곳에서 쓸 때는 아래 둘 중 하나면 됩니다 (둘 다 추출됨).

1. **`style()` 결과(핸들)** 을 export — 가장 흔함. 플러그인 적용 후에는 클래스 문자열입니다.
2. **options 객체** (`{ base: … }`) 를 export한 뒤, 다른 파일에서 `style(imported)` — 상대 경로 import도 추출됩니다.

```js
// OK — 호출 안에 직접
export const box = style({
  base: { display: "flex" },
});

// OK — 같은 파일 const
const styles = { base: { display: "flex" } };
export const box = style(styles);

// OK — 다른 파일에서 options 객체를 import 해 style()에 전달
// shared.js: export const styles = { base: { display: "flex" } };
import { styles } from "./shared.js";
export const box = style(styles);

// OK — 다른 파일에서 핸들을 import (markup에서 class로 사용)
// style.js: export const box = style({ base: { display: "flex" } });
import { box } from "./style.js";

// OK — 다른 파일의 핸들을 import 해 .extend()
import { button } from "./som-style/components";
export const wideButton = button.extend({ base: { width: "100%" } });
```

숫자 값은 React 인라인 스타일처럼 `px`이 붙습니다(`width: 320` → `320px`). `opacity`, `zIndex`, `lineHeight`, `flex`처럼 원래 단위가 없는 속성은 그대로 둡니다.

개발 중 스타일을 수정하면 화면에 바로 반영됩니다.

---

## for / fetch 로 스타일을 바꿀 때

som-style의 `style()`에는 **처음부터 정해진 값만** 넣으세요. 

`fetch` 색, 측정한 width처럼 **실행 중에야 아는 값**은 som-style에 넣지 마세요.

### 1. 키가 몇 개로 정해져 있을 때 — `variants`

```js
import { variants } from "som-style";
import { theme } from "./som-style/theme.js";

const badge = variants({
  success: { base: { color: theme.success } },
  danger: { base: { color: theme.danger } },
});

const status = await getStatus(); // "success" | "danger"

<span className={badge[status]}>저장됨</span>
```

### 2. 값 자체가 동적일 때 — 인라인 `style` (som-style 아님)

고정 레이아웃만 `style()`로 두고, 바뀌는 색·크기는 React/DOM의 **인라인 `style`**에 넣습니다.

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

- `className={card}` → som-style (빌드 때 CSS)
- `style={{ color: fg, width: w }}` → 브라우저 인라인 (동적 값만)

---

## 색

### 1. 간격·둥글기·글자 크기 (`constant.js`)

프로젝트에 생성된 `som-style/constant.js`를 import 합니다.

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

| 상수 | 키 예 |
|---|---|
| `space` | `s1`…`s8` (프로젝트에서 확장 가능) |
| `radius` | `sm` `md` `lg` `full` |
| `fontSize` | `sm` `md` `lg` `xl` `2xl` |

### 2. 테마 팔레트 (`theme.js`)

`defineTheme`는 light/dark CSS 변수(`--som-theme-*`)를 만들고, style()에서 쓸 **핸들**을 반환합니다.

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

| 핸들 | 용도 |
|---|---|
| `theme.primary` | 브랜드 / 강조 |
| `theme.primaryHover` | primary 호버 |
| `theme.primaryFocus` | 포커스 링 |
| `theme.onPrimary` | primary 위 글자 |
| `theme.text` | 본문 글자 |
| `theme.textHeading` | 제목 |
| `theme.textMuted` | 덜 눈에 띄는 글자 |
| `theme.bg` | 페이지 배경 |
| `theme.surface` | 카드·패널 배경 |
| `theme.surfaceMuted` | 약한 면 |
| `theme.border` | 테두리 |
| `theme.borderStrong` | 강조 테두리 |
| `theme.success` | 성공 |
| `theme.danger` | 위험 |
| `theme.warning` | 경고 |
| `theme.mark` | 하이라이트 |

기존 `theme.js`에 없는 키는 `light` / `dark` 객체에 OKLCH 문자열 리터럴로 추가하면 됩니다.  
값은 `"oklch(0.35 0.02 var(--som-theme-hue))"`처럼 OKLCH 문자열을 직접 적습니다. `theme.js`에 키를 추가할 땐 `theme.hue`가 아닌, 자동 생성되는 CSS 변수 `var(--som-theme-hue)`와 같은 형태로 값을 정의하세요.

## 라이트 / 다크

첫 테마는 `theme.js`의 `defineTheme({ defaultTheme: "light" | "dark" })`로 정합니다.

```js
setTheme("dark"); // 테마 바꾸기
setTheme("light");

getTheme(); // 지금 테마: "light" | "dark"
```

테마 스위치 예:

```js
setTheme(getTheme() === "dark" ? "light" : "dark");
```

---

## SSR (서버에서 HTML을 먼저 조립할 때)

**필요한 경우:** JSP, Thymeleaf, SSR 프레임워크(SolidStart / Next 등)처럼 **서버가 HTML 문자열을 만들어 내려주는** 환경.  
서버에는 `document`가 없어서 som-style이 `<head>`에 스타일을 자동으로 넣을 수 없습니다.  
서버에서 `style()` / `defineTheme`가 돌면 CSS는 메모리 레지스트리에만 모이므로, 응답 HTML에 직접 넣어야 첫 화면 깜빡임(FOUC)이 없습니다.

문서 `<head>`에 한 번 넣습니다.

```jsx
<style id="som-server-styles" innerHTML={getCollectedStyles()} />
```

(프레임워크마다 속성이 다릅니다. React는 `dangerouslySetInnerHTML`, Solid는 `innerHTML` 등.)

**필요 없는 경우:**

- 브라우저에서만 화면을 그리는 SPA — 클라이언트에서 `document.head`에 자동 주입됩니다.
- Vite + `somStyle()` 플러그인 — 빌드 때 CSS로 추출되어 Vite가 HTML/번들에 넣습니다. (`getCollectedStyles` 불필요)

---

## 로컬 데모

이 저장소를 클론한 뒤:

```bash
git clone https://github.com/gidul0491/som-style-css.git
cd som-style-css
npm install
cd examples/vite
npm install
npm run dev
```

브라우저에서 안내된 주소(보통 `http://localhost:5173`)를 엽니다.

이 저장소 안 예제는 `file:../..`로 **방금 빌드한 로컬 패키지**를 씁니다.  
앱에서 쓸 때는 README 설치절처럼 `npm install som-style`로 설치하세요.

데모에서 바로 바꿀 파일:

- `examples/vite/main.js` — 레이아웃·문구
- `examples/vite/som-style/` — `config.js`, `theme.js`, `constant.js`, `components/`, (데모용) `style.js`

라이브러리 `src/`를 수정했다면 저장소 루트에서 `npm run build` 한 뒤 예제 dev를 새로고침하세요.
