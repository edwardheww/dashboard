<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Nasdaq AI Screener
description: A terminal-native screener that scores Nasdaq stocks and surfaces the top 3 with full factor traceability.
---

# Design System: Nasdaq AI Screener

## 1. Overview

**Creative North Star: "The Quant's Desk"**

Not a product demo of AI, a working instrument for someone who reads numbers for a living. The reference point is Bloomberg Terminal and analyst-desk software: dense information, monospace numerics that align in columns, color spent only where it carries signal. The screen should feel like it was built by a quant for their own use, not designed to impress an investor in a pitch deck.

This system explicitly rejects two things: the generic AI-SaaS dashboard (purple/blue gradients, glassmorphism, a big hero metric with a gradient accent, rounded-pill everything), and the gamified consumer trading app (playful rounding, confetti-on-gain, cheerful color). Both are a mismatch for a tool whose entire value proposition is "trust the number because you can see the work behind it."

**Key Characteristics:**
- Dark by default, near-monochrome, one signal accent used sparingly
- Numbers in monospace, aligned in columns, doing the work headings usually do
- Flat surfaces, no decorative shadow or blur
- Motion limited to state feedback, nothing choreographed
- Every top-line score sits directly above the factor breakdown that produced it

## 2. Colors

**The Restrained Signal Rule.** The palette is a tinted-dark neutral scale plus exactly one accent hue, and that accent is reserved for what deserves attention: score bands, gain/loss deltas, the running/loading state. If it isn't signal, it's neutral.

### Primary
- **Signal Amber** (`[to be resolved during implementation — amber/phosphor hue, terminal-accent character]`): the one accent. Used for the overall score figure, positive upside deltas, the active/running indicator, and focus states. Never used decoratively.

### Neutral
- **Void** (`[to be resolved — near-black background, tinted not pure #000]`): base page background.
- **Panel** (`[to be resolved — one step up from Void]`): card/section surfaces, distinguished from Void by luminance only, no border needed by default.
- **Ink** (`[to be resolved — near-white foreground, tinted not pure #fff]`): primary text.
- **Ink Dim** (`[to be resolved]`): secondary text, labels, metadata.
- **Line** (`[to be resolved — subtle divider]`): hairline separators between dense rows.

### Named Rules
**The One Accent Rule.** Signal Amber appears on no more than ~10% of any screen. Its rarity is what makes it mean something when it shows up.
**The Gain/Loss Exception.** If a second color is needed to distinguish positive from negative deltas (upside vs downside), it must be desaturated and no louder than Signal Amber — this is the only place a second hue is permitted.

## 3. Typography

**Display Font:** `[to be resolved — geometric or humanist sans, e.g. Inter or similar]`
**Body Font:** same family as Display, lighter weight
**Label/Mono Font:** `[to be resolved — a real monospace, e.g. JetBrains Mono or similar]`

**Character:** A precise, unshowy sans for structure (headings, labels, copy) paired with a true monospace for every number, ticker, price, and percentage — so figures line up in columns the way they do on a real terminal.

### Hierarchy
- **Display** (medium weight, ~1.5–2rem): page title / section headers only, used sparingly.
- **Title** (medium weight, ~1.125rem): card and panel headers (e.g. a stock's name/ticker).
- **Body** (regular weight, ~0.9375rem): supporting copy, explanations of factors.
- **Label** (medium weight, ~0.75rem, uppercase, wide tracking): field labels, factor names, table headers.
- **Numeric** (monospace, regular weight, size varies by context): all scores, prices, percentages, tickers. Tabular figures, right-aligned in any column context.

### Named Rules
**The Tabular Numerals Rule.** Any monospace figure sits in a context using `font-variant-numeric: tabular-nums` (or the mono font's native fixed-width digits) so stacked numbers align vertically without manual padding.

## 4. Elevation

Flat by default. This system does not use shadow for depth; it uses a one-step luminance shift (Void → Panel) to separate surfaces, the way a terminal UI uses subtle background blocks rather than drop shadows. The one exception is a focus ring on interactive elements (the API key field, the run button), which uses Signal Amber at low opacity, not a blur.

### Named Rules
**The Flat-By-Default Rule.** No `box-shadow` for card separation. Surfaces are distinguished by background luminance and, where truly needed, a 1px `Line` divider — never both at once.

## 5. Components

No components implemented yet — this seed captures direction only. Canonical primitives (button, input, score card, factor row) will be documented on the next `/impeccable document` run once the UI exists.

## 6. Do's and Don'ts

### Do:
- **Do** keep the background near-black but tinted (never pure `#000`), and text near-white but tinted (never pure `#fff`).
- **Do** put every number in the monospace face, tabular and right-aligned within its column.
- **Do** keep Signal Amber to score figures, deltas, and active/focus states only.
- **Do** show the factor breakdown directly beneath any score it rolls up into — no score without its receipts.

### Don't:
- **Don't** use gradients anywhere, including gradient text (`background-clip: text`) — this was explicitly named as an anti-reference.
- **Don't** use glassmorphism, blurred/translucent cards, or drop shadows for elevation.
- **Don't** build a "hero metric" card (big number + small label + gradient accent) — the generic AI-SaaS cliché this project is deliberately avoiding.
- **Don't** use rounded-pill buttons/badges or identical icon+heading+text card grids.
- **Don't** gamify gains/losses (no confetti, no playful bounce, no cheerful oversaturated green) — this is a quant's desk, not a consumer trading app.
- **Don't** animate layout properties or use bounce/elastic easing; motion is restrained state-feedback only.
