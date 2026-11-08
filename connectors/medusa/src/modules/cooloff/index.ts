/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

import { Module } from '@medusajs/framework/utils';

import validateOptions from './loaders/validate-options';
import CooloffModuleService from './service';

/** Container key of the module service. */
export const COOLOFF_MODULE = 'cooloff';

export default Module(COOLOFF_MODULE, {
  service: CooloffModuleService,
  loaders: [validateOptions],
});

export type { CooloffPluginOptions } from './options';
