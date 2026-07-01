# CrewLu Website "Night Ops" Redesign — Design Spec

Date: 2026-07-01
Status: Approved (Direction B, staged rollout)

## Goal

Modernize crewlu.net so it reads as one brand with globe.crewlu.net and the CrewLu iOS app: a dark, night-flying "glass cockpit" aesthetic built on the existing clu-portal globe card's visual language. Kill every 2017 HTML5UP-Massively fingerprint (serif justified type, ALL-CAPS 900 headings, preload blackout, four competing accent palettes, four button styles) and the extreme asset weight (10.6MB favicon, 12.5MB logo, multi-MB PNG screenshots, no OG cards).

## Constraints

- Static site, no build step, deployed by pushing `main` to GitHub Pages.
- `assets/css/main.css` is compiled template CSS **plus hand edits — never recompile Sass**. All CSS work is direct edits/appends to main.css.
- The clu-portal globe CTA card is beloved: build on it, never remove it.
- Audience: freight pilots, mostly on iPhones/iPads, often on cellular. Mobile-first; respect `prefers-reduced-motion`.
- Solo maintainer: prefer CSS over JS; any new JS must be small, vanilla, and dependency-free.
- Work happens on branch `redesign/night-ops`. **No push to `main` (= production deploy) without explicit user go-ahead.**

## Design decisions

- **Dark-first, always dark.** The site commits to the night-sky navy palette in both OS modes (like globe.crewlu.net). The existing `prefers-color-scheme: light` overrides are superseded; dormant `[data-theme]` toggle selectors are deleted. `color-scheme: dark` is declared so form controls match.
- **Palette** (from the clu-portal, single source of truth as CSS custom properties):
  - Ink/background ramp: `#04111f` page edge → `#0a1420` canvas → `#0c1c2c` panel ink → `#11212f` cards
  - Accent cyan `#18bfef`, active green `#33e07a`, warm amber `#ffa500` (CTA), alert `#ff6b6b`
  - Hairlines/glass: `rgba(120,200,255,.14)` borders, `rgba(255,255,255,.04)` panel fill
- **Type**: body = system stack (`-apple-system, system-ui`) → SF Pro on Apple devices, left-aligned, line-height ~1.6. Display/headings = `Space Grotesk` (Google Fonts v2 `<link>` with preconnect + `display=swap`, replacing the render-blocking `@import`). Data/readouts = `ui-monospace` with `font-feature-settings: "tnum"`. Sentence case everywhere; retire `text-transform: uppercase` headings.
- **Components**:
  - One button system: pill (999px), primary = amber gradient (`linear-gradient(135deg,#ff6b6b,#ffa500)`), secondary = cyan ghost. Replaces template buttons, `.clu-go`, `.beta-import-jump`, `.consent-btn` variants.
  - Frosted panel: `rgba(255,255,255,.04)` + `backdrop-filter: blur(14px)` + 1px `rgba(120,200,255,.14)` border + 1.25rem radius, replacing the white `.post` article cards.
  - HUD voice: `.hud-kicker` (11px Space Grotesk, `.16em` tracking, cyan, blinking green dot reusing `@keyframes cluBlink`) above section headings; `.hud-readout` (monospace green) for numbers.
  - `.tool-shell`: shared dark instrument-panel component for the lookup tools (input, labels, results cards), replacing their per-page inline CSS over time.
  - Course-line divider: dashed-cyan rule with amber diamond waypoint, replacing `<hr>`.
- **Motion**: instant paint (no `is-preload` overlay). IntersectionObserver adds `.is-in` for a 16px-rise + fade reveal with ~80ms stagger; all motion inside `@media (prefers-reduced-motion: no-preference)`. `@view-transition { navigation: auto }` for free cross-fades in Safari 18.2+/Chrome 126+.
- **Hero**: night-sky CSS starfield (layered radial-gradient tiles, zero image bytes), HUD kicker, sentence-case headline, App Store + globe CTAs. Logo replaced with a right-sized WebP (dark variant).

## Staged scope

### Stage 0 — Quick wins (ship first, valuable under any direction)
1. Favicon set (32/180/192/512 from the 4395px source) + `manifest.webmanifest` + `theme-color #0c1c2c`; remove the 10.6MB favicon from the load path.
2. OG/social cards: one 1200×630 dark JPEG (<200KB) with the cyan-arc motif; `og:image/og:url/og:title/og:description/twitter:card` on all six pages + sub-sites.
3. Remove `is-preload` blackout everywhere.
4. Image triage: resize header logo (~1600px WebP + PNG fallback), point feature cards at the smaller optimized twins already on disk, `loading="lazy"` + dimensions on galleries. (The pilot-window star-gazer/cloud-level bug is spun off as its own task.)
5. Script hygiene: remove duplicate Chart.js load (seniority-lookup), `defer` pilot-data.js + tool scripts.
6. main.css: verify and cut the duplicated ~4,000-line template block; fix the broken Sass `rgb(11.15…)` artifact; bump every page to a single `?v=` version.
7. HTML hygiene: `lang="en"` everywhere, drop `user-scalable=no`, local App Store badge on sub-sites.

### Stage 1 — Contrail layer (type/tokens/buttons/motion)
Type swap, palette unification onto the night-flight tokens, one pill button system, instant paint + IO reveal, `clamp()` spacing tokens, View Transitions. Site still light-shelled at the end of this stage but all 2017 signals gone.

### Stage 2 — Night Ops shell
Dark tokens + `color-scheme: dark`, frosted panels replace white cards, starfield hero, HUD kicker/readout voice on index + import, course-line dividers, cookie banner tokenized, `theme-color` metas, nav restyle (translucent dark bar). Feature grid keeps mobile scroll-snap; desktop gets a responsive grid.

### Stage 3 — Tool pages as instrument panels
`.tool-shell` component in main.css; seniority-lookup and bid-award-lookup migrate onto it (consolidating their 700–1200-line inline styles); instruction walls become `<details>` "How this works"; bid table gets `overflow-x` wrapper; privacy policy restyled minimally (tokens + TOC anchor list); sub-sites get the dark shell via their shared styles.

### Out of scope (future, post-review)
Direction C items: globe-as-hero promotion, CSS iPhone frame, ACARS typing entrance, card tilt physics, bento grid, chrome-injection JS, jQuery removal (beyond what Stage 1 motion already replaces), altitude-tape scroll bar.

## Verification

Each stage: run the local preview server, check every touched page at mobile (375px) and desktop widths, dark rendering, `prefers-reduced-motion`, console errors, and take screenshots. Lookup tools must still return correct results (spot-check a seniority number and a bid group). No push to production until the user reviews.

## Risks

- Dark-on-dark: app screenshots are dark; frosted borders/glows must carry separation — verify visually per card.
- main.css dedupe: must diff-verify the block is a true duplicate before cutting; ship as its own commit for easy revert.
- Safari cache (4h max-age on main.css): every HTML page must reference the new `?v=` in the same commit as CSS changes.
