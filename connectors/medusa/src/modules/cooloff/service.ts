/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { MedusaService } from '@medusajs/framework/utils';

import Withdrawal from './models/withdrawal';
import type { CooloffPluginOptions } from './options';

type ServiceArgs = [Record<string, unknown>, Partial<CooloffPluginOptions> | undefined];

/** Module service: CRUD for withdrawals plus access to the plugin options. */
class CooloffModuleService extends MedusaService({ Withdrawal }) {
  protected readonly options_: Readonly<Partial<CooloffPluginOptions>>;

  constructor(...args: ServiceArgs) {
    super(...args);
    this.options_ = Object.freeze({ ...(args[1] ?? {}) });
  }

  /** The plugin options from medusa-config.ts. */
  getOptions(): Readonly<Partial<CooloffPluginOptions>> {
    return this.options_;
  }
}

export default CooloffModuleService;
