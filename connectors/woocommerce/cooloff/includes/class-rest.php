<?php
/**
 * REST endpoint for the withdrawal function.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * POST /wp-json/cooloff/v1/withdrawals
 *
 * Same behaviour as the Fetch API handler of the Cooloff package: strict JSON
 * content type, body size limit, origin check, rate limit, validation,
 * idempotency, acknowledgement of receipt by e-mail, no internals in errors.
 */
final class Rest {

	const ROUTE_NAMESPACE = 'cooloff/v1';
	const ROUTE           = '/withdrawals';
	const MAX_BODY_BYTES  = 16384;

	/**
	 * Registers the route.
	 */
	public static function register(): void {
		register_rest_route(
			self::ROUTE_NAMESPACE,
			self::ROUTE,
			array(
				'methods'             => 'POST',
				'callback'            => array( self::class, 'handle' ),
				// Public on purpose: consumers who bought as guests must be able to withdraw.
				// CSRF is handled by the origin check in handle(); logged-in users also need a valid wp_rest nonce (checked by WordPress core).
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * Builds a JSON error response.
	 *
	 * @param int                  $status HTTP status.
	 * @param string               $code   Error code.
	 * @param array<string, mixed> $extra  Extra fields.
	 * @param array<string,string> $headers Extra headers.
	 */
	private static function error( int $status, string $code, array $extra = array(), array $headers = array() ): \WP_REST_Response {
		$response = new \WP_REST_Response( array_merge( array( 'error' => $code ), $extra ), $status );
		foreach ( array_merge( self::security_headers(), $headers ) as $name => $value ) {
			$response->header( $name, $value );
		}
		return $response;
	}

	/**
	 * Security headers for every response of this route.
	 *
	 * @return array<string, string>
	 */
	private static function security_headers(): array {
		return array(
			'Cache-Control'          => 'no-store',
			'X-Content-Type-Options' => 'nosniff',
			'Referrer-Policy'        => 'no-referrer',
		);
	}

	/**
	 * Origins allowed to submit: the site's own origin plus any added by the
	 * cooloff_allowed_origins filter.
	 *
	 * @return string[]
	 */
	public static function allowed_origins(): array {
		$origins = array( self::origin_of( home_url() ), self::origin_of( site_url() ) );
		$extra   = apply_filters( 'cooloff_allowed_origins', array() );
		if ( is_array( $extra ) ) {
			foreach ( $extra as $origin ) {
				if ( is_string( $origin ) ) {
					$origins[] = self::origin_of( $origin );
				}
			}
		}
		return array_values( array_unique( array_filter( $origins ) ) );
	}

	/**
	 * Scheme, host and non-default port of a URL, in lower case.
	 *
	 * @param string $url URL.
	 */
	public static function origin_of( string $url ): string {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}
		$scheme = strtolower( $parts['scheme'] );
		if ( 'https' !== $scheme && 'http' !== $scheme ) {
			return '';
		}
		$port = isset( $parts['port'] ) ? (int) $parts['port'] : null;
		if ( ( 'https' === $scheme && 443 === $port ) || ( 'http' === $scheme && 80 === $port ) ) {
			$port = null;
		}
		return $scheme . '://' . strtolower( $parts['host'] ) . ( null === $port ? '' : ':' . $port );
	}

	/**
	 * Origin check (CSRF). Origin must match; without Origin, Sec-Fetch-Site must be same-origin.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public static function origin_allowed( \WP_REST_Request $request ): bool {
		$origin = $request->get_header( 'origin' );
		if ( is_string( $origin ) && '' !== $origin ) {
			return in_array( strtolower( $origin ), self::allowed_origins(), true );
		}
		return 'same-origin' === $request->get_header( 'sec_fetch_site' );
	}

	/**
	 * True for application/json with an optional UTF-8 charset.
	 *
	 * @param string|null $value Content-Type header.
	 */
	public static function is_json_content_type( ?string $value ): bool {
		if ( null === $value || strlen( $value ) > 100 ) {
			return false;
		}
		$parts = array_map( 'trim', explode( ';', strtolower( $value ) ) );
		if ( 'application/json' !== array_shift( $parts ) ) {
			return false;
		}
		foreach ( $parts as $param ) {
			if ( '' === $param ) {
				continue;
			}
			$pair = array_map( 'trim', explode( '=', $param, 2 ) );
			if ( 'charset' !== $pair[0] || ! in_array( trim( $pair[1] ?? '', '"' ), array( 'utf-8', 'utf8' ), true ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Client address for rate limiting. REMOTE_ADDR unless the
	 * cooloff_client_address filter supplies one (for trusted proxies).
	 */
	private static function client_address(): string {
		$remote = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		$value  = apply_filters( 'cooloff_client_address', $remote );
		return is_string( $value ) && '' !== $value ? Rate_Limiter::client_key( substr( $value, 0, 100 ) ) : 'unknown';
	}

	/**
	 * Handles a submission.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	public static function handle( \WP_REST_Request $request ): \WP_REST_Response {
		try {
			return self::process( $request );
		} catch ( \Throwable $e ) {
			Plugin::log_error( 'internal', $e );
			return self::error( 500, 'internal_error' );
		}
	}

	/**
	 * Processes a submission.
	 *
	 * @param \WP_REST_Request $request Request.
	 */
	private static function process( \WP_REST_Request $request ): \WP_REST_Response {
		if ( ! self::origin_allowed( $request ) ) {
			return self::error( 403, 'forbidden_origin' );
		}
		/**
		 * Rate limit per client address: attempts and window in seconds.
		 * Keep it generous; withdrawing is a consumer right.
		 *
		 * @param array{limit: int, window: int} $limit Default 10 per 60 seconds.
		 */
		$limit = apply_filters(
			'cooloff_rate_limit',
			array(
				'limit'  => 10,
				'window' => 60,
			)
		);
		$wait  = Rate_Limiter::consume(
			self::client_address(),
			max( 1, (int) ( $limit['limit'] ?? 10 ) ),
			max( 1, (int) ( $limit['window'] ?? 60 ) )
		);
		if ( $wait > 0 ) {
			return self::error( 429, 'rate_limited', array(), array( 'Retry-After' => (string) $wait ) );
		}
		if ( ! self::is_json_content_type( $request->get_header( 'content_type' ) ) ) {
			return self::error( 415, 'unsupported_media_type' );
		}
		$declared = $request->get_header( 'content_length' );
		$body     = $request->get_body();
		if ( ( null !== $declared && (int) $declared > self::MAX_BODY_BYTES ) || strlen( $body ) > self::MAX_BODY_BYTES ) {
			return self::error( 413, 'payload_too_large' );
		}
		if ( ! Text::is_utf8( $body ) ) {
			return self::error( 400, 'invalid_encoding' );
		}
		$data = json_decode( $body, true, 32 );
		if ( JSON_ERROR_NONE !== json_last_error() ) {
			return self::error( 400, 'invalid_json' );
		}

		$settings = Plugin::settings();
		$result   = Validator::validate( $data, $settings['allow_partial'], Data::resolve_language( get_locale() ) );
		if ( ! $result['ok'] ) {
			return self::error( 400, 'validation_failed', array( 'errors' => array_slice( $result['errors'], 0, 20 ) ) );
		}
		$value       = $result['value'];
		$secret      = Plugin::secret();
		$receipt_id  = Receipt::id( $secret, $value );
		$storage_key = Receipt::storage_key( $secret, $value['idempotencyKey'] );
		unset( $value['idempotencyKey'] );

		$existing = Store::get( $storage_key );
		if ( null !== $existing ) {
			return self::replay( $existing, $receipt_id );
		}

		$now      = new \DateTimeImmutable( 'now', new \DateTimeZone( 'UTC' ) );
		$record   = array(
			'receiptId'   => $receipt_id,
			'storageKey'  => $storage_key,
			'statement'   => $value,
			'submittedAt' => $now->format( 'Y-m-d\TH:i:s.v\Z' ),
			'orderId'     => Plugin::matching_order_id( $value['contract'], $value['email'] ),
		);
		$inserted = Store::insert( $record );
		if ( ! $inserted['inserted'] && null !== $inserted['existing'] ) {
			return self::replay( $inserted['existing'], $receipt_id );
		}

		$ack    = self::acknowledgement( $record );
		$status = self::notify( $record, $ack );
		try {
			/**
			 * Fires once for every new withdrawal, after it is stored.
			 *
			 * @param array $record Stored withdrawal.
			 * @param array $ack    Acknowledgement texts.
			 */
			do_action( 'cooloff_withdrawal_received', $record, $ack );
		} catch ( \Throwable $e ) {
			Plugin::log_error( 'hook', $e );
		}
		return self::success( 201, $ack, $value, $status );
	}

	/**
	 * Builds the acknowledgement for a stored record.
	 *
	 * @param array<string, mixed> $record Record.
	 * @return array<string, mixed>
	 */
	private static function acknowledgement( array $record ): array {
		$settings = Plugin::settings();
		return Acknowledgement::build(
			$record['statement'],
			$record['receiptId'],
			new \DateTimeImmutable( $record['submittedAt'] ),
			$settings['trader_name'],
			Plugin::time_zone()
		);
	}

	/**
	 * Sends the acknowledgement e-mail and records success.
	 *
	 * @param array<string, mixed> $record Record.
	 * @param array<string, mixed> $ack    Acknowledgement.
	 */
	private static function notify( array $record, array $ack ): string {
		// At most 5 acknowledgement e-mails per address and hour, so the endpoint cannot flood an inbox.
		// The withdrawal is always stored; a later resubmission sends the e-mail.
		if ( Rate_Limiter::consume( 'recipient|' . self::recipient_key( $record['statement']['email'] ), 5, 3600 ) > 0 ) {
			return 'pending';
		}
		$email = Acknowledgement::render_email( $ack );
		if ( ! Plugin::send_email( $email ) ) {
			Plugin::log_error( 'notify', new \RuntimeException( 'wp_mail failed' ) );
			return 'pending';
		}
		Store::mark_acknowledged( $record['storageKey'], gmdate( 'Y-m-d\TH:i:s.000\Z' ) );
		return 'sent';
	}

	/**
	 * Key for the per-recipient e-mail limit: lower case, sub-address tag
	 * (jane+1@example.eu) removed, so tags cannot multiply the limit.
	 *
	 * @param string $email E-mail address.
	 */
	public static function recipient_key( string $email ): string {
		$lower = function_exists( 'mb_strtolower' ) ? mb_strtolower( $email, 'UTF-8' ) : strtolower( $email );
		$at    = strrpos( $lower, '@' );
		if ( false === $at || 0 === $at ) {
			return $lower;
		}
		$local = substr( $lower, 0, $at );
		$plus  = strpos( $local, '+' );
		return ( false !== $plus && $plus > 0 ? substr( $local, 0, $plus ) : $local ) . substr( $lower, $at );
	}

	/**
	 * Sends acknowledgements that are still pending (mail failed or the
	 * recipient limit held them back). Runs from WP-Cron every 15 minutes, so
	 * the acknowledgement of Article 11a(4) goes out without undue delay even
	 * if the consumer never submits again.
	 *
	 * @param int $limit         Most records per run.
	 * @param int $max_age_hours Only records submitted within this many hours.
	 * @return array{sent: int, pending: int}
	 */
	public static function retry_pending( int $limit = 50, int $max_age_hours = 72 ): array {
		$since  = gmdate( 'Y-m-d\TH:i:s.000\Z', time() - max( 1, $max_age_hours ) * 3600 );
		$result = array(
			'sent'    => 0,
			'pending' => 0,
		);
		try {
			foreach ( Store::unacknowledged( $since, max( 1, min( 500, $limit ) ) ) as $record ) {
				$status = self::notify( $record, self::acknowledgement( $record ) );
				++$result[ 'sent' === $status ? 'sent' : 'pending' ];
			}
		} catch ( \Throwable $e ) {
			Plugin::log_error( 'retry', $e );
		}
		return $result;
	}

	/**
	 * Answers a repeated submission.
	 *
	 * @param array<string, mixed> $existing   Stored record.
	 * @param string               $receipt_id Receipt ID of the new request.
	 */
	private static function replay( array $existing, string $receipt_id ): \WP_REST_Response {
		if ( ! hash_equals( $existing['receiptId'], $receipt_id ) ) {
			return self::error( 409, 'idempotency_conflict' );
		}
		$ack    = self::acknowledgement( $existing );
		$status = null === $existing['acknowledgedAt'] ? self::notify( $existing, $ack ) : 'sent';
		return self::success( 200, $ack, $existing['statement'], $status );
	}

	/**
	 * Success response, same shape as the Cooloff package.
	 *
	 * @param int                  $status    HTTP status.
	 * @param array<string, mixed> $ack       Acknowledgement.
	 * @param array<string, mixed> $statement Statement.
	 * @param string               $sent      sent or pending.
	 */
	private static function success( int $status, array $ack, array $statement, string $sent ): \WP_REST_Response {
		$response = new \WP_REST_Response(
			array(
				'receiptId'       => $ack['receiptId'],
				'submittedAt'     => array(
					'utc'      => $ack['submittedAt']['utc'],
					'local'    => $ack['submittedAt']['local'],
					'timeZone' => $ack['submittedAt']['timeZone'],
				),
				'acknowledgement' => $sent,
				'statement'       => array(
					'name'     => $statement['name'],
					'contract' => $statement['contract'],
					'email'    => $statement['email'],
					'items'    => array_values( $statement['items'] ),
					'language' => $statement['language'],
				),
			),
			$status
		);
		foreach ( self::security_headers() as $name => $value ) {
			$response->header( $name, $value );
		}
		return $response;
	}
}
