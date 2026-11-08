<?php
/**
 * Test-only must-use plugin: captures e-mail instead of sending it.
 * Mounted only by tests/integration/run.sh, never shipped.
 *
 * @package Cooloff
 */

add_filter(
	'pre_wp_mail',
	static function ( $short_circuit, $atts ) {
		$dir = WP_CONTENT_DIR . '/uploads/cooloff-mails';
		if ( file_exists( WP_CONTENT_DIR . '/uploads/cooloff-mail-fail' ) ) {
			return false;
		}
		wp_mkdir_p( $dir );
		file_put_contents( $dir . '/' . microtime( true ) . '.json', wp_json_encode( $atts ) ); // phpcs:ignore
		return true;
	},
	10,
	2
);

// Every request gets its own rate-limit key unless the test names one, so
// only the rate-limit test is limited.
add_filter(
	'cooloff_client_address',
	static function ( $address ) {
		return isset( $_SERVER['HTTP_X_TEST_CLIENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_TEST_CLIENT'] ) ) : bin2hex( random_bytes( 8 ) );
	}
);
