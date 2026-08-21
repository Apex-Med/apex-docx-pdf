---
name: Apex DOCX PDF
description: An editorial instrument panel for deterministic document rendering.
colors:
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  panel: "oklch(0.97 0 0)"
  muted-ink: "oklch(0.42 0 0)"
  hairline: "oklch(0.922 0 0)"
  pipeline-blue: "oklch(0.46 0.16 246)"
  pipeline-blue-foreground: "oklch(0.985 0.01 246)"
  destructive: "oklch(0.577 0.245 27.325)"
  dark-ground: "oklch(0.145 0 0)"
  dark-panel: "oklch(0.205 0 0)"
  dark-raised: "oklch(0.269 0 0)"
  dark-ink: "oklch(0.985 0 0)"
  dark-muted-ink: "oklch(0.708 0 0)"
  dark-pipeline-blue: "oklch(0.72 0.14 241)"
typography:
  display:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "clamp(3rem, 7vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.05em"
  headline:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  body:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono Variable, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.1em"
rounded:
  none: "0px"
  system-sm: "0.375rem"
  system-md: "0.5rem"
  system-lg: "0.625rem"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.5rem"
    height: "2.5rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 1.5rem"
    height: "2.5rem"
  input-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0"
    height: "2.5rem"
  card-work-surface:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "2rem"
  badge-status:
    backgroundColor: "transparent"
    textColor: "{colors.muted-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0"
---

# Design System: Apex DOCX PDF

## Overview

**Creative North Star: "The Instrument Panel"**

Apex DOCX PDF should feel like a carefully typeset control surface for a deterministic engine: editorial in composition, rigorous in hierarchy, and quietly authoritative in tone. The interface exposes technical truth without becoming visually noisy. Its restraint makes diagnostics, source material, and output feel inspectable rather than abstract.

The system is precise and tool-like. Geist Mono gives prose, controls, code, and metadata a shared engineering cadence; strong typographic scale keeps that uniform voice from becoming flat. Ink-and-Paper neutrals carry nearly the entire interface, while Pipeline Blue is a scarce operational signal rather than decoration. Light elevation may separate work surfaces, menus, and overlays, but structure still begins with spacing, borders, and tonal contrast.

**Key Characteristics:**

- Monospaced, editorial typography with decisive scale changes.
- Square controls and containers with crisp hairline structure.
- Ink-and-Paper neutrals across both light and dark themes.
- Pipeline Blue reserved for operational emphasis and diagnostic meaning.
- Light, purposeful elevation on interactive or floating work surfaces.
- Dense technical information made legible through rhythm, not ornament.

## Colors

The palette is an Ink-and-Paper neutral field with one focused Pipeline Blue signal and a semantic destructive red.

### Primary

- **Pipeline Blue** (`oklch(0.46 0.16 246)`; dark `oklch(0.72 0.14 241)`): brand emphasis, selected technical states, diagnostic syntax, and rare operational highlights.

### Neutral

- **Paper** (`oklch(1 0 0)`): primary light-theme background, cards, and popovers.
- **Ink** (`oklch(0.145 0 0)`): primary light-theme text and solid actions; also the dark-theme ground.
- **Panel Gray** (`oklch(0.97 0 0)`): muted, secondary, and accent surfaces in the light theme.
- **Muted Ink** (`oklch(0.42 0 0)`): secondary prose and metadata in the light theme.
- **Hairline** (`oklch(0.922 0 0)`): borders, dividers, and input rules in the light theme.
- **Dark Panel** (`oklch(0.205 0 0)`): cards and popovers on the dark ground.
- **Dark Raised** (`oklch(0.269 0 0)`): secondary and muted dark-theme surfaces.
- **Dark Ink** (`oklch(0.985 0 0)`): primary dark-theme text and light actions.
- **Dark Muted Ink** (`oklch(0.708 0 0)`): secondary prose and metadata in the dark theme.

### Named Rules

**The Signal, Not Decoration Rule.** Pipeline Blue marks meaning or action; it never becomes a colorful dashboard wash.

**The Ink-and-Paper Rule.** Establish hierarchy with neutral contrast first. Add hue only when the interface gains information from it.

## Typography

**Display Font:** Geist Mono Variable (with monospace fallback)  
**Body Font:** Geist Mono Variable (with monospace fallback)  
**Label/Mono Font:** Geist Mono Variable (with monospace fallback)

**Character:** A single monospaced family gives the system the cadence of an instrument panel and the authority of a technical proof. Hierarchy comes from scale, weight, tracking, case, and whitespace rather than a decorative font pairing.

### Hierarchy

- **Display** (600, `clamp(3rem, 7vw, 4.25rem)`, 0.96): landing-page statements and the strongest product proposition; tightly tracked and used sparingly.
- **Headline** (600, `1.875rem`, 1.15): major section openings and workflow milestones.
- **Title** (600, `1.125rem`, 1.4, wider tracking): component and panel titles, often uppercase when they function as instrumentation labels.
- **Body** (400, `1rem`, 1.5): explanation and task guidance; use smaller `0.875rem` body text for dense application surfaces while preserving relaxed leading.
- **Label** (600, `0.75rem`, `0.1em`, uppercase): buttons, badges, terse metadata, and technical section labels.

### Named Rules

**The One Typeface Rule.** Do not introduce a display face to manufacture personality; let Geist Mono's scale and spacing carry the hierarchy.

**The Case Has Meaning Rule.** Uppercase and wide tracking identify controls, statuses, and compact technical headings, not general prose.

## Layout

Marketing and reference surfaces use a centered `max-w-7xl` frame with `1rem` mobile gutters, `1.25rem` small-screen gutters, and `2rem` large-screen gutters. The sticky header is 3.5rem tall on mobile and 4rem from the small breakpoint upward. Sections breathe vertically, while application surfaces become denser and use explicit grids, separators, and bounded scroll regions.

The spacing rhythm follows quarter-rem increments with recurring 0.5rem, 0.75rem, 1rem, 1.5rem, and 2rem steps. Responsive behavior collapses multi-column structures into a single task sequence before reducing target sizes; interactive targets remain approximately 2.25–2.75rem high. Wide layouts may use asymmetric or split-pane arrangements when they make source, data, diagnostics, and output easier to compare.

## Elevation & Depth

The system is lightly lifted, not shadowless. Borders and tonal layers establish the default hierarchy; restrained shadows distinguish cards, menus, dialogs, and mobile navigation when they genuinely float above another surface. Backdrop blur belongs to sticky chrome and modal context, not ordinary content panels.

### Shadow Vocabulary

- **Work Surface** (`0 1px 2px rgb(0 0 0 / 0.05)`): quiet separation for cards and bounded task surfaces.
- **Overlay** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): menus, dialogs, and transient floating interfaces.
- **Navigation Lift** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): mobile navigation only, where it must read above the page.

### Named Rules

**The Structure Before Shadow Rule.** A shadow may clarify an actual layer; it may not compensate for weak spacing, contrast, or borders.

## Shapes

The visible form language is square and mechanically aligned. Buttons, badges, cards, inputs, dialogs, menus, and content images resolve to zero-radius silhouettes unless a deeply embedded control requires the shared system radius. Hairline borders, underlined input rules, and rectangular clipping reinforce the sense of a calibrated tool. Avoid pill silhouettes for ordinary labels and actions.

## Components

Components are precise and tool-like: compact enough for technical work, clear enough for first-time evaluation, and visibly responsive to keyboard focus.

### Buttons

- **Shape:** square (`0px`) with a transparent border reserved for focus and invalid states.
- **Primary:** Ink background with Paper text; 2.5rem default height and 1.5rem horizontal padding; uppercase, semibold, widely tracked label text.
- **Hover / Focus:** reduce or shift tonal intensity on hover; retain the 2px focus-visible ring and offset. Non-popup actions may move down one pixel while active.
- **Outline / Ghost:** transparent at rest, using Hairline borders or a muted hover surface without becoming rounded or softly padded.

### Chips

- **Style:** badges are text-led, borderless, square, transparent, and extremely compact; 0.625rem uppercase labels use wide tracking.
- **State:** foreground, muted, or destructive text communicates status. Selection should use a restrained tonal field before introducing hue.

### Cards / Containers

- **Corner Style:** square (`0px`).
- **Background:** Paper in light mode and Dark Panel in dark mode.
- **Shadow Strategy:** Work Surface shadow plus a very low-contrast ring; stronger shadows are reserved for overlays.
- **Border:** a `1px` foreground ring at roughly 5% opacity or an explicit Hairline divider.
- **Internal Padding:** 2rem by default and 1.25rem for compact cards.

### Inputs / Fields

- **Style:** transparent field with a square silhouette and a single bottom Hairline rule; horizontal padding is normally zero.
- **Focus:** the bottom rule shifts to the ring color, reinforced by the global 2px focus-visible outline when appropriate.
- **Error / Disabled:** destructive bottom rule for invalid data; disabled fields retain structure at 50% opacity and use a not-allowed cursor.

### Navigation

The sticky header uses a translucent background, bottom Hairline, and restrained backdrop blur. Desktop links are quiet body text that gain Ink contrast on hover. Mobile navigation becomes a full-width or anchored square panel with generous 3rem rows, clear focus states, and Navigation Lift shadow. The active product action remains visually stronger than utility links.

### Diagnostics and Editors

Diagnostic and code-oriented surfaces preserve the monospaced system while using bounded syntax color: Pipeline Blue for keys, green for strings, amber for numbers, and cool cyan for keywords. These colors clarify parseable structure and must not leak into general dashboard decoration.

## Do's and Don'ts

### Do:

- **Do** build hierarchy with Ink-and-Paper contrast, type scale, whitespace, rules, and alignment before adding color.
- **Do** reserve Pipeline Blue for meaningful operational emphasis, selected states, and diagnostic syntax.
- **Do** keep controls square, compact, keyboard-visible, and mechanically aligned.
- **Do** use light shadows to clarify genuine work surfaces and overlays.
- **Do** preserve candid technical copy and make constraints as legible as capabilities.

### Don't:

- **Don't** turn the interface into colorful dashboard styling or distribute accent hues across every metric and panel.
- **Don't** introduce pill buttons, rounded SaaS cards, or soft ornamental containers as the default component language.
- **Don't** use gradients, glass effects, or shadow-heavy depth as decoration.
- **Don't** mix in a decorative display typeface or use uppercase for long-form prose.
- **Don't** hide unsupported states or technical boundaries behind vague, friendly copy.
