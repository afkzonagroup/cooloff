<?php
/**
 * Validation of the online withdrawal statement (Art. 11a(2)).
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Port of validateWithdrawalRequest() in src/core/schema.ts. Same fields, same
 * limits, same error codes.
 */
final class Validator {

	const NAME_MAX          = 200;
	const CONTRACT_MAX      = 100;
	const EMAIL_MAX         = 254;
	const EMAIL_LOCAL_MAX   = 64;
	const ITEMS_MAX         = 50;
	const ITEM_MAX          = 200;
	const KEY_MIN           = 16;
	const KEY_MAX           = 64;
	const FIELDS            = array( 'name', 'contract', 'email', 'items', 'language', 'idempotencyKey' );
	const EMAIL_LOCAL_REGEX = "/^[\\p{L}\\p{N}!#$%&'*+\\/=?^_`{|}~-]+(?:\\.[\\p{L}\\p{N}!#$%&'*+\\/=?^_`{|}~-]+)*$/u";
	const DOMAIN_LABEL      = '/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u';

	/**
	 * Checks an e-mail address in the common local@domain.tld form.
	 *
	 * @param string $email Address.
	 */
	public static function is_valid_email( string $email ): bool {
		if ( '' === $email || Text::length( $email ) > self::EMAIL_MAX ) {
			return false;
		}
		if ( Text::has_unsafe( $email ) || 1 === preg_match( '/\s/u', $email ) ) {
			return false;
		}
		$at = strrpos( $email, '@' );
		if ( false === $at || 0 === $at || strpos( $email, '@' ) !== $at ) {
			return false;
		}
		$local  = substr( $email, 0, $at );
		$domain = substr( $email, $at + 1 );
		if ( Text::length( $local ) > self::EMAIL_LOCAL_MAX || 1 !== preg_match( self::EMAIL_LOCAL_REGEX, $local ) ) {
			return false;
		}
		if ( '' === $domain || Text::length( $domain ) > 253 ) {
			return false;
		}
		$labels = explode( '.', $domain );
		if ( count( $labels ) < 2 ) {
			return false;
		}
		foreach ( $labels as $label ) {
			if ( 1 !== preg_match( self::DOMAIN_LABEL, $label ) ) {
				return false;
			}
		}
		return 1 !== preg_match( '/^\d+$/', (string) end( $labels ) );
	}

	/**
	 * Validates and normalises a decoded JSON body.
	 *
	 * @param mixed  $body          Decoded JSON (associative arrays).
	 * @param bool   $allow_partial Accept a list of items.
	 * @param string $default_language Language when none is given.
	 * @return array{ok: true, value: array<string, mixed>}|array{ok: false, errors: list<array{field: string, code: string}>}
	 */
	public static function validate( $body, bool $allow_partial = false, string $default_language = 'en' ): array {
		if ( ! is_array( $body ) || ( array() !== $body && array_is_list( $body ) ) ) {
			return array(
				'ok'     => false,
				'errors' => array( self::error( '_', 'not_an_object' ) ),
			);
		}
		$errors = array();
		foreach ( array_keys( $body ) as $key ) {
			if ( ! in_array( $key, self::FIELDS, true ) ) {
				$errors[] = self::error( '_', 'unknown_field' );
				break;
			}
		}

		$name     = self::text_field( $body, 'name', self::NAME_MAX, $errors );
		$contract = self::text_field( $body, 'contract', self::CONTRACT_MAX, $errors );

		$email     = '';
		$raw_email = $body['email'] ?? null;
		if ( null === $raw_email ) {
			$errors[] = self::error( 'email', 'required' );
		} elseif ( ! is_string( $raw_email ) ) {
			$errors[] = self::error( 'email', 'invalid_type' );
		} else {
			$email = Text::normalise_email( Text::length( $raw_email ) > self::EMAIL_MAX * 4 ? '' : $raw_email );
			if ( '' === $email ) {
				$errors[] = self::error( 'email', '' === trim( $raw_email ) ? 'required' : 'too_long' );
			} elseif ( Text::length( $email ) > self::EMAIL_MAX ) {
				$errors[] = self::error( 'email', 'too_long' );
			} elseif ( ! self::is_valid_email( $email ) ) {
				$errors[] = self::error( 'email', 'invalid_email' );
			}
		}

		$items     = array();
		$raw_items = $body['items'] ?? null;
		if ( null !== $raw_items ) {
			if ( ! is_array( $raw_items ) || ! array_is_list( $raw_items ) ) {
				$errors[] = self::error( 'items', 'invalid_type' );
			} elseif ( count( $raw_items ) > self::ITEMS_MAX ) {
				$errors[] = self::error( 'items', 'too_many_items' );
			} else {
				foreach ( $raw_items as $item ) {
					if ( ! is_string( $item ) ) {
						$errors[] = self::error( 'items', 'invalid_type' );
						break;
					}
					$value = Text::length( $item ) > self::ITEM_MAX * 4 ? null : Text::normalise( $item );
					if ( null === $value || Text::length( $value ) > self::ITEM_MAX ) {
						$errors[] = self::error( 'items', 'item_too_long' );
						break;
					}
					if ( '' !== $value ) {
						$items[] = $value;
					}
				}
				if ( array() !== $items && ! $allow_partial ) {
					$errors[] = self::error( 'items', 'partial_not_allowed' );
				}
			}
		}

		$language     = $default_language;
		$raw_language = $body['language'] ?? null;
		if ( null !== $raw_language ) {
			if ( Data::is_language( $raw_language ) ) {
				$language = $raw_language;
			} else {
				$errors[] = self::error( 'language', 'invalid_language' );
			}
		}

		$key     = '';
		$raw_key = $body['idempotencyKey'] ?? null;
		if ( ! is_string( $raw_key ) || strlen( $raw_key ) < self::KEY_MIN || strlen( $raw_key ) > self::KEY_MAX || 1 !== preg_match( '/^[A-Za-z0-9_-]+$/', $raw_key ) ) {
			$errors[] = self::error( 'idempotencyKey', 'invalid_idempotency_key' );
		} else {
			$key = $raw_key;
		}

		if ( array() !== $errors ) {
			return array(
				'ok'     => false,
				'errors' => $errors,
			);
		}
		return array(
			'ok'    => true,
			'value' => array(
				'name'           => $name,
				'contract'       => $contract,
				'email'          => $email,
				'items'          => $items,
				'language'       => $language,
				'idempotencyKey' => $key,
			),
		);
	}

	/**
	 * Validates a required single-line text field.
	 *
	 * @param array<string, mixed>                     $body   Body.
	 * @param string                                   $field  Field name.
	 * @param int                                      $max    Maximum length.
	 * @param list<array{field: string, code: string}> $errors Collected errors.
	 */
	private static function text_field( array $body, string $field, int $max, array &$errors ): string {
		$raw = $body[ $field ] ?? null;
		if ( null === $raw ) {
			$errors[] = self::error( $field, 'required' );
			return '';
		}
		if ( ! is_string( $raw ) ) {
			$errors[] = self::error( $field, 'invalid_type' );
			return '';
		}
		if ( Text::length( $raw ) > $max * 4 ) {
			$errors[] = self::error( $field, 'too_long' );
			return '';
		}
		$value = Text::normalise( $raw );
		if ( '' === $value ) {
			$errors[] = self::error( $field, 'required' );
		} elseif ( Text::length( $value ) > $max ) {
			$errors[] = self::error( $field, 'too_long' );
		}
		return $value;
	}

	/**
	 * Builds an error entry.
	 *
	 * @param string $field Field.
	 * @param string $code  Code.
	 * @return array{field: string, code: string}
	 */
	private static function error( string $field, string $code ): array {
		return array(
			'field' => $field,
			'code'  => $code,
		);
	}
}
