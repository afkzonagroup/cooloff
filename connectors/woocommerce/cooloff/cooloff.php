<?php
/**
 * Plugin Name:       Cooloff withdrawal function
 * Description:       The withdrawal function of Article 11a of the Consumer Rights Directive 2011/83/EU (Directive (EU) 2023/2673): "withdraw from contract here" button, confirmation step and acknowledgement of receipt by e-mail.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      8.1
 * Requires Plugins:  woocommerce
 * Author:            MB AFKzona Group
 * License:           Apache-2.0
 * License URI:       https://www.apache.org/licenses/LICENSE-2.0
 * Text Domain:       cooloff
 *
 * @package Cooloff
 * Copyright 2026 MB AFKzona Group
 */

defined( 'ABSPATH' ) || exit;

define( 'COOLOFF_VERSION', '0.1.0' );
define( 'COOLOFF_PLUGIN_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-data.php';
require_once __DIR__ . '/includes/class-text.php';
require_once __DIR__ . '/includes/class-validator.php';
require_once __DIR__ . '/includes/class-receipt.php';
require_once __DIR__ . '/includes/class-acknowledgement.php';
require_once __DIR__ . '/includes/class-store.php';
require_once __DIR__ . '/includes/class-rate-limiter.php';
require_once __DIR__ . '/includes/class-rest.php';
require_once __DIR__ . '/includes/class-frontend.php';
require_once __DIR__ . '/includes/class-admin.php';
require_once __DIR__ . '/includes/class-plugin.php';

register_activation_hook( __FILE__, array( \Cooloff\Plugin::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \Cooloff\Plugin::class, 'deactivate' ) );
add_action( 'plugins_loaded', array( \Cooloff\Plugin::class, 'init' ) );
