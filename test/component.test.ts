// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OFFICIAL_LABELS } from '../src/core/labels.js';
import { COMPONENT_CSS, TAG_NAME, WithdrawalButtonElement } from '../src/component/index.js';
import { XSS_PAYLOADS } from './fixtures.js';

beforeAll(async () => {
  await import('../src/component/define.js');
});

type Fetch = typeof fetch;
let fetchMock: ReturnType<typeof vi.fn<Fetch>>;

function successResponse(status = 201, overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      receiptId: 'WD-AAAA-BBBB-CCCC-DDDD',
      submittedAt: { utc: '2026-06-19T08:30:00.000Z', local: '2026-06-19T11:30:00+03:00', timeZone: 'Europe/Vilnius' },
      acknowledgement: 'sent',
      statement: { name: 'Jane Doe', contract: 'ORDER-1', email: 'jane@example.eu', items: [], language: 'en' },
      ...overrides,
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  fetchMock = vi.fn<Fetch>(() => Promise.resolve(successResponse()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('lang');
  vi.unstubAllGlobals();
});

function mount(attributes: Record<string, string> = {}): WithdrawalButtonElement {
  const element = document.createElement(TAG_NAME) as WithdrawalButtonElement;
  element.setAttribute('endpoint', '/api/withdrawal');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
}

function q(element: WithdrawalButtonElement, selector: string): HTMLElement {
  const found = element.shadowRoot?.querySelector<HTMLElement>(selector);
  if (found === null || found === undefined) throw new Error(`Missing ${selector}`);
  return found;
}

function input(element: WithdrawalButtonElement, selector: string): HTMLInputElement {
  return q(element, selector) as HTMLInputElement;
}

function btn(element: WithdrawalButtonElement, selector: string): HTMLButtonElement {
  return q(element, selector) as HTMLButtonElement;
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

function fill(element: WithdrawalButtonElement, values: Partial<Record<'name' | 'contract' | 'email' | 'items', string>>): void {
  for (const [name, value] of Object.entries(values)) {
    input(element, `#cooloff-${name}`).value = value;
  }
}

async function submit(element: WithdrawalButtonElement): Promise<void> {
  btn(element, '[part="confirm"]').click();
  await vi.waitFor(() => {
    expect(q(element, 'form').getAttribute('aria-busy')).not.toBe('true');
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('<withdrawal-button> rendering', () => {
  it('registers once and uses an open shadow root', async () => {
    await import('../src/component/define.js');
    expect(customElements.get(TAG_NAME)).toBe(WithdrawalButtonElement);
    expect(mount().shadowRoot).not.toBeNull();
  });

  it.each(OFFICIAL_LABELS.map((l) => [l.language, l] as const))('shows the official labels in %s', (language, labels) => {
    const element = mount({ lang: language });
    const button = q(element, '[part="button"]').textContent;
    const confirm = q(element, '[part="confirm"]').textContent;
    expect(button.toLocaleLowerCase(language)).toBe(labels.withdrawLabel.toLocaleLowerCase(language));
    expect(confirm.toLocaleLowerCase(language)).toBe(labels.confirmLabel.toLocaleLowerCase(language));
    expect(button.slice(1)).toBe(labels.withdrawLabel.slice(1));
    expect(q(element, '.root').getAttribute('lang')).toBe(language);
  });

  it('shows the official labels verbatim when asked', () => {
    const element = mount({ lang: 'en', 'label-case': 'verbatim' });
    expect(q(element, '[part="button"]').textContent).toBe('withdraw from contract here');
    expect(q(element, '[part="confirm"]').textContent).toBe('confirm withdrawal');
  });

  it('inherits the page language and falls back to English', () => {
    document.documentElement.setAttribute('lang', 'lt-LT');
    expect(q(mount(), '[part="button"]').textContent).toBe('Atsisakyti sutarties čia');
    document.documentElement.setAttribute('lang', 'nb');
    expect(q(mount(), '[part="button"]').textContent).toBe('Withdraw from contract here');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('lang', 'de');
    const element = document.createElement(TAG_NAME) as WithdrawalButtonElement;
    wrapper.append(element);
    document.body.append(wrapper);
    expect(element.language).toBe('de');
  });

  it('accepts trader-defined labels', () => {
    const element = mount({ 'withdraw-label': 'Cancel my order', 'confirm-label': 'Confirm cancellation' });
    expect(q(element, '[part="button"]').textContent).toBe('Cancel my order');
    expect(q(element, '[part="confirm"]').textContent).toBe('Confirm cancellation');
  });

  it('falls back to the official labels when a custom label is empty or blank', () => {
    const element = mount({ 'withdraw-label': '', 'confirm-label': '   ' });
    expect(q(element, '[part="button"]').textContent).toBe('Withdraw from contract here');
    expect(q(element, '[part="confirm"]').textContent).toBe('Confirm withdrawal');
  });

  it('re-renders on attribute change while closed', () => {
    const element = mount({ lang: 'en' });
    element.setAttribute('lang', 'fr');
    expect(q(element, '[part="button"]').textContent).toBe('Renoncer au contrat ici');
  });

  it('labels every field and marks the required ones', () => {
    const element = mount({ 'allow-partial': '' });
    for (const name of ['name', 'contract', 'email', 'items']) {
      const control = input(element, `#cooloff-${name}`);
      const label = q(element, `label[for="cooloff-${name}"]`);
      expect(label.textContent.length).toBeGreaterThan(0);
      expect(control.getAttribute('aria-invalid')).toBe('false');
      expect(control.getAttribute('aria-required')).toBe(name === 'items' ? null : 'true');
    }
    expect(q(element, '#cooloff-email').getAttribute('aria-describedby')).toBe('cooloff-email-hint');
    expect(q(element, '#cooloff-email').getAttribute('type')).toBe('email');
    expect(q(element, '#cooloff-email').getAttribute('autocomplete')).toBe('email');
    expect(q(element, '#cooloff-name').getAttribute('autocomplete')).toBe('name');
  });

  it('hides the items field unless partial withdrawal is allowed', () => {
    expect(mount().shadowRoot?.querySelector('#cooloff-items')).toBeNull();
  });

  it('uses heading levels 2 to 6', () => {
    expect(q(mount({ 'heading-level': '3' }), '#cooloff-heading').tagName).toBe('H3');
    expect(q(mount({ 'heading-level': '9' }), '#cooloff-heading').tagName).toBe('H2');
  });

  it('works under a strict CSP: no style elements, no style attributes, no inline handlers', () => {
    const element = mount({ 'allow-partial': '' });
    const root = element.shadowRoot;
    expect(root?.querySelector('style')).toBeNull();
    for (const node of root?.querySelectorAll('*') ?? []) {
      expect(node.hasAttribute('style')).toBe(false);
      for (const attr of node.getAttributeNames()) expect(attr.startsWith('on')).toBe(false);
    }
    expect(root?.adoptedStyleSheets.length).toBe(1);
  });

  it('ships styles for small screens, focus and theming', () => {
    expect(COMPONENT_CSS).toContain('@media (max-width: 30rem)');
    expect(COMPONENT_CSS).toContain(':focus-visible');
    expect(COMPONENT_CSS).toContain('min-height: 44px');
    expect(COMPONENT_CSS).toContain('var(--cooloff-accent');
  });

  it('exposes parts for theming', () => {
    const element = mount();
    for (const part of ['button', 'panel', 'heading', 'form', 'field', 'label', 'input', 'confirm', 'cancel', 'status', 'error-summary']) {
      expect(element.shadowRoot?.querySelector(`[part~="${part}"]`), part).not.toBeNull();
    }
  });
});

describe('<withdrawal-button> interaction', () => {
  it('opens with aria-expanded and moves focus to the heading', () => {
    const element = mount();
    const button = btn(element, '[part="button"]');
    expect(button.getAttribute('aria-controls')).toBe('cooloff-panel');
    expect(q(element, '#cooloff-panel').hidden).toBe(true);
    const opened = vi.fn();
    element.addEventListener('cooloff-open', opened);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(q(element, '#cooloff-panel').hidden).toBe(false);
    expect(element.shadowRoot?.activeElement?.id).toBe('cooloff-heading');
    expect(q(element, '#cooloff-panel').getAttribute('aria-labelledby')).toBe('cooloff-heading');
    expect(opened).toHaveBeenCalledOnce();
    expect(element.isOpen).toBe(true);
  });

  it('closes with Cancel, Escape or the button again and returns focus', () => {
    const element = mount();
    const cancelled = vi.fn();
    element.addEventListener('cooloff-cancel', cancelled);
    element.open();
    btn(element, '[part="cancel"]').click();
    expect(element.isOpen).toBe(false);
    expect(element.shadowRoot?.activeElement?.getAttribute('part')).toBe('button');
    element.open();
    q(element, '#cooloff-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(element.isOpen).toBe(false);
    btn(element, '[part="button"]').click();
    btn(element, '[part="button"]').click();
    expect(element.isOpen).toBe(false);
    expect(cancelled).toHaveBeenCalledTimes(3);
  });

  it('pre-fills values for a logged-in consumer to confirm', () => {
    const element = mount({ 'prefill-name': 'Jane Doe', 'prefill-contract': 'ORDER-1', 'prefill-email': 'jane@example.eu' });
    expect(input(element, '#cooloff-name').value).toBe('Jane Doe');
    expect(input(element, '#cooloff-contract').value).toBe('ORDER-1');
    expect(input(element, '#cooloff-email').value).toBe('jane@example.eu');
  });

  it('shows linked errors and focuses the first invalid field without sending', async () => {
    const element = mount();
    element.open();
    fill(element, { name: '', contract: 'ORDER-1', email: 'nope' });
    await submit(element);
    expect(fetchMock).not.toHaveBeenCalled();
    const name = q(element, '#cooloff-name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('cooloff-name-error');
    expect(q(element, '#cooloff-name-error').textContent).toBe('Fill in this field.');
    const email = q(element, '#cooloff-email');
    expect(email.getAttribute('aria-describedby')).toBe('cooloff-email-hint cooloff-email-error');
    expect(q(element, '#cooloff-email-error').textContent).toBe('Enter a valid email address.');
    expect(q(element, '#cooloff-summary').getAttribute('role')).toBe('alert');
    expect(q(element, '#cooloff-summary').hidden).toBe(false);
    expect(element.shadowRoot?.activeElement?.id).toBe('cooloff-name');
    expect(q(element, '#cooloff-contract').getAttribute('aria-invalid')).toBe('false');

    fill(element, { name: 'Jane' , email: 'jane@example.eu' });
    await submit(element);
    expect(name.getAttribute('aria-invalid')).toBe('false');
    expect(name.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows too-long and items errors', async () => {
    const element = mount({ 'allow-partial': '' });
    element.open();
    fill(element, { name: 'x'.repeat(201), contract: 'c', email: 'jane@example.eu', items: Array.from({ length: 51 }, () => 'i').join('\n') });
    await submit(element);
    expect(q(element, '#cooloff-name-error').textContent).toBe('This text is too long.');
    expect(q(element, '#cooloff-items-error').textContent).toBe('Enter at most 50 items of up to 200 characters each.');
  });

  it('sends the statement as JSON and shows the receipt', async () => {
    const element = mount({ lang: 'en', 'allow-partial': '' });
    const submitted = vi.fn();
    element.addEventListener('cooloff-submitted', submitted);
    element.open();
    fill(element, { name: ' Jane Doe ', contract: 'ORDER-1', email: 'jane@example.eu', items: 'Shoes\n\nHat\n' });
    await submit(element);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3000/api/withdrawal');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = bodyOf(init);
    expect(body).toMatchObject({ name: ' Jane Doe ', contract: 'ORDER-1', email: 'jane@example.eu', items: ['Shoes', 'Hat'], language: 'en' });
    expect(String(body['idempotencyKey'])).toMatch(/^k_[0-9a-f]{32}$/u);

    expect(q(element, '#cooloff-heading').textContent).toBe('Withdrawal received');
    expect(element.shadowRoot?.activeElement?.id).toBe('cooloff-heading');
    expect(q(element, '[part="receipt"]').textContent).toBe('WD-AAAA-BBBB-CCCC-DDDD');
    expect(q(element, '.success').textContent).toContain('2026-06-19 11:30:00 (Europe/Vilnius)');
    expect(q(element, '.success').textContent).toContain('We have sent the acknowledgement of receipt to jane@example.eu.');
    expect(submitted).toHaveBeenCalledOnce();
    expect((submitted.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ receiptId: 'WD-AAAA-BBBB-CCCC-DDDD', submittedAt: '2026-06-19T08:30:00.000Z' });

    btn(element, '[part="close"]').click();
    expect(element.isOpen).toBe(false);
    expect(q(element, '#cooloff-heading').textContent).toBe('Withdrawal from the contract');
  });

  it('says the acknowledgement is pending when the server could not send it yet', async () => {
    fetchMock.mockResolvedValueOnce(successResponse(201, { acknowledgement: 'pending' }));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
    element.open();
    await submit(element);
    expect(q(element, '.success').textContent).toContain('We will send the acknowledgement of receipt to jane@example.eu.');
  });

  it('keeps the same idempotency key for retries and sends the extra header', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu', 'header-name': 'X-WP-Nonce', 'header-value': 'abc123' });
    element.open();
    await submit(element);
    expect(q(element, '#cooloff-summary').textContent).toContain('could not be sent');
    expect(element.shadowRoot?.activeElement?.id).toBe('cooloff-summary');
    await submit(element);
    const keys = fetchMock.mock.calls.map(([, init]) => String(bodyOf(init)['idempotencyKey']));
    expect(keys[0]).toBe(keys[1]);
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)['X-WP-Nonce']).toBe('abc123');
  });

  it.each(['Content-Type', 'origin', 'Cookie'])('refuses to override the reserved header %s', async (name) => {
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu', 'header-name': name, 'header-value': 'text/plain' });
    element.open();
    await submit(element);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
  });

  it('ignores an unsafe extra header name', async () => {
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu', 'header-name': 'Bad Header\n', 'header-value': 'x' });
    element.open();
    await submit(element);
    expect(Object.keys(fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)).toEqual(['Content-Type', 'Accept']);
  });

  it('retries once with a new key after an idempotency conflict', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"idempotency_conflict"}', { status: 409 }));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
    element.open();
    await submit(element);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const keys = fetchMock.mock.calls.map(([, init]) => String(bodyOf(init)['idempotencyKey']));
    expect(keys[0]).not.toBe(keys[1]);
    await vi.waitFor(() => {
      expect(q(element, '[part="receipt"]').textContent).toBe('WD-AAAA-BBBB-CCCC-DDDD');
    });
  });

  it.each([
    [429, '{"error":"rate_limited"}', 'Too many attempts'],
    [500, '{"error":"internal_error"}', 'could not be sent'],
    [403, '{"error":"forbidden_origin"}', 'could not be sent'],
    [201, 'not json', 'could not be sent'],
    [201, '{"receiptId":5}', 'could not be sent'],
    [400, '{"error":"validation_failed","errors":[{"field":"_","code":"unknown_field"}]}', 'could not be sent'],
  ])('shows a form error for status %i %s', async (status, body, text) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status }));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
    element.open();
    await submit(element);
    expect(q(element, '#cooloff-summary').textContent).toContain(text);
  });

  it('maps server field errors to fields', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"validation_failed","errors":[{"field":"email","code":"invalid_email"},{"bad":1}]}', { status: 400 }));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
    element.open();
    await submit(element);
    expect(q(element, '#cooloff-email').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses to send without a usable endpoint', async () => {
    for (const endpoint of ['', 'javascript:alert(1)', 'http://[bad']) {
      const element = mount({ endpoint, 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
      element.open();
      await submit(element);
      expect(q(element, '#cooloff-summary').textContent).toContain('could not be sent');
    }
    const element = document.createElement(TAG_NAME) as WithdrawalButtonElement;
    element.setAttribute('prefill-name', 'J');
    element.setAttribute('prefill-contract', 'C');
    element.setAttribute('prefill-email', 'j@example.eu');
    document.body.append(element);
    element.open();
    await submit(element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables the buttons and announces while sending', async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    const element = mount({ 'prefill-name': 'J', 'prefill-contract': 'C', 'prefill-email': 'j@example.eu' });
    element.open();
    btn(element, '[part="confirm"]').click();
    await vi.waitFor(() => {
      expect(btn(element, '[part="confirm"]').disabled).toBe(true);
    });
    expect(q(element, '[part="status"]').textContent).toBe('Sending…');
    expect(q(element, '[part="status"]').getAttribute('role')).toBe('status');
    btn(element, '[part="confirm"]').click();
    element.close();
    expect(element.isOpen).toBe(true);
    element.setAttribute('lang', 'de');
    expect(q(element, '[part="button"]').textContent).toBe('Withdraw from contract here');
    release(successResponse());
    await vi.waitFor(() => {
      expect(q(element, '[part="receipt"]').textContent).toBe('WD-AAAA-BBBB-CCCC-DDDD');
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('applies message overrides before and after connecting', () => {
    const element = document.createElement(TAG_NAME) as WithdrawalButtonElement;
    element.messages = { nameLabel: 'Full name' };
    document.body.append(element);
    expect(q(element, 'label[for="cooloff-name"]').textContent).toBe('Full name');
    element.messages = { nameLabel: 'Your full name' };
    expect(element.messages).toEqual({ nameLabel: 'Your full name' });
    expect(q(element, 'label[for="cooloff-name"]').textContent).toBe('Your full name');
  });
});

describe('<withdrawal-button> XSS', () => {
  it.each(XSS_PAYLOADS)('renders %s as text everywhere', async (payload) => {
    fetchMock.mockResolvedValueOnce(
      successResponse(201, {
        receiptId: payload,
        submittedAt: { utc: payload, local: payload, timeZone: payload },
        statement: { email: payload },
      }),
    );
    const element = mount({
      'prefill-name': payload,
      'prefill-contract': payload,
      'prefill-email': 'jane@example.eu',
      'withdraw-label': payload,
      'confirm-label': payload,
    });
    element.messages = { formTitle: payload, nameLabel: payload, ackSent: `{email} ${payload}` };
    expect(q(element, '[part="button"]').textContent).toBe(payload);
    expect(input(element, '#cooloff-name').value).toBe(payload);
    element.open();
    await submit(element);
    const root = element.shadowRoot;
    expect(root?.querySelector('script, img, svg, a, iframe')).toBeNull();
    expect(q(element, '[part="receipt"]').textContent).toBe(payload);
    expect(q(element, '.success').textContent).toContain(payload);
  });
});
