/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Component styles. Applied through a constructable stylesheet
 * (`adoptedStyleSheets`), so no `<style>` element and no `style` attribute is
 * created and the component works under `style-src 'self'`.
 *
 * Theme with CSS custom properties on the element or any ancestor:
 *
 * | Property | Default |
 * |---|---|
 * | `--cooloff-font` | `inherit` |
 * | `--cooloff-text` | `#1b1b1f` |
 * | `--cooloff-muted` | `#45464f` |
 * | `--cooloff-surface` | `#ffffff` |
 * | `--cooloff-border` | `#74777f` |
 * | `--cooloff-accent` | `#0b57d0` |
 * | `--cooloff-accent-text` | `#ffffff` |
 * | `--cooloff-error` | `#b3261e` |
 * | `--cooloff-focus` | `#0b57d0` |
 * | `--cooloff-radius` | `6px` |
 * | `--cooloff-gap` | `16px` |
 *
 * Parts for `::part()`: `button`, `panel`, `heading`, `intro`, `form`,
 * `field`, `label`, `input`, `hint`, `error`, `error-summary`, `actions`,
 * `confirm`, `cancel`, `status`, `success`, `receipt`, `close`.
 */
export const COMPONENT_CSS = `
:host {
  display: block;
  font-family: var(--cooloff-font, inherit);
  color: var(--cooloff-text, #1b1b1f);
  line-height: 1.5;
  max-width: 100%;
}
:host([hidden]), [hidden] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
.root { max-width: 40rem; }
button {
  font: inherit;
  font-size: 1rem;
  min-height: 44px;
  min-width: 44px;
  padding: 10px 18px;
  border-radius: var(--cooloff-radius, 6px);
  border: 2px solid var(--cooloff-accent, #0b57d0);
  cursor: pointer;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: center;
}
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 3px solid var(--cooloff-focus, #0b57d0);
  outline-offset: 2px;
}
/* Headings and the error summary receive focus only programmatically, to move the screen reader. */
[tabindex="-1"]:focus { outline: none; }
button:disabled { cursor: not-allowed; opacity: 0.7; }
.primary {
  background: var(--cooloff-accent, #0b57d0);
  color: var(--cooloff-accent-text, #ffffff);
  font-weight: 600;
}
.secondary {
  background: transparent;
  color: var(--cooloff-accent, #0b57d0);
}
.panel {
  margin-top: var(--cooloff-gap, 16px);
  padding: var(--cooloff-gap, 16px);
  border: 1px solid var(--cooloff-border, #74777f);
  border-radius: var(--cooloff-radius, 6px);
  background: var(--cooloff-surface, #ffffff);
}
.heading { font-size: 1.25rem; line-height: 1.3; margin: 0 0 8px; }
.intro, .hint { color: var(--cooloff-muted, #45464f); }
.intro { margin: 0 0 var(--cooloff-gap, 16px); }
form { display: grid; gap: var(--cooloff-gap, 16px); }
.field { display: grid; gap: 4px; min-width: 0; }
label { font-weight: 600; }
.hint { margin: 0; font-size: 0.9375rem; }
input, textarea {
  font: inherit;
  font-size: 1rem;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  color: var(--cooloff-text, #1b1b1f);
  background: var(--cooloff-surface, #ffffff);
  border: 1px solid var(--cooloff-border, #74777f);
  border-radius: var(--cooloff-radius, 6px);
}
textarea { min-height: 88px; resize: vertical; }
[aria-invalid="true"] { border: 2px solid var(--cooloff-error, #b3261e); }
.error, .error-summary { color: var(--cooloff-error, #b3261e); margin: 0; font-weight: 600; }
.error-summary { padding: 8px 0; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.status { margin: 0; }
.success dl { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: 4px 16px; margin: 0 0 var(--cooloff-gap, 16px); }
.success dt { font-weight: 600; }
.success dd { margin: 0; overflow-wrap: anywhere; }
.success p { margin: 0 0 var(--cooloff-gap, 16px); overflow-wrap: anywhere; }
@media (max-width: 30rem) {
  .success dl { grid-template-columns: minmax(0, 1fr); }
  .success dd { margin-bottom: 8px; }
  .actions button { flex: 1 1 100%; }
}
@media (forced-colors: active) {
  button, input, textarea { border: 1px solid ButtonText; }
}
`;

let sheet: CSSStyleSheet | undefined;

/** Returns the shared stylesheet, or `undefined` if the browser has no constructable stylesheets. */
export function getStyleSheet(): CSSStyleSheet | undefined {
  if (sheet !== undefined) return sheet;
  if (typeof CSSStyleSheet === 'undefined' || !('replaceSync' in CSSStyleSheet.prototype)) return undefined;
  const created = new CSSStyleSheet();
  created.replaceSync(COMPONENT_CSS);
  sheet = created;
  return sheet;
}
