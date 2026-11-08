/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Registers `<withdrawal-button>`. Safe to import more than once.
 *
 * @example
 * ```html
 * <script type="module" src="/assets/cooloff/component/define.js"></script>
 * <withdrawal-button endpoint="/api/withdrawal"></withdrawal-button>
 * ```
 */

import { TAG_NAME, WithdrawalButtonElement } from './index.js';

if (customElements.get(TAG_NAME) === undefined) {
  customElements.define(TAG_NAME, WithdrawalButtonElement);
}

export { TAG_NAME, WithdrawalButtonElement };
