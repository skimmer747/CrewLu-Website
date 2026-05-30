# Import Page — v2.2.0 Beta Section Design

**Date:** 2026-05-30
**Page:** `import.html`
**Status:** Draft for review

## Goal

Introduce two new in-app import methods — **Screenshot Import** and **PDF Import** — on the public-facing How to Import page. The section must serve two purposes at once:

1. **Announce** the v2.2.0+ beta features to drive awareness.
2. **Reference** the same beta-tips content that appears in the app, so users troubleshooting on a Mac, iPad, or EFK can read the guidance on the web without launching Crewlu.

## Non-Goals

- Do **not** wire Screenshot or PDF into the existing `import-workflow.json` wizard. They are new in-app methods, not new wizard branches.
- No JavaScript additions. The page stays static; only anchor links are used.
- No third-party device-frame assets or new JS libraries.

## Placement

Inside `<section class="post">` on `import.html`, the new `<section class="beta-import-section">` sits **between** the existing EFK disclaimer `<div class="box">` and the `<div class="import-wizard">` container. This gives the new methods prime real estate above the wizard without burying the wizard for users who still need it.

## Structure

The section has three stacked parts.

### Part 1 — Hero Panel

- Section header: `<h2>` "New in v2.2.0 — Import in seconds" with a brand-purple pill badge reading `Beta` next to it. A small version chip below reads `v2.2.0+`.
- Subhead paragraph: *"Crewlu can now read your schedule straight off a screenshot or a PDF. Tap the button in the app — we'll do the rest."*
- Two-column flex layout (`.beta-import-hero`):
  - **Visual column** — CSS-only phone-frame wrapper around a screenshot of the in-app Import Schedule sheet. Two floating callout chips, absolutely positioned, point at the orange Screenshot button and green PDF button with dotted SVG arrow lines. Callout labels: `Beta · Screenshot` and `Beta · PDF`.
  - **Copy column** — short summary + two anchor buttons styled like existing site CTAs:
    - "How Screenshot works ↓" → `#screenshot-import`
    - "How PDF works ↓" → `#pdf-import`

### Part 2 — Deep-Dive Cards

Two `<article>` cards, each anchored, each with a colored left border and a row-based content layout that mirrors the in-app beta sheets (lightly tightened for web).

**Screenshot Import card** — `id="screenshot-import"`, orange accent (`#FF8C42`)

Rows (each is a small icon + bold label + body):
- **How to Import** — Zoom your schedule as large as it'll go, crop out clutter, take a screenshot, and either save it to Photos or AirDrop it to your iPhone. On the EFK use Safari (not Edge — it blocks screenshots). Then open Crewlu and tap the orange Screenshot button.
- **Supported Formats** — Try anything. Most layouts work.
- **For Best Results** — In Zscaler, screenshots from Safari on the EFK are most accurate, followed by Mac, then personal iPad, then iPhone.
- **Double-Check Details** — Always verify flight numbers, report times, and dates against your official airline schedule before relying on them.
- **Risky Format** — Low brightness, custom fonts, or blur can confuse the OCR scanner and produce small mistakes that affect flight times.
- **Can I just take a photo of a screen?** — No. Glare, moiré patterns, and angle distortion break the scanner. Always use a direct screenshot.
- **Not Working? Send It To Me** — Tap "Report This Import" on the error message; Mail opens with the screenshot attached and a diagnostic block so I can see exactly what the phone saw.

Bottom of card: `↑ Back to top` link.

**PDF Import card** — `id="pdf-import"`, green accent (`#34C759`)

Rows:
- **How to Import** — Tap the green PDF button and pick the file, or share the PDF into Crewlu from any app's share sheet.
- **Supported PDFs** — Currently Altour / Travelport ViewTrip itineraries from email, and Mint training schedules. More formats are being added — send me examples that don't work.
- **Double-Check Details** — Always verify flight numbers, report times, and dates against your official airline schedule before relying on them.
- **Not Working? Send It To Me** — Tap "Report This Import" on the error message; Mail opens with the PDF attached and a diagnostic block so I can see exactly what the phone read.

Bottom of card: `↑ Back to top` link.

### Part 3 — Footer Disclaimer

Single line, small italic, centered: *"Both methods are in active testing. Always verify flight numbers, report times, and dates against your official airline schedule before relying on them."*

## Visual Design

- **Section background** — subtle purple→magenta gradient panel at low opacity, echoing the beta beaker icon used inside the app. Mirrors the existing EFK disclaimer's `linear-gradient(135deg, …)` treatment but in brand purple.
- **Beta pill** — solid `#a855f7`, white uppercase text, ~0.7rem, rounded full pill.
- **Version chip** — outline-only pill, dimmer text.
- **Phone frame** — pure CSS: rounded corners (~36px), 1px inner border, dark outer frame, drop shadow, a small rounded notch at the top. No external assets.
- **Callouts** — small white rounded chips with the method color as the border. Each chip is paired with a dotted SVG line + arrow tip drawn via inline SVG, absolutely positioned. The SVG sits behind the chip in the same wrapper.
- **Method cards** — white background, 4px left border in the method color, soft shadow matching existing `.box` style, generous padding, label/body two-column row layout with the icon on the left.
- **Anchor buttons** — reuse existing `.button` styling for visual consistency.

## Responsive Behavior

Single CSS breakpoint at **`max-width: 700px`** (matches existing site convention).

- Hero columns collapse to stacked (phone on top, copy below).
- Callouts switch from absolutely-positioned floating chips to a small horizontal row of inline chips placed **below** the phone image. No overlap. SVG arrow lines are hidden on mobile.
- Method cards stack vertically (they're already full-width by default in the existing CSS scale).
- Row layout inside method cards keeps icon + text side-by-side; only the body wraps.

## Accessibility

- Callout chips and SVG arrows are `aria-hidden="true"` (decorative); the equivalent info ("tap the orange Screenshot button…") appears in body copy inside the method cards.
- Section uses `<section>` + `<h2>`/`<h3>` headings in correct order so the page outline remains coherent.
- Color is never the only signal — every method has a label and an icon in addition to its accent color.
- Phone-frame image gets `alt="Crewlu's Import Schedule sheet showing Paste, Screenshot, PDF, and Manual options"`.
- Anchor jump links are real `<a href="#...">` elements, keyboard-navigable.

## Files Changed

1. **`import.html`** — insert ~80 lines of new HTML between EFK disclaimer and `#import-wizard`. No existing markup modified.
2. **`assets/css/main.css`** — append a new block of `~150` lines, all classes namespaced `.beta-import-*` so they cannot collide with existing styles. No existing rules modified.
3. **`images/Screenshotorpdfview.png`** — new asset. Source is the user's reference image #6 (the in-app Import Schedule sheet screenshot). The image cache used during brainstorming is no longer available, so the user must drop this file into `images/` before implementation.

## Open Items / Prerequisites for Implementation

- [ ] **User provides** `images/Screenshotorpdfview.png` (image #6 from the brainstorming session). Implementation plan will include a placeholder until this asset lands.
- [ ] Confirm exact wording of the hero subhead and footer disclaimer (current copy is a draft).

## Out of Scope (future work)

- Deep-linking from the in-app "Report This Import" error message into `import.html#screenshot-import` or `#pdf-import`. The anchors will exist and work, but instrumenting the app to use them is a separate task in the iOS codebase.
- Updating the wizard's terminal "instructions" content to mention Screenshot/PDF as faster alternatives. Useful follow-up but not part of this section.
