# Luminous Horizon Theme

A warm, premium design system inspired by Airy Minimalism and Glassmorphism.

## Color Palette

### Surface Colors (Backgrounds & Layers)
- **surface**: `#fff9ee` — Primary off-white background
- **surface-container**: `#f3ede2` — Mid-level container
- **surface-container-high**: `#ede8dd` — Elevated container
- **surface-variant**: `#e8e2d7` — Secondary background tone

### Primary (Warm Orange)
- **primary**: `#9f4122` — Main action color
- **primary-container**: `#ff8a65` — Lighter variant
- **on-primary**: `#ffffff` — Text on primary

### Secondary (Pale Lime)
- **secondary**: `#556500` — Accent for AI features
- **secondary-container**: `#d6ed7a` — Light variant

### Tertiary (Soft Cyan)
- **tertiary**: `#326578` — Secondary accent
- **tertiary-container**: `#80b1c7` — Light variant

### Text
- **on-surface**: `#1d1c15` — Primary text
- **on-surface-variant**: `#56423c` — Secondary text
- **outline**: `#89726b` — Borders & dividers

## Typography

All typography uses **Plus Jakarta Sans** (loaded from Google Fonts).

| Scale | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| Display XL | 64px | 800 | 1.1 | -0.04em |
| Headline Large | 40px | 700 | 1.2 | -0.02em |
| Headline Medium | 24px | 600 | 1.3 | -0.01em |
| Body Large | 18px | 400 | 1.6 | 0 |
| Body Medium | 16px | 400 | 1.6 | 0 |
| Label Caps | 12px | 700 | 1 | 0.1em |

**CSS Classes:**
```html
<h1 class="text-display-xl">Headline</h1>
<h2 class="text-headline-lg">Secondary Title</h2>
<p class="text-body-lg">Body text</p>
<span class="text-label-caps">Metadata</span>
```

## Spacing & Radii

**Spacing Unit**: 8px

| Scale | Value |
|-------|-------|
| 1 | 8px |
| 2 | 16px |
| 3 | 24px |
| 4 | 32px |
| 5 | 40px |
| 6 | 48px |
| 8 | 64px |
| 15 | 120px |

**Border Radius:**
- `rounded-sm`: 0.5rem (4px)
- `rounded-md`: 1rem (8px) — Standard cards
- `rounded-lg`: 1.5rem (12px)
- `rounded-xl`: 2rem (16px)
- `rounded-2xl`: 3rem (24px)
- `rounded-full`: 9999px (Pill buttons)

## Glassmorphism Utilities

### Glass Cards
```html
<!-- Primary glass with strong blur -->
<div class="glass rounded-lg p-6">Content</div>

<!-- Thicker glass for emphasis -->
<div class="glass-thick rounded-xl p-8">Premium card</div>

<!-- Subtle glass for light accents -->
<div class="glass-subtle rounded-md p-4">Subtle background</div>
```

**Properties:**
- `glass`: 70% white opacity, 20px blur
- `glass-thick`: 80% white opacity, 30px blur
- `glass-subtle`: 50% white opacity, 10px blur

### Shadows
```html
<!-- Standard elevation -->
<div class="shadow-elevated">Content</div>

<!-- Larger elevation -->
<div class="shadow-elevated-lg">Featured content</div>

<!-- Cyan glow effect -->
<div class="glow-cyan">Highlighted</div>
```

Shadows use soft orange/cyan at 5–12% opacity for a gentle "glow" rather than heavy drop.

## Component Guidelines

### Buttons
- **Primary**: Pill-shaped (`rounded-full`), warm-sunset gradient background (#9f4122 → #ff8a65), white text
- **Secondary**: Pill-shaped, thin border, transparent background, hover fills with soft background
- **Hover effect**: Subtle lift (subtle scale + shadow elevation)

Example:
```html
<button class="rounded-full bg-primary text-on-primary px-6 py-3 font-bold shadow-elevated">
  Action
</button>
```

### Cards
- **Default**: `rounded-md` (8px), glass effect, 40px internal padding (`p-5`)
- **Featured**: `rounded-xl` (16px), glass-thick, shadow-elevated-lg
- **Sections**: 120px gap between major sections

Example:
```html
<div class="glass rounded-md p-5 shadow-elevated">
  <h2 class="text-headline-md mb-3">Card Title</h2>
  <p class="text-body-md text-on-surface-variant">Content goes here</p>
</div>
```

### Chips & Tags
- Pill-shaped (rounded-full)
- 20% opacity secondary or tertiary background
- Matching dark text
- Small size (12px label-caps)

Example:
```html
<span class="rounded-full bg-secondary/20 text-secondary-dark px-3 py-1 text-label-caps">
  AI Generated
</span>
```

### Layout
- **Container max-width**: 1440px (handled by Tailwind `max-w-7xl`)
- **Gutters**: 32px (8 Tailwind units)
- **Section gaps**: 120px vertical spacing
- **Internal card padding**: 40px

## Design Principles

1. **Whitespace is premium**: Never cram content. Use large gaps.
2. **Glassmorphism creates depth**: Layered cards with translucent backgrounds feel elevated.
3. **Diffused shadows > heavy shadows**: Warm orange at low opacity, not black.
4. **Typography hierarchy is dramatic**: Oversized headlines, generous body line-height.
5. **Rounded corners everywhere**: No sharp edges; pill shapes for interactions.

## Accessibility Notes

- Color contrast: All text meets WCAG AA (primary text on light backgrounds)
- Focus states: Add `:focus-visible` outline in primary color
- Dark mode: Not implemented in v1; document if adding later
