<?php
/**
 * Text normalisation.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Same rules as src/core/normalise.ts in the Cooloff package.
 */
final class Text {

	/**
	 * Control, bidirectional, zero-width and separator characters.
	 */
	const UNSAFE = '/[\x{0}-\x{1F}\x{7F}-\x{9F}\x{AD}\x{61C}\x{180E}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{206F}\x{FEFF}\x{FFF9}-\x{FFFB}]/u';

	/**
	 * Unicode NFC when the intl extension is available.
	 *
	 * @param string $value Text.
	 */
	public static function nfc( string $value ): string {
		if ( class_exists( '\Normalizer' ) ) {
			$normalised = \Normalizer::normalize( $value, \Normalizer::FORM_C );
			if ( is_string( $normalised ) ) {
				return $normalised;
			}
		}
		return $value;
	}

	/**
	 * True if the text is valid UTF-8.
	 *
	 * @param string $value Text.
	 */
	public static function is_utf8( string $value ): bool {
		return 1 === preg_match( '//u', $value );
	}

	/**
	 * True if the text contains an unsafe character.
	 *
	 * @param string $value Text.
	 */
	public static function has_unsafe( string $value ): bool {
		return 1 === preg_match( self::UNSAFE, $value );
	}

	/**
	 * NFC, unsafe characters to spaces, white space collapsed, trimmed.
	 *
	 * @param string $value Text.
	 */
	public static function normalise( string $value ): string {
		$value = self::nfc( $value );
		$value = (string) preg_replace( self::UNSAFE, ' ', $value );
		$value = (string) preg_replace( '/\s+/u', ' ', $value );
		return trim( $value );
	}

	/**
	 * Trimmed, NFC, domain part in lower case.
	 *
	 * @param string $value E-mail address.
	 */
	public static function normalise_email( string $value ): string {
		$value = trim( self::nfc( $value ) );
		$at    = strrpos( $value, '@' );
		if ( false === $at ) {
			return $value;
		}
		$domain = substr( $value, $at + 1 );
		$domain = function_exists( 'mb_strtolower' ) ? mb_strtolower( $domain, 'UTF-8' ) : strtolower( $domain );
		return substr( $value, 0, $at ) . '@' . $domain;
	}

	/**
	 * Length in UTF-16 code units, matching JavaScript's String length.
	 *
	 * @param string $value Text.
	 */
	public static function length( string $value ): int {
		// Code points plus one for each character outside the Basic Multilingual Plane (a surrogate pair in UTF-16). No mbstring needed.
		$code_points = (int) preg_match_all( '/./su', $value );
		$astral      = (int) preg_match_all( '/[\x{10000}-\x{10FFFF}]/u', $value );
		return $code_points + $astral;
	}
}
