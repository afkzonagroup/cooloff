/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMessages, getOfficialLabels, interpolate, sentenceCase } from '../core/i18n.js';
import type { OfficialLanguage } from '../core/labels.js';
import type { Messages } from '../core/messages.js';
import { LIMITS, validateWithdrawalRequest, type ValidationError } from '../core/schema.js';
import { getStyleSheet } from './styles.js';

/** Fields shown in the form. */
type FieldName = 'name' | 'contract' | 'email' | 'items';

/** Detail of the `cooloff-submitted` event. Contains no personal data. */
export interface SubmittedEventDetail {
  readonly receiptId: string;
  readonly submittedAt: string;
}

interface FieldRefs {
  readonly control: HTMLInputElement | HTMLTextAreaElement;
  readonly error: HTMLElement;
  readonly hintId: string | undefined;
}

interface SuccessBody {
  readonly receiptId: string;
  readonly submittedAt: { readonly utc: string; readonly local: string; readonly timeZone: string };
  readonly acknowledgement: 'sent' | 'pending';
  readonly statement: { readonly email: string };
}

const OBSERVED = [
  'lang',
  'endpoint',
  'withdraw-label',
  'confirm-label',
  'label-case',
  'allow-partial',
  'heading-level',
] as const;

/** Headers the component sets itself or that browsers control; `header-name` cannot override them. */
const RESERVED_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'content-type',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
]);

/** Builds an element with constant attributes and optional text. Never parses HTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = 'k_';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function isSuccessBody(value: unknown): value is SuccessBody {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const at = v['submittedAt'] as Record<string, unknown> | undefined;
  const statement = v['statement'] as Record<string, unknown> | undefined;
  return (
    typeof v['receiptId'] === 'string' &&
    typeof at === 'object' &&
    typeof at['utc'] === 'string' &&
    typeof at['local'] === 'string' &&
    typeof at['timeZone'] === 'string' &&
    (v['acknowledgement'] === 'sent' || v['acknowledgement'] === 'pending') &&
    typeof statement === 'object' &&
    typeof statement['email'] === 'string'
  );
}

function serverErrors(value: unknown): ValidationError[] {
  if (typeof value !== 'object' || value === null) return [];
  const errors = (value as Record<string, unknown>)['errors'];
  if (!Array.isArray(errors)) return [];
  return errors.filter(
    (e): e is ValidationError =>
      typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>)['field'] === 'string' && typeof (e as Record<string, unknown>)['code'] === 'string',
  );
}

/**
 * `<withdrawal-button>`: the withdrawal function of Article 11a of Directive
 * 2011/83/EU.
 *
 * Step 1 is a button labelled with the official wording of Art. 11a(1)
 * ("withdraw from contract here" in the page language). It opens the online
 * withdrawal statement (Art. 11a(2)) with fields for name, contract and
 * e-mail, which can be pre-filled for logged-in consumers. Step 2 is the
 * confirmation function of Art. 11a(3), labelled only with the official
 * wording ("confirm withdrawal"). After the server accepts the statement the
 * component shows the receipt number and the date and time of submission.
 *
 * Attributes:
 * - `endpoint` (required): URL of the server handler.
 * - `lang`: language; default is the nearest `lang` attribute, then `en`.
 * - `prefill-name`, `prefill-contract`, `prefill-email`: values the consumer only has to confirm.
 * - `allow-partial`: show the optional items field (recital 37).
 * - `withdraw-label`, `confirm-label`: your own "unambiguous corresponding formulation".
 * - `label-case`: `sentence` (default, first letter upper case) or `verbatim`.
 * - `heading-level`: 2 to 6, default 2.
 * - `header-name`, `header-value`: one extra request header, e.g. `X-WP-Nonce` for WordPress or
 *   `x-publishable-api-key` for Medusa. The name must be a plain header token.
 *
 * Events (bubbling, composed): `cooloff-open`, `cooloff-cancel`,
 * `cooloff-submitted` (detail: {@link SubmittedEventDetail}).
 */
export class WithdrawalButtonElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  #messageOverrides: Partial<Messages> = {};

  /** Overrides of interface strings for the current language. Applied at once while the form is closed. */
  get messages(): Partial<Messages> {
    return this.#messageOverrides;
  }

  set messages(value: Partial<Messages>) {
    this.#messageOverrides = { ...value };
    if (this.#trigger !== undefined && !this.#open && !this.#sending) this.#render();
  }

  readonly #root: ShadowRoot;
  #idempotencyKey: string | undefined;
  #sending = false;
  #open = false;
  #fields = new Map<FieldName, FieldRefs>();
  #trigger: HTMLButtonElement | undefined;
  #panel: HTMLElement | undefined;
  #heading: HTMLElement | undefined;
  #form: HTMLFormElement | undefined;
  #summary: HTMLElement | undefined;
  #status: HTMLElement | undefined;
  #confirm: HTMLButtonElement | undefined;
  #cancel: HTMLButtonElement | undefined;
  #success: HTMLElement | undefined;
  #formView: HTMLElement | undefined;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    const sheet = getStyleSheet();
    if (sheet !== undefined) this.#root.adoptedStyleSheets = [sheet];
  }

  connectedCallback(): void {
    if (this.#trigger === undefined) this.#render();
  }

  attributeChangedCallback(): void {
    if (this.#trigger !== undefined && !this.#open && !this.#sending) this.#render();
  }

  /** `true` while the form is open. */
  get isOpen(): boolean {
    return this.#open;
  }

  /** The language in use. */
  get language(): OfficialLanguage {
    const own = this.getAttribute('lang');
    const inherited = this.parentElement?.closest('[lang]')?.getAttribute('lang') ?? document.documentElement.getAttribute('lang');
    const requested = [own, inherited].filter((tag): tag is string => tag !== null && tag !== '');
    return getOfficialLabels(requested).language;
  }

  /** Opens the withdrawal statement form and moves focus to its heading. */
  open(): void {
    if (this.#open || this.#panel === undefined) return;
    this.#idempotencyKey ??= randomKey();
    this.#open = true;
    this.#panel.hidden = false;
    this.#trigger?.setAttribute('aria-expanded', 'true');
    this.#heading?.focus();
    this.dispatchEvent(new CustomEvent('cooloff-open', { bubbles: true, composed: true }));
  }

  /** Closes the form without sending and returns focus to the button. */
  close(): void {
    if (!this.#open || this.#sending) return;
    const wasSuccess = this.#success !== undefined && !this.#success.hidden;
    this.#open = false;
    this.#idempotencyKey = undefined;
    this.#render();
    this.#trigger?.focus();
    if (!wasSuccess) this.dispatchEvent(new CustomEvent('cooloff-cancel', { bubbles: true, composed: true }));
  }

  #messages(): Messages {
    return getMessages(this.language, this.#messageOverrides);
  }

  #render(): void {
    const language = this.language;
    const labels = getOfficialLabels(language);
    const m = this.#messages();
    const verbatim = this.getAttribute('label-case') === 'verbatim';
    const display = (text: string): string => (verbatim ? text : sentenceCase(text, language));
    // An empty or blank custom label would leave a button without words; Art. 11a(1) and (3) require a label.
    const custom = (name: string): string | undefined => {
      const value = this.getAttribute(name)?.trim();
      return value === undefined || value === '' ? undefined : value;
    };
    const withdrawText = custom('withdraw-label') ?? display(labels.withdrawLabel);
    const confirmText = custom('confirm-label') ?? display(labels.confirmLabel);
    const level = Number(this.getAttribute('heading-level') ?? '2');
    const headingTag = (`h${String(Number.isInteger(level) && level >= 2 && level <= 6 ? level : 2)}`) as 'h2';

    this.#fields = new Map();
    const root = el('div', { class: 'root', part: 'root', lang: language });

    this.#trigger = el(
      'button',
      { type: 'button', class: 'primary', part: 'button', 'aria-expanded': 'false', 'aria-controls': 'cooloff-panel' },
      withdrawText,
    );
    this.#trigger.addEventListener('click', () => {
      if (this.#open) this.close();
      else this.open();
    });

    const panel = el('section', { id: 'cooloff-panel', class: 'panel', part: 'panel', 'aria-labelledby': 'cooloff-heading' });
    panel.hidden = true;
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.close();
      }
    });
    this.#panel = panel;

    this.#heading = el(headingTag, { id: 'cooloff-heading', class: 'heading', part: 'heading', tabindex: '-1' }, m.formTitle);
    panel.append(this.#heading);

    const formView = el('div');
    this.#formView = formView;
    formView.append(el('p', { id: 'cooloff-intro', class: 'intro', part: 'intro' }, m.formIntro));

    this.#summary = el('p', { id: 'cooloff-summary', class: 'error-summary', part: 'error-summary', role: 'alert', tabindex: '-1' });
    this.#summary.hidden = true;
    formView.append(this.#summary);

    const form = el('form', { part: 'form', novalidate: '', 'aria-describedby': 'cooloff-intro' });
    this.#form = form;
    form.append(
      this.#field('name', m.nameLabel, { autocomplete: 'name', maxlength: String(LIMITS.nameMaxLength) }, this.getAttribute('prefill-name')),
      this.#field('contract', m.contractLabel, { autocomplete: 'off', maxlength: String(LIMITS.contractMaxLength) }, this.getAttribute('prefill-contract')),
      this.#field(
        'email',
        m.emailLabel,
        { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: String(LIMITS.emailMaxLength), spellcheck: 'false' },
        this.getAttribute('prefill-email'),
        m.emailHint,
      ),
    );
    if (this.hasAttribute('allow-partial')) {
      form.append(this.#field('items', m.itemsLabel, {}, null, m.itemsHint, true));
    }

    const actions = el('div', { class: 'actions', part: 'actions' });
    this.#confirm = el('button', { type: 'submit', class: 'primary', part: 'confirm' }, confirmText);
    this.#cancel = el('button', { type: 'button', class: 'secondary', part: 'cancel' }, m.cancel);
    this.#cancel.addEventListener('click', () => {
      this.close();
    });
    this.#status = el('p', { class: 'status', part: 'status', role: 'status', 'aria-live': 'polite' });
    actions.append(this.#confirm, this.#cancel, this.#status);
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.#submit();
    });
    formView.append(form);
    panel.append(formView);

    this.#success = el('div', { class: 'success', part: 'success' });
    this.#success.hidden = true;
    panel.append(this.#success);

    root.append(this.#trigger, panel);
    this.#root.replaceChildren(root);
  }

  #field(
    name: FieldName,
    label: string,
    attributes: Readonly<Record<string, string>>,
    prefill: string | null,
    hint?: string,
    multiline = false,
  ): HTMLElement {
    const id = `cooloff-${name}`;
    const wrapper = el('div', { class: 'field', part: 'field' });
    wrapper.append(el('label', { for: id, part: 'label' }, label));
    const required = name !== 'items';
    const control = multiline
      ? el('textarea', { id, name, rows: '3', part: 'input', ...attributes })
      : el('input', { id, name, type: 'text', part: 'input', ...attributes });
    if (required) {
      control.required = true;
      control.setAttribute('aria-required', 'true');
    }
    control.setAttribute('aria-invalid', 'false');
    if (prefill !== null) control.value = prefill;
    let hintId: string | undefined;
    if (hint !== undefined) {
      hintId = `${id}-hint`;
      wrapper.append(el('p', { id: hintId, class: 'hint', part: 'hint' }, hint));
      control.setAttribute('aria-describedby', hintId);
    }
    const error = el('p', { id: `${id}-error`, class: 'error', part: 'error' });
    error.hidden = true;
    wrapper.append(error, control);
    this.#fields.set(name, { control, error, hintId });
    return wrapper;
  }

  #value(name: FieldName): string {
    return this.#fields.get(name)?.control.value ?? '';
  }

  #clearErrors(): void {
    for (const { control, error, hintId } of this.#fields.values()) {
      error.hidden = true;
      error.textContent = '';
      control.setAttribute('aria-invalid', 'false');
      if (hintId === undefined) control.removeAttribute('aria-describedby');
      else control.setAttribute('aria-describedby', hintId);
    }
    if (this.#summary !== undefined) {
      this.#summary.hidden = true;
      this.#summary.textContent = '';
    }
  }

  #errorText(error: ValidationError, m: Messages): string {
    if (error.field === 'email') return error.code === 'required' ? m.errorRequired : error.code === 'too_long' ? m.errorTooLong : m.errorEmail;
    if (error.field === 'items') return m.errorItems;
    if (error.code === 'too_long') return m.errorTooLong;
    return m.errorRequired;
  }

  /** Shows field errors, links them with aria-describedby and focuses the first invalid field. */
  #showErrors(errors: readonly ValidationError[]): boolean {
    const m = this.#messages();
    let first: HTMLInputElement | HTMLTextAreaElement | undefined;
    for (const error of errors) {
      if (error.field !== 'name' && error.field !== 'contract' && error.field !== 'email' && error.field !== 'items') continue;
      const refs = this.#fields.get(error.field);
      if (refs === undefined || !refs.error.hidden) continue;
      refs.error.textContent = this.#errorText(error, m);
      refs.error.hidden = false;
      refs.control.setAttribute('aria-invalid', 'true');
      refs.control.setAttribute('aria-describedby', [refs.hintId, refs.error.id].filter((x) => x !== undefined).join(' '));
      first ??= refs.control;
    }
    if (first === undefined) return false;
    if (this.#summary !== undefined) {
      this.#summary.textContent = m.errorSummary;
      this.#summary.hidden = false;
    }
    first.focus();
    return true;
  }

  #showFormError(text: string): void {
    if (this.#summary === undefined) return;
    this.#summary.textContent = text;
    this.#summary.hidden = false;
    this.#summary.focus();
  }

  #setSending(sending: boolean): void {
    this.#sending = sending;
    const m = this.#messages();
    if (this.#confirm !== undefined) this.#confirm.disabled = sending;
    if (this.#cancel !== undefined) this.#cancel.disabled = sending;
    this.#form?.setAttribute('aria-busy', String(sending));
    if (this.#status !== undefined) this.#status.textContent = sending ? m.sending : '';
  }

  async #submit(retryOnConflict = true): Promise<void> {
    if (this.#sending) return;
    this.#clearErrors();
    const m = this.#messages();
    const items = this.#value('items')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const body = {
      name: this.#value('name'),
      contract: this.#value('contract'),
      email: this.#value('email'),
      ...(items.length > 0 ? { items } : {}),
      language: this.language,
      idempotencyKey: (this.#idempotencyKey ??= randomKey()),
    };
    const local = validateWithdrawalRequest(body, { allowPartial: this.hasAttribute('allow-partial') });
    if (!local.ok) {
      this.#showErrors(local.errors);
      return;
    }

    const endpoint = this.#endpoint();
    if (endpoint === undefined) {
      this.#showFormError(m.errorSend);
      return;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const headerName = this.getAttribute('header-name');
    const headerValue = this.getAttribute('header-value');
    if (
      headerName !== null &&
      headerValue !== null &&
      /^[A-Za-z0-9-]{1,64}$/u.test(headerName) &&
      !RESERVED_HEADERS.has(headerName.toLowerCase())
    ) {
      headers[headerName] = headerValue;
    }

    this.#setSending(true);
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
      payload = await response.json().catch(() => undefined);
    } catch {
      this.#setSending(false);
      this.#showFormError(m.errorSend);
      return;
    }
    this.#setSending(false);

    if ((response.status === 200 || response.status === 201) && isSuccessBody(payload)) {
      this.#showSuccess(payload);
      return;
    }
    if (response.status === 409 && retryOnConflict) {
      // The key was used before with other details (for example after an
      // earlier attempt that reached the server). This is a new statement.
      this.#idempotencyKey = randomKey();
      await this.#submit(false);
      return;
    }
    if (response.status === 400 && this.#showErrors(serverErrors(payload))) return;
    if (response.status === 429) {
      this.#showFormError(m.errorRateLimited);
      return;
    }
    this.#showFormError(m.errorSend);
  }

  #endpoint(): string | undefined {
    const raw = this.getAttribute('endpoint');
    if (raw === null || raw.trim() === '') return undefined;
    try {
      const url = new URL(raw, document.baseURI);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
    } catch {
      return undefined;
    }
  }

  #showSuccess(body: SuccessBody): void {
    if (this.#success === undefined || this.#formView === undefined || this.#heading === undefined) return;
    const m = this.#messages();
    this.#heading.textContent = m.successTitle;
    this.#formView.hidden = true;
    const list = el('dl');
    list.append(
      el('dt', {}, m.receiptLabel),
      el('dd', { part: 'receipt' }, body.receiptId),
      el('dt', {}, m.submittedAtLabel),
      el('dd', {}, `${body.submittedAt.local.slice(0, 10)} ${body.submittedAt.local.slice(11, 19)} (${body.submittedAt.timeZone})`),
    );
    const note = el(
      'p',
      {},
      interpolate(body.acknowledgement === 'sent' ? m.ackSent : m.ackPending, { email: body.statement.email }),
    );
    const close = el('button', { type: 'button', class: 'secondary', part: 'close' }, m.close);
    close.addEventListener('click', () => {
      this.close();
    });
    this.#success.replaceChildren(list, note, close);
    this.#success.hidden = false;
    this.#idempotencyKey = undefined;
    this.#heading.focus();
    const detail: SubmittedEventDetail = { receiptId: body.receiptId, submittedAt: body.submittedAt.utc };
    this.dispatchEvent(new CustomEvent('cooloff-submitted', { bubbles: true, composed: true, detail }));
  }
}
