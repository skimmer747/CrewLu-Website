# Night Ops Redesign Implementation Plan (Stages 0–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Stages 0–2 of the Night Ops redesign spec (`docs/superpowers/specs/2026-07-01-night-ops-redesign-design.md`): quick wins, then the Contrail type/token/button/motion layer, then the dark glass-cockpit shell. Stage 3 (tool-page `.tool-shell` migration) gets its own follow-up plan.

**Architecture:** All CSS work is direct edits to `assets/css/main.css` (never recompile Sass) — fixes in place for broken values, one appended `NIGHT OPS` section at the end of the file for all new design-system code. HTML edits touch the six root pages and three sub-site pages. One new JS file (`assets/js/reveal.js`, vanilla, ~25 lines). Verification is via the local preview server (`dev` config, :8000) since there is no test framework — every task ends with a concrete check command or preview assertion.

**Tech Stack:** Static HTML/CSS, `sips` for image work (no cwebp on this machine), Google Fonts v2 (Space Grotesk), IntersectionObserver, View Transitions API (progressive), GitHub Pages.

**Branch:** `redesign/night-ops`. Never push without explicit user approval (push = production deploy).

**Line-number caution:** main.css line refs below are pre-dedupe. Task 1 removes ~4,030 lines, shifting everything after it. Tasks after Task 1 locate code by *pattern*, not line number.

---

## Stage 0 — Quick wins

### Task 1: main.css dedupe + broken Sass artifact

**Files:** Modify: `assets/css/main.css`

- [ ] **Step 1: Verify the duplicate block is a true duplicate**

```bash
sed -n '3,4032p' assets/css/main.css > /tmp/blockA
sed -n '4033,8062p' assets/css/main.css > /tmp/blockB
diff /tmp/blockA /tmp/blockB | head -30
```
Expected: differences confined to the two `@import` lines (present in block A only) and possibly trailing whitespace. If substantive rule differences appear, STOP — adjust the cut range so only true duplicates are removed, or skip the cut and report.

- [ ] **Step 2: Cut the duplicate block**

Adjust the range so the cut starts at the second `/*\n\tMassively by HTML5 UP` comment and ends on the line before the `/* Wrapper */` custom section (found in Step 1's diff alignment; nominal range 4033–8060):

```bash
sed -i '' '4033,8060d' assets/css/main.css
grep -c "Massively by HTML5 UP" assets/css/main.css   # expect 1
grep -c "/\* Wrapper \*/" assets/css/main.css          # expect >=1 (custom section survived)
```

- [ ] **Step 3: Fix the unresolved Sass hover artifact**

Find and replace (Edit tool, pattern-based):

```css
/* before */
  background-color: rgb(11.1512195122, 99.1219512195, 242.8487804878);
/* after */
  background-color: #2563eb;
```

- [ ] **Step 4: Sanity-check render**

Start preview (`dev`), load `http://localhost:8000/`, confirm no visual difference and no console errors.

- [ ] **Step 5: Commit**

```bash
git add assets/css/main.css
git commit -m "Cut duplicated 4k-line template block from main.css; fix Sass rgb artifact"
```

### Task 2: Favicon set, web manifest, theme-color

**Files:** Create: `images/favicon-32.png`, `images/apple-touch-icon.png`, `images/favicon-192.png`, `images/favicon-512.png`, `manifest.webmanifest`. Modify: `<head>` of `index.html`, `import.html`, `seniority-lookup.html`, `bid-award-lookup.html`, `privacy-policy.html`, `crewluve/index.html`, `pilot-window/index.html`, `turbometer/index.html`.

- [ ] **Step 1: Generate sizes from the 4395px source**

```bash
sips -Z 32  images/favicon.png --out images/favicon-32.png
sips -Z 180 images/favicon.png --out images/apple-touch-icon.png
sips -Z 192 images/favicon.png --out images/favicon-192.png
sips -Z 512 images/favicon.png --out images/favicon-512.png
ls -la images/favicon-32.png images/favicon-512.png   # expect ~1-40KB each
```

- [ ] **Step 2: Create `manifest.webmanifest`**

```json
{
  "name": "CrewLu",
  "short_name": "CrewLu",
  "description": "Roster management tools for freight pilots",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0c1c2c",
  "theme_color": "#0c1c2c",
  "icons": [
    { "src": "/images/favicon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/images/favicon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Replace favicon links in every `<head>`**

Root pages get (sub-sites use `../images/...` and `../manifest.webmanifest`):

```html
<link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png" />
<link rel="apple-touch-icon" href="images/apple-touch-icon.png" />
<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="#0c1c2c" />
```

Remove all references to `images/favicon.png?v=4` / `?v=3`.

- [ ] **Step 4: Verify** — `grep -rn "favicon.png?v" *.html */index.html` returns nothing; preview loads with new favicon.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Proper favicon set + web manifest + theme-color (drops 10.6MB favicon from every page)"`

### Task 3: OG social card + meta on all pages

**Files:** Create: `images/og-card.jpg`. Modify: `<head>` of all nine pages.

- [ ] **Step 1: Build the 1200×630 card with sips (dark logo centered on navy)**

```bash
sips -Z 900 "images/Crewlu big App Logo opaque Dark mode.png" --out /tmp/og-logo.png
sips /tmp/og-logo.png --padToHeightWidth 630 1200 --padColor 0C1C2C \
     -s format jpeg -s formatOptions 85 --out images/og-card.jpg
sips -g pixelWidth -g pixelHeight images/og-card.jpg   # expect 1200 x 630
ls -la images/og-card.jpg                               # expect < 200KB
```
If the logo's aspect makes 900px too tall for 630, drop to `-Z 500` and re-pad.

- [ ] **Step 2: Add meta to every page** (values vary per page; index example — absolute URLs required for OG):

```html
<meta property="og:url" content="https://crewlu.net/" />
<meta property="og:image" content="https://crewlu.net/images/og-card.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

Pages missing `og:title`/`og:description` (all except index) also get those, with page-appropriate copy: import = "How to import your schedule into CrewLu", seniority = "UPS pilot seniority lookup", bid-award = "Bid award summary lookup", privacy = "CrewLu privacy policy", crewluve = "Crewluve", pilot-window = "Pilot Window — AR flight deck companion", turbometer = "Turbometer".

- [ ] **Step 3: Verify** — `grep -c "og:image" *.html */index.html` shows 1 per page.

- [ ] **Step 4: Commit** — `git commit -am "Add OG/Twitter social cards site-wide"`

### Task 4: Instant paint — remove is-preload

**Files:** Modify: `index.html`, `import.html`, `privacy-policy.html`, `crewluve/index.html`, `pilot-window/index.html`, `turbometer/index.html`

- [ ] **Step 1:** In each file change `<body class="is-preload">` to `<body>`.
- [ ] **Step 2:** `grep -rn "is-preload" *.html */index.html` → no body-tag hits (JS/CSS references may remain; they're inert).
- [ ] **Step 3:** Preview: content paints immediately, no black overlay. Note for later stages: `#wrapper.fade-in` animation still runs — acceptable at this stage.
- [ ] **Step 4: Commit** — `git commit -am "Remove is-preload blackout: content paints instantly"`

### Task 5: Image diet — logo + index feature cards + lazy galleries

**Files:** Create: `images/logo-light-1600.png`, `images/logo-dark-1600.png`, `images/TripListView-optimized.jpg`, `images/NewTripListView.jpg`, `images/Timeline-optimized.jpg`. Modify: `index.html` (intro + header + feature card srcs), any other root page referencing `Crewlu big App Logo`, `crewluve/index.html` (lazy).

- [ ] **Step 1: Resize logos**

```bash
sips -Z 1600 "images/Crewlu big App Logo opaque.png" --out "images/logo-light-1600.png"
sips -Z 1600 "images/Crewlu big App Logo opaque Dark mode.png" --out "images/logo-dark-1600.png"
ls -la images/logo-*.png   # expect well under 1MB each (from 12.5MB)
```

- [ ] **Step 2: Convert the three PNG screenshots that lack jpg twins**

```bash
for f in TripListView-optimized NewTripListView Timeline-optimized; do
  sips -Z 900 -s format jpeg -s formatOptions 82 "images/$f.png" --out "images/$f.jpg"
done
```
(`DutyDetailsOne-optimized.jpg` and `JumpseatDetails-optimized.jpg` already exist — just re-point.)

- [ ] **Step 3: Update srcs** — `grep -rn "Crewlu big App Logo" *.html */index.html` and re-point every hit to the 1600px variants; in `index.html` re-point the five PNG feature-card/dashboard images to their `.jpg` twins; add `loading="lazy"` + `width`/`height` attributes to `crewluve/index.html` gallery imgs.

- [ ] **Step 4: Verify** — preview index: all images render; `du -sh` spot-check that no page-served image exceeds ~1.2MB.

- [ ] **Step 5: Commit** — `git commit -am "Image diet: 1600px logos, JPEG screenshots, lazy galleries"`

### Task 6: Script hygiene on lookup pages

**Files:** Modify: `seniority-lookup.html`, `bid-award-lookup.html`

- [ ] **Step 1:** In `seniority-lookup.html` delete the second, unpinned Chart.js `<script>` (near line 981); keep the pinned `chart.umd.min.js@4.4.0` load (near line 100).
- [ ] **Step 2:** Add `defer` to: Chart.js, `assets/js/pilot-data.js`, and the page's lookup script on both pages. `defer` preserves order, so globals still define in sequence. If either page has *inline* scripts that read those globals at parse time, wrap the inline code in `DOMContentLoaded` instead of deferring its dependencies — check first with a grep for the global names (`PILOT_DATA`, `Chart`).
- [ ] **Step 3: Verify in preview:** seniority lookup for #1290 returns a result and the chart renders; bid-award lookup returns a group; zero console errors.
- [ ] **Step 4: Commit** — `git commit -am "Dedupe Chart.js, defer heavy data scripts on lookup pages"`

### Task 7: HTML hygiene sweep + cache-version bump

**Files:** Modify: all nine pages (+ `test-theme.html` where trivial)

- [ ] **Step 1:** `<html>` → `<html lang="en">` everywhere (bid-award already has it).
- [ ] **Step 2:** Every viewport meta → `<meta name="viewport" content="width=device-width, initial-scale=1" />` (drop `user-scalable=no`).
- [ ] **Step 3:** In `pilot-window/index.html` and `turbometer/index.html`, replace hotlinked `toolbox.marketingtools.apple.com` badge imgs with `../images/app-store-badge.svg` (exists, 12KB).
- [ ] **Step 4:** Bid table mobile: append to `bid-award-lookup.html`'s inline `<style>`:

```css
@media (max-width: 736px) {
  .group-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
}
```

- [ ] **Step 5:** Every `main.css` link → `assets/css/main.css?v=5` (root) / `../assets/css/main.css?v=5` (sub-sites).
- [ ] **Step 6: Verify** — `grep -rn "user-scalable" *.html */index.html` empty; `grep -rn "main.css" *.html */index.html` all show `?v=5`.
- [ ] **Step 7: Commit** — `git commit -am "HTML hygiene: lang, pinch-zoom, local badges, table scroll, css cache bump"`

**Stage 0 checkpoint:** preview-verify all pages desktop + 375px mobile, console clean. Screenshot index for the report.

---

## Stage 1 — Contrail layer (type, tokens, buttons, motion)

### Task 8: Font loading swap

**Files:** Modify: `assets/css/main.css` (delete Merriweather `@import`), all nine pages (`<head>`)

- [ ] **Step 1:** Delete from main.css: `@import url("https://fonts.googleapis.com/css?family=Merriweather:300,700,300italic,700italic|Source+Sans+Pro:900");`
- [ ] **Step 2:** Add to every `<head>` before the main.css link:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" />
```

- [ ] **Step 3: Verify** — preview: no Merriweather in DevTools computed styles after Task 9; network shows single fonts.googleapis.com css2 request. (Rendering will look mixed until Task 9 lands — commit together with Task 9 if preferred.)
- [ ] **Step 4: Commit** — `git commit -am "Replace render-blocking Merriweather @import with Space Grotesk v2 link"`

### Task 9: NIGHT OPS append block — tokens + type system

**Files:** Modify: `assets/css/main.css` (append at end of file)

- [ ] **Step 1: Locate the existing token block** — `grep -n ":root" assets/css/main.css | head` and `grep -n "color-accent" assets/css/main.css | head` to learn the live custom-property names (audit says `--color-accent: #3b82f6` exists). The append block below re-points them; adjust names to match what the grep finds.

- [ ] **Step 2: Append section header + tokens + type** (this is the single NIGHT OPS section all later tasks extend):

```css
/* ============================================================
   NIGHT OPS design layer (2026-07) — hand-written, keep LAST.
   Never recompile Sass over this file.
   ============================================================ */
:root {
  --no-ink-0: #04111f;
  --no-ink-1: #0a1420;
  --no-ink-2: #0c1c2c;
  --no-ink-3: #11212f;
  --no-cyan: #18bfef;
  --no-green: #33e07a;
  --no-amber: #ffa500;
  --no-coral: #ff6b6b;
  --no-hairline: rgba(120, 200, 255, 0.14);
  --no-glass: rgba(255, 255, 255, 0.04);
  --no-font-display: "Space Grotesk", -apple-system, system-ui, sans-serif;
  --no-font-body: -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif;
  --no-font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
  --no-space-s: clamp(0.75rem, 2vw, 1.25rem);
  --no-space-m: clamp(1.25rem, 3vw, 2rem);
  --no-space-l: clamp(2rem, 5vw, 3.5rem);
  --no-text-hero: clamp(1.9rem, 5.5vw, 3.25rem);
  --color-accent: var(--no-cyan);
}
body, input, select, textarea {
  font-family: var(--no-font-body);
  font-weight: 400;
  line-height: 1.65;
}
p { text-align: left; }
h1, h2, h3, h4, h5, h6,
#nav ul.links, .button, input[type="submit"] {
  text-transform: none;
  letter-spacing: normal;
}
h1, h2, h3, h4, h5, h6 {
  font-family: var(--no-font-display);
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.15;
}
article.post header.major h2, .post.featured header.major h2 {
  font-size: clamp(1.9rem, 5vw, 3rem);
}
header.major h2 + p {
  font-style: normal;
  font-size: 1.05rem;
  color: inherit;
}
#intro h1 { font-size: var(--no-text-hero); }
code, pre { font-family: var(--no-font-mono); }
```

- [ ] **Step 3: Specificity sweep** — `grep -n "text-transform: uppercase" assets/css/main.css` and for any selector that still wins over the block above (e.g. `#nav ul.links li a`, `.button`), add a matching-specificity `text-transform: none` line inside the NIGHT OPS section. Preview and confirm no ALL-CAPS text remains on index.
- [ ] **Step 4: Verify** — index + import in preview: body renders in system font (SF Pro), headings in Space Grotesk, no justified text (`preview_inspect` on a `p` → `text-align: left`).
- [ ] **Step 5: Commit** — `git commit -am "NIGHT OPS layer: night-flight tokens + modern type system"`

### Task 10: One button system

**Files:** Modify: `assets/css/main.css` (extend NIGHT OPS section)

- [ ] **Step 1: Append**

```css
.button, input[type="submit"], input[type="reset"], input[type="button"] {
  border-radius: 999px;
  font-family: var(--no-font-display);
  font-weight: 600;
  font-size: 0.85rem;
  letter-spacing: 0.01em;
  height: 3em;
  line-height: 3em;
  padding: 0 1.75em;
  box-shadow: inset 0 0 0 2px var(--no-cyan);
  color: var(--no-cyan);
}
.button:hover { background-color: rgba(24, 191, 239, 0.08); }
.button.primary, #intro .button.primary {
  background: linear-gradient(135deg, var(--no-coral), var(--no-amber));
  color: #2a1600;
  box-shadow: 0 10px 24px -10px rgba(255, 140, 0, 0.55);
}
.button.primary:hover, #intro .button.primary:hover {
  background: linear-gradient(135deg, var(--no-coral), var(--no-amber));
  filter: brightness(1.08);
}
.consent-btn { border-radius: 999px; font-family: var(--no-font-display); }
.consent-btn-accept { background: var(--no-cyan); color: #04111f; }
.beta-import-jump { border-radius: 999px; }
```

- [ ] **Step 2: Verify** — preview index (both intro buttons), import page (jump buttons), cookie banner (clear localStorage key `crewlu_analytics_consent` via `preview_eval` to force it visible): all pills, primary is amber gradient.
- [ ] **Step 3: Commit** — `git commit -am "One pill button system replacing four button styles"`

### Task 11: Scroll-reveal motion (replaces preload theatrics)

**Files:** Create: `assets/js/reveal.js`. Modify: `assets/css/main.css`, `index.html` + `import.html` (script tag)

- [ ] **Step 1: Create `assets/js/reveal.js`**

```js
(function () {
  var mql = window.matchMedia('(prefers-reduced-motion: no-preference)');
  if (!('IntersectionObserver' in window) || !mql.matches) return;
  document.documentElement.classList.add('reveal-ready');
  var els = document.querySelectorAll('#main .post, .feature-card, .clu-portal, #main header.major');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 80 + 'ms';
    io.observe(el);
  });
})();
```

- [ ] **Step 2: Append CSS** (only hides content when `.reveal-ready` was set by JS — no-JS and reduced-motion users always see everything):

```css
.reveal-ready #main .post, .reveal-ready .feature-card,
.reveal-ready .clu-portal, .reveal-ready #main header.major {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.reveal-ready .is-in { opacity: 1; transform: none; }
```

- [ ] **Step 3:** Add `<script src="assets/js/reveal.js" defer></script>` before `</body>` on `index.html` and `import.html`.
- [ ] **Step 4: Verify** — preview index: cards rise in as you scroll; with `preview_eval` emulation unavailable for reduced-motion, verify by checking the CSS is gated on `.reveal-ready`; no layout shift on load.
- [ ] **Step 5: Commit** — `git commit -am "IntersectionObserver scroll-reveal, reduced-motion safe"`

### Task 12: View transitions + rhythm

**Files:** Modify: `assets/css/main.css`

- [ ] **Step 1: Append**

```css
@view-transition { navigation: auto; }
#header .logo { view-transition-name: clu-logo; }
#main > .post, .post.featured { padding: var(--no-space-l) var(--no-space-m); }
```

- [ ] **Step 2: Verify** — navigate index → import in preview (Chrome): soft cross-fade; content padding breathes at mobile width without horizontal scroll.
- [ ] **Step 3: Commit** — `git commit -am "View transitions + fluid spacing rhythm"`

**Stage 1 checkpoint:** full-page screenshots of index + import, desktop + mobile. All 2017 type/palette/button signals should be gone; site still light-shelled.

---

## Stage 2 — Night Ops shell (dark)

### Task 13: Dark-first shell + tool-page light-override neutralization

**Files:** Modify: `assets/css/main.css`, `seniority-lookup.html`, `bid-award-lookup.html`

- [ ] **Step 1: Discover current token/dark-mode structure** — `grep -n "prefers-color-scheme" assets/css/main.css` and read the existing dark `:root` block to get exact variable names before overriding.

- [ ] **Step 2: Append the dark shell** (adjust var names to match Step 1 findings):

```css
html { color-scheme: dark; }
body {
  background:
    radial-gradient(1200px 600px at 50% -10%, #14304a 0%, rgba(20, 48, 74, 0) 60%),
    linear-gradient(180deg, var(--no-ink-0) 0%, var(--no-ink-1) 45%, var(--no-ink-1) 100%);
  background-attachment: fixed;
  color: #d7e6f2;
}
#wrapper { background: transparent; }
:root {
  --color-bg: var(--no-ink-0);
  --color-card-bg: var(--no-ink-3);
  --color-border: var(--no-hairline);
  --color-text: #d7e6f2;
  --color-text-muted: #8fb8cf;
}
.logo-light { display: none !important; }
.logo-dark { display: inline-block !important; }
```

- [ ] **Step 3: Neutralize lookup pages' light-mode override blocks** — in both lookup pages' inline `<style>`, replace every `@media (prefers-color-scheme: light)` with `@media not all` (never matches; their dark-first base styles apply for everyone; trivially reversible in Stage 3's real consolidation).

- [ ] **Step 4: Verify** — every page in preview with `preview_resize` colorScheme light AND dark: navy shell either way, no white flash, lookup pages consistent, text contrast readable (spot `preview_inspect` on body + a muted paragraph).

- [ ] **Step 5: Commit** — `git commit -am "Dark-first night-sky shell, color-scheme dark, neutralize tool-page light overrides"`

### Task 14: Starfield hero

**Files:** Modify: `assets/css/main.css`, `index.html` (intro markup)

- [ ] **Step 1: Append**

```css
#intro {
  position: relative;
  background: linear-gradient(180deg, var(--no-ink-0), var(--no-ink-2) 60%, #13476f 160%);
}
#intro::before, #intro::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(1px 1px at 20px 30px, rgba(255, 255, 255, 0.8), transparent 60%),
    radial-gradient(1px 1px at 90px 130px, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.5px 1.5px at 160px 80px, rgba(120, 200, 255, 0.7), transparent 60%),
    radial-gradient(1px 1px at 200px 190px, rgba(255, 255, 255, 0.4), transparent 60%);
  background-size: 240px 240px;
}
#intro::after { background-size: 380px 380px; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  #intro::before { animation: noDrift 120s linear infinite; }
  #intro::after { animation: noDrift 200s linear infinite reverse; }
}
@keyframes noDrift { to { background-position: 240px 480px; } }
#intro > * { position: relative; z-index: 1; }
#intro p { color: #8fb8cf; }
.hud-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  font: 600 11px/1 var(--no-font-display);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--no-cyan);
}
.hud-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--no-green);
}
@media (prefers-reduced-motion: no-preference) {
  .hud-dot { animation: cluBlink 2.4s infinite; }
}
```
(`@keyframes cluBlink` already exists in the clu-portal section — verify with `grep -n "cluBlink" assets/css/main.css`; if scoped oddly, duplicate it inside the NIGHT OPS section.)

- [ ] **Step 2: Intro markup** — in `index.html` add above the logo: `<p class="hud-kicker"><span class="hud-dot"></span>CrewLu &middot; Flight ops</p>`; the logo imgs stay (dark variant shows via Task 13 rules).
- [ ] **Step 3: Verify** — preview: starfield behind intro, drifting; kicker cyan with blinking dot; buttons legible on navy.
- [ ] **Step 4: Commit** — `git commit -am "Pure-CSS starfield hero with HUD kicker"`

### Task 15: Frosted panels, nav, cards, footer

**Files:** Modify: `assets/css/main.css`

- [ ] **Step 1: Locate the white-card styles** — `grep -n "post featured\|\.post {" assets/css/main.css | head` and check for a `border-top` accent stripe on `.post.featured`.

- [ ] **Step 2: Append**

```css
#main > .post, .post.featured {
  background: var(--no-glass);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid var(--no-hairline);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}
#nav {
  background: rgba(10, 20, 32, 0.7);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--no-hairline);
}
#nav ul.links li a { color: #8fb8cf; }
#nav ul.links li.active a, #nav ul.links li a:hover { color: var(--no-cyan); }
.feature-card {
  background: var(--no-glass);
  border: 1px solid var(--no-hairline);
  border-radius: 12px;
}
.feature-card h4 { color: #ffffff; }
.feature-card p { color: #8fb8cf; }
#footer, #copyright { color: #8fb8cf; }
#footer a { color: var(--no-cyan); }
```

- [ ] **Step 3: Specificity check** — if the template's `.post` background/border rules win, raise the override's specificity (`body #main > .post`) rather than using `!important`. If `.post.featured` has an accent `border-top`, override it to `1px solid var(--no-hairline)`.
- [ ] **Step 4: Verify** — index in preview: frosted panels over navy, screenshots separated from card bg (dark-on-dark check!), nav translucent on scroll. If screenshots melt into cards, add `.card-image img { border: 1px solid var(--no-hairline); border-radius: 8px; }`.
- [ ] **Step 5: Commit** — `git commit -am "Frosted glass panels, translucent nav, dark cards + footer"`

### Task 16: HUD section voice + course-line dividers + grid desktop

**Files:** Modify: `assets/css/main.css`, `index.html`

- [ ] **Step 1: Append**

```css
.hud-readout {
  font-family: var(--no-font-mono);
  font-feature-settings: "tnum";
  color: var(--no-green);
}
.feature-grid-title { color: #ffffff; }
.course-line {
  display: flex;
  align-items: center;
  border: 0;
  margin: var(--no-space-l) 0;
}
.course-line::before, .course-line::after {
  content: "";
  flex: 1;
  border-top: 1px dashed rgba(24, 191, 239, 0.35);
}
.course-line > span {
  width: 7px;
  height: 7px;
  background: var(--no-amber);
  transform: rotate(45deg);
  margin: 0 10px;
}
@media (min-width: 737px) {
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    overflow: visible;
  }
}
```

- [ ] **Step 2: index.html markup** — above each `feature-grid-title` add a kicker (`<p class="hud-kicker"><span class="hud-dot"></span>App features</p>`, `…Dashboard views</p>`); between the two `feature-grid-section`s insert `<div class="course-line" role="separator"><span></span></div>`.
- [ ] **Step 3: Verify** — desktop: cards in a grid, no scrollbar band; 375px: original scroll-snap strip intact (`preview_resize` both ways).
- [ ] **Step 4: Commit** — `git commit -am "HUD section voice, course-line dividers, desktop feature grid"`

### Task 17: Cookie banner on tokens

**Files:** Modify: `assets/css/main.css`

- [ ] **Step 1:** In the existing cookie-banner block (`grep -n "cookie-consent-banner" assets/css/main.css`), replace hardcoded `#18bfef` with `var(--no-cyan)`, bg with `var(--no-ink-2)`, border with `var(--no-hairline)`. (Button shapes already handled by Task 10.)
- [ ] **Step 2: Verify** — clear consent key via `preview_eval` (`localStorage.removeItem('crewlu_analytics_consent'); location.reload()`), banner appears styled to palette.
- [ ] **Step 3: Commit** — `git commit -am "Cookie banner on NIGHT OPS tokens"`

### Task 18: Full-site verification sweep + screenshots

- [ ] **Step 1:** Every page (9) × {desktop, 375px} in preview: console errors zero, no horizontal scroll, no unreadable contrast (spot-check muted text ≥ ~4.5:1 against panel), lookup tools functionally verified again (seniority #1290, one bid group), import wizard interactions still work.
- [ ] **Step 2:** Screenshot index (hero + features), import, seniority-lookup for the final report.
- [ ] **Step 3:** `git status` clean; branch log reads as one commit per task.
- [ ] **Step 4:** Report to user with screenshots; **do not push** — offer merge/deploy as their call.

---

## Self-review notes

- Spec coverage: Stage 0 items 1–7 → Tasks 2,3,4,5,6,1,7. Stage 1 → Tasks 8–12. Stage 2 → Tasks 13–17 (+18 verification). Stage 3 deliberately deferred (own plan). Theme-color lands in Task 2 (spec lists it in both stages — done once).
- The `--color-accent` re-point (Task 9) intentionally precedes the cookie-banner cleanup (Task 17); interim mixed accents are acceptable within a stage.
- All line numbers after Task 1 are treated as patterns, not offsets (dedupe shifts everything).
