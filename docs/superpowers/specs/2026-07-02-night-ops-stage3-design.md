# Night Ops Stage 3 — Tool-page consolidation (design)

**Date:** 2026-07-02
**Status:** Approved (scope: all three buckets — dedupe, shared extract, leave tool-specific alone)
**Parent spec:** `docs/superpowers/specs/2026-07-01-night-ops-redesign-design.md` (Stage 3, lines 53–54)

## Finding that reshaped the original scope

The original Stage 3 line ("migrate onto `.tool-shell`, consolidating 700–1200-line inline styles") overpromised. The two lookup pages' inline CSS is really three buckets:

1. **Dead duplication** already defined globally in `main.css` — the cookie-consent banner (~60 lines CSS) and `#header .logo img` size override are copy-pasted into `seniority-lookup.html`, `bid-award-lookup.html`, `privacy-policy.html`. `index.html` proves they're unneeded (it has neither and works). The consent **JS** (`grantAnalyticsConsent`/`denyAnalyticsConsent` + GA init) is likewise inlined in all 4 pages.
2. **Genuinely shared patterns** — input-section wrapper, input field, results show/hide. ~60–80 lines/page.
3. **Tool-specific widgets** — seat-cards, percentile chart, fun-facts (seniority) vs hold-risk gauges, award-summary, bid-popup, group-table (bid-award). Different tools, different UI. Forcing these into one component is wrong-DRY and pure regression risk.

## Scope

- **Bucket 1 (delete):** remove the duplicate cookie-banner CSS + `#header .logo img` override from the pages that carry them; extract consent JS to `assets/js/cookie-consent.js`, load via `<script src defer>` on all 4 pages (matches how `pilot-data.js`/`reveal.js` already load).
- **Bucket 2 (extract):** add `.tool-shell-input-section` / `.tool-shell-input` / `.tool-shell-results` to `main.css`'s NIGHT OPS section. Apply as **additive** classes next to each page's existing names (`class="seniority-input-section tool-shell-input-section"`) so page JS `querySelector`s keep working, then delete the now-redundant per-page rules. One revertible commit per page.
- **Bucket 3 (leave):** tool-specific widget CSS stays inline, untouched.
- Plus, from the parent spec: bid-award results table gets an `overflow-x` wrapper; the "Step 1/Step 2" + seniority intro become collapsed `<details>` "How this works" (always collapsed, one-line summary); privacy policy gets `id`s on its 9 `<h2>`s and a TOC anchor list under the title.

## Non-goals

- No shared HTML templating / chrome injection (static site, no build step — out of scope, deferred with Direction C).
- No merging of tool-specific widget CSS.
- No footer templating beyond the shared cookie banner; each page's own footer content stays.

## Process

CSS/markup on a static site with no test framework → the safety net is the preview browser, not unit tests. Implement directly (no multi-agent pipeline). After each touched page: preview at 375px + desktop, light + dark, console clean, and — critically — the lookups must still return correct results (spot-check a seniority number and a bid group; the additive-class approach exists precisely to protect those JS hooks). Branch `redesign/night-ops-stage3`; never push to production without explicit approval. Bump `?v=` on the CSS/HTML per the cache lesson.

## Risks

- A deleted "duplicate" that wasn't identical (different value than main.css) → diff each block against main.css before cutting; the banner CSS already verified byte-identical except `#18bfef` → `var(--color-info)` (same value).
- An additive class colliding with an existing rule's specificity → verify each lookup renders identically before/after via screenshots.
- Consent JS extraction changing load timing (was inline in `<head>`, becomes deferred external) → verify the banner still appears for a fresh visitor and Accept/Decline still work.
