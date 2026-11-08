<?php
/**
 * Shared data: official labels and interface strings.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Loads data/labels.json (official text) and data/messages.json (working
 * translations). Both files are copies of the files in the Cooloff package
 * and are checked for equality by its test suite.
 */
final class Data {

	/**
	 * Official EU language codes.
	 *
	 * @var string[]
	 */
	const LANGUAGES = array( 'bg', 'es', 'cs', 'da', 'de', 'et', 'el', 'en', 'fr', 'ga', 'hr', 'it', 'lv', 'lt', 'hu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'sl', 'fi', 'sv' );

	/**
	 * Cache of decoded files.
	 *
	 * @var array<string, array<string, mixed>>
	 */
	private static $cache = array();

	/**
	 * Reads and decodes a JSON data file shipped with the plugin.
	 *
	 * @param string $name File name, one of the two allowed names.
	 * @return array<string, mixed>
	 * @throws \RuntimeException If the file is missing or invalid.
	 */
	private static function load( string $name ): array {
		if ( isset( self::$cache[ $name ] ) ) {
			return self::$cache[ $name ];
		}
		if ( 'labels.json' !== $name && 'messages.json' !== $name ) {
			throw new \RuntimeException( 'Unknown data file' );
		}
		$path = dirname( __DIR__ ) . '/data/' . $name;
		// Reading a local file shipped with the plugin; WP_Filesystem is not needed for reads.
		$json = is_readable( $path ) ? file_get_contents( $path ) : false; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local plugin file.
		$data = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $data ) ) {
			throw new \RuntimeException( 'Cooloff data file is missing or invalid' );
		}
		self::$cache[ $name ] = $data;
		return $data;
	}

	/**
	 * Returns true for an official EU language code.
	 *
	 * @param mixed $value Value to test.
	 */
	public static function is_language( $value ): bool {
		return is_string( $value ) && in_array( $value, self::LANGUAGES, true );
	}

	/**
	 * Reduces a locale such as de_DE or pt-BR to an official language, or the fallback.
	 *
	 * @param string $locale   Locale or language tag.
	 * @param string $fallback Fallback language.
	 */
	public static function resolve_language( string $locale, string $fallback = 'en' ): string {
		$primary = strtolower( (string) preg_split( '/[-_]/', trim( $locale ) )[0] );
		return self::is_language( $primary ) ? $primary : $fallback;
	}

	/**
	 * Official labels for a language (Art. 11a(1) and (3)).
	 *
	 * @param string $language Official language code.
	 * @return array{withdrawLabel: string, confirmLabel: string, url: string, source: string}
	 * @throws \RuntimeException If the data file is broken.
	 */
	public static function labels( string $language ): array {
		$language = self::resolve_language( $language );
		foreach ( self::load( 'labels.json' )['labels'] as $entry ) {
			if ( $entry['language'] === $language ) {
				return $entry;
			}
		}
		throw new \RuntimeException( 'No labels for language' );
	}

	/**
	 * Interface strings for a language (working translations).
	 *
	 * @param string $language Official language code.
	 * @return array<string, string>
	 * @throws \RuntimeException If the data file is broken.
	 */
	public static function messages( string $language ): array {
		$language = self::resolve_language( $language );
		foreach ( self::load( 'messages.json' )['catalogues'] as $entry ) {
			if ( $entry['language'] === $language ) {
				return $entry['messages'];
			}
		}
		throw new \RuntimeException( 'No messages for language' );
	}

	/**
	 * Replaces {name} placeholders. Output is plain text.
	 *
	 * @param string               $template Template.
	 * @param array<string,string> $values   Values.
	 */
	public static function interpolate( string $template, array $values ): string {
		return (string) preg_replace_callback(
			'/\{([a-z]+)\}/',
			static function ( array $m ) use ( $values ): string {
				return array_key_exists( $m[1], $values ) ? $values[ $m[1] ] : $m[0];
			},
			$template
		);
	}
}
