<?php
/**
 * Unit test bootstrap: the pure classes need no WordPress, only these stubs.
 *
 * @package Cooloff
 */

define( 'ABSPATH', __DIR__ . '/' );

if ( ! function_exists( 'wp_json_encode' ) ) {
	/**
	 * Same contract as WordPress's wp_json_encode for valid UTF-8 input.
	 *
	 * @param mixed $value Value.
	 * @param int   $flags Flags.
	 * @return string|false
	 */
	function wp_json_encode( $value, $flags = 0 ) {
		return json_encode( $value, $flags );
	}
}

require_once dirname( __DIR__ ) . '/cooloff/includes/class-data.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-text.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-validator.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-receipt.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-acknowledgement.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-rate-limiter.php';
require_once dirname( __DIR__ ) . '/cooloff/includes/class-rest.php';

/**
 * Root of the Cooloff repository (for shared data files).
 */
function cooloff_repo_root(): string {
	return dirname( __DIR__, 3 );
}
