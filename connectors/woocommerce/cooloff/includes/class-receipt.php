<?php
/**
 * Deterministic receipt IDs.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Port of src/core/receipt.ts. Produces the same IDs for the same input and
 * secret (checked against data/test-vectors.json).
 */
final class Receipt {

	const MIN_SECRET_BYTES = 32;
	const ALPHABET         = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

	/**
	 * Throws if the secret is too short.
	 *
	 * @param string $secret Secret.
	 * @throws \InvalidArgumentException When shorter than 32 bytes.
	 */
	public static function assert_secret( string $secret ): void {
		if ( strlen( $secret ) < self::MIN_SECRET_BYTES ) {
			throw new \InvalidArgumentException( 'The secret must be at least 32 bytes long' );
		}
	}

	/**
	 * Crockford base32 without padding.
	 *
	 * @param string $bytes Binary string.
	 */
	public static function base32( string $bytes ): string {
		$out   = '';
		$bits  = 0;
		$value = 0;
		$len   = strlen( $bytes );
		for ( $i = 0; $i < $len; $i++ ) {
			$value = ( $value << 8 ) | ord( $bytes[ $i ] );
			$bits += 8;
			while ( $bits >= 5 ) {
				$out  .= self::ALPHABET[ ( $value >> ( $bits - 5 ) ) & 31 ];
				$bits -= 5;
			}
			$value &= ( 1 << $bits ) - 1;
		}
		if ( $bits > 0 ) {
			$out .= self::ALPHABET[ ( $value << ( 5 - $bits ) ) & 31 ];
		}
		return $out;
	}

	/**
	 * Canonical serialisation, identical to JSON.stringify of the same array.
	 *
	 * @param array<string, mixed> $request Validated request.
	 */
	public static function canonical( array $request ): string {
		return (string) wp_json_encode(
			array(
				'cooloff-v1',
				$request['idempotencyKey'],
				$request['name'],
				$request['contract'],
				$request['email'],
				array_values( $request['items'] ),
				$request['language'],
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS
		);
	}

	/**
	 * Receipt ID: WD- and 16 base32 characters of HMAC-SHA-256, grouped in fours.
	 *
	 * @param string               $secret  Secret.
	 * @param array<string, mixed> $request Validated request.
	 */
	public static function id( string $secret, array $request ): string {
		self::assert_secret( $secret );
		$code = self::base32( substr( hash_hmac( 'sha256', self::canonical( $request ), $secret, true ), 0, 10 ) );
		return 'WD-' . implode( '-', str_split( $code, 4 ) );
	}

	/**
	 * Storage key for an idempotency key (HMAC, hex).
	 *
	 * @param string $secret Secret.
	 * @param string $key    Idempotency key.
	 */
	public static function storage_key( string $secret, string $key ): string {
		self::assert_secret( $secret );
		return hash_hmac( 'sha256', "cooloff-idempotency-v1\n" . $key, $secret );
	}
}
