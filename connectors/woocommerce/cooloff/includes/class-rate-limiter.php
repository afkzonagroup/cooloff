<?php
/**
 * Rate limiting with transients.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Fixed-window limiter keyed by a hash of the client address. Uses the object
 * cache when one is installed, otherwise the options table. Not exact under
 * heavy concurrency; it is a brake, not an accounting system.
 */
final class Rate_Limiter {

	/**
	 * Turns a client address into a rate-limit key, like clientRateLimitKey()
	 * in the Cooloff package: IPv6 addresses become their /64 network (one
	 * client usually has a whole /64), IPv4-mapped IPv6 addresses become IPv4,
	 * brackets and zone IDs are removed, anything else is kept (lower case, at
	 * most 100 characters).
	 *
	 * @param string $address Client address.
	 */
	public static function client_key( string $address ): string {
		$text = strtolower( trim( $address ) );
		$text = (string) preg_replace( '/^\[(.*)\]$/', '$1', $text );
		$text = (string) preg_replace( '/%.*$/s', '', $text );
		if ( '' === $text ) {
			return 'unknown';
		}
		if ( false === strpos( $text, ':' ) || false === filter_var( $text, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {
			return substr( $text, 0, 100 );
		}
		$packed = inet_pton( $text );
		if ( false === $packed || 16 !== strlen( $packed ) ) {
			return substr( $text, 0, 100 );
		}
		if ( str_repeat( "\0", 10 ) . "\xff\xff" === substr( $packed, 0, 12 ) ) {
			return (string) inet_ntop( substr( $packed, 12 ) );
		}
		$groups = unpack( 'n4', substr( $packed, 0, 8 ) );
		return implode( ':', array_map( 'dechex', is_array( $groups ) ? array_values( $groups ) : array() ) ) . '::/64';
	}

	/**
	 * Consumes one attempt.
	 *
	 * @param string $client Client address.
	 * @param int    $limit  Attempts per window.
	 * @param int    $window Window in seconds.
	 * @return int 0 if allowed, otherwise seconds to wait.
	 */
	public static function consume( string $client, int $limit = 10, int $window = 60 ): int {
		$key   = 'cooloff_rl_' . substr( hash( 'sha256', wp_salt( 'nonce' ) . '|' . $client ), 0, 32 );
		$now   = time();
		$state = get_transient( $key );
		if ( ! is_array( $state ) || ! isset( $state['count'], $state['reset'] ) || (int) $state['reset'] <= $now ) {
			$state = array(
				'count' => 0,
				'reset' => $now + $window,
			);
		}
		$state['count'] = (int) $state['count'] + 1;
		set_transient( $key, $state, max( 1, (int) $state['reset'] - $now ) );
		return $state['count'] <= $limit ? 0 : max( 1, (int) $state['reset'] - $now );
	}
}
