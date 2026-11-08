<?php
/**
 * Plugin wiring, settings, secret and e-mail.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Bootstraps the plugin.
 */
final class Plugin {

	const OPTION_SETTINGS = 'cooloff_settings';
	const OPTION_SECRET   = 'cooloff_secret';
	const CRON_HOOK       = 'cooloff_retry_acknowledgements';
	const CRON_SCHEDULE   = 'cooloff_quarter_hour';

	/**
	 * Registers hooks.
	 */
	public static function init(): void {
		add_action( 'rest_api_init', array( Rest::class, 'register' ) );
		add_action( 'init', array( Frontend::class, 'register' ) );
		add_action( 'cooloff_withdrawal_received', array( self::class, 'add_order_note' ), 10, 1 );
		add_filter( 'cron_schedules', array( self::class, 'cron_schedules' ) ); // phpcs:ignore WordPress.WP.CronInterval.ChangeDetected -- 15 minutes on purpose: Art. 11a(4) requires the acknowledgement without undue delay.
		add_action( self::CRON_HOOK, array( Rest::class, 'retry_pending' ), 10, 0 );
		add_action( 'init', array( self::class, 'schedule' ) );
		if ( is_admin() ) {
			Admin::register();
		}
	}

	/**
	 * Adds a 15-minute WP-Cron interval.
	 *
	 * @param array<string, array{interval: int, display: string}> $schedules Schedules.
	 * @return array<string, array{interval: int, display: string}>
	 */
	public static function cron_schedules( $schedules ): array {
		$schedules                        = is_array( $schedules ) ? $schedules : array();
		$schedules[ self::CRON_SCHEDULE ] = array(
			'interval' => 15 * MINUTE_IN_SECONDS,
			'display'  => __( 'Every 15 minutes (Cooloff)', 'cooloff' ),
		);
		return $schedules;
	}

	/**
	 * Schedules the retry of pending acknowledgements if it is not scheduled.
	 */
	public static function schedule(): void {
		if ( false === wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + 60, self::CRON_SCHEDULE, self::CRON_HOOK );
		}
	}

	/**
	 * Deactivation: remove the scheduled retry.
	 */
	public static function deactivate(): void {
		wp_clear_scheduled_hook( self::CRON_HOOK );
	}

	/**
	 * Activation: create the table and a secret.
	 */
	public static function activate(): void {
		Store::install();
		if ( false === get_option( self::OPTION_SECRET, false ) ) {
			add_option( self::OPTION_SECRET, bin2hex( random_bytes( 32 ) ), '', false );
		}
	}

	/**
	 * Settings with defaults.
	 *
	 * @return array{trader_name: string, allow_partial: bool, show_on_order: bool, delete_data: bool}
	 */
	public static function settings(): array {
		$saved = get_option( self::OPTION_SETTINGS, array() );
		$saved = is_array( $saved ) ? $saved : array();
		return array(
			'trader_name'   => isset( $saved['trader_name'] ) && is_string( $saved['trader_name'] ) && '' !== $saved['trader_name'] ? $saved['trader_name'] : (string) get_bloginfo( 'name' ),
			'allow_partial' => ! empty( $saved['allow_partial'] ),
			'show_on_order' => ! isset( $saved['show_on_order'] ) || ! empty( $saved['show_on_order'] ),
			'delete_data'   => ! empty( $saved['delete_data'] ),
		);
	}

	/**
	 * Secret for receipt IDs. Order of precedence: the COOLOFF_SECRET constant
	 * (wp-config.php), the COOLOFF_SECRET environment variable, then a random
	 * secret created on activation and stored in the options table.
	 *
	 * @throws \RuntimeException If no usable secret exists.
	 */
	public static function secret(): string {
		if ( defined( 'COOLOFF_SECRET' ) && is_string( constant( 'COOLOFF_SECRET' ) ) && strlen( constant( 'COOLOFF_SECRET' ) ) >= Receipt::MIN_SECRET_BYTES ) {
			return constant( 'COOLOFF_SECRET' );
		}
		$env = getenv( 'COOLOFF_SECRET' );
		if ( is_string( $env ) && strlen( $env ) >= Receipt::MIN_SECRET_BYTES ) {
			return $env;
		}
		$stored = get_option( self::OPTION_SECRET );
		if ( ! is_string( $stored ) || strlen( $stored ) < Receipt::MIN_SECRET_BYTES ) {
			$stored = bin2hex( random_bytes( 32 ) );
			update_option( self::OPTION_SECRET, $stored, false );
		}
		return $stored;
	}

	/**
	 * Shop time zone as an IANA name (falls back to UTC for raw offsets).
	 */
	public static function time_zone(): string {
		$zone = wp_timezone_string();
		return in_array( $zone, \DateTimeZone::listIdentifiers(), true ) ? $zone : 'UTC';
	}

	/**
	 * Sends the acknowledgement as HTML with a plain-text alternative.
	 *
	 * @param array{to: string, subject: string, text: string, html: string} $email Rendered e-mail.
	 */
	public static function send_email( array $email ): bool {
		$alt = static function ( $mailer ) use ( $email ): void {
			if ( is_object( $mailer ) && property_exists( $mailer, 'AltBody' ) ) {
				$mailer->AltBody = $email['text']; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- PHPMailer property.
			}
		};
		add_action( 'phpmailer_init', $alt );
		try {
			$sent = wp_mail( $email['to'], $email['subject'], $email['html'], array( 'Content-Type: text/html; charset=UTF-8' ) );
		} finally {
			remove_action( 'phpmailer_init', $alt );
		}
		return (bool) $sent;
	}

	/**
	 * Finds the WooCommerce order the withdrawal refers to: the order number
	 * must match and the billing e-mail must be the consumer's address.
	 *
	 * @param string $contract Contract details given by the consumer.
	 * @param string $email    Consumer e-mail.
	 */
	public static function matching_order_id( string $contract, string $email ): ?int {
		if ( ! function_exists( 'wc_get_order' ) ) {
			return null;
		}
		$number = ltrim( trim( $contract ), '#' );
		/**
		 * Finds the order for an order number. Shops with custom order numbers
		 * (sequential-number plugins) return the WC_Order here. The billing
		 * e-mail must still match.
		 *
		 * @param \WC_Order|null $order  Null by default.
		 * @param string         $number Order number given by the consumer.
		 */
		$order = apply_filters( 'cooloff_find_order', null, $number );
		if ( null === $order ) {
			if ( ! preg_match( '/^\d{1,18}$/', $number ) ) {
				return null;
			}
			$order = wc_get_order( (int) $number );
			// The consumer sees the order number, which is not always the order ID.
			if ( $order instanceof \WC_Order && (string) $order->get_order_number() !== $number ) {
				return null;
			}
		}
		if ( ! $order instanceof \WC_Order ) {
			return null;
		}
		return 0 === strcasecmp( (string) $order->get_billing_email(), $email ) ? (int) $order->get_id() : null;
	}

	/**
	 * Adds a private note to the matching order.
	 *
	 * @param array<string, mixed> $record Stored withdrawal.
	 */
	public static function add_order_note( array $record ): void {
		if ( empty( $record['orderId'] ) || ! function_exists( 'wc_get_order' ) ) {
			return;
		}
		$order = wc_get_order( (int) $record['orderId'] );
		if ( ! $order instanceof \WC_Order ) {
			return;
		}
		$items = $record['statement']['items'];
		$order->add_order_note(
			sprintf(
				/* translators: 1: receipt ID, 2: date and time in UTC, 3: items or "whole contract" */
				__( 'Withdrawal received through the withdrawal function. Receipt %1$s, submitted %2$s. Scope: %3$s.', 'cooloff' ),
				esc_html( $record['receiptId'] ),
				esc_html( $record['submittedAt'] ),
				array() === $items ? esc_html__( 'whole contract', 'cooloff' ) : esc_html( implode( '; ', $items ) )
			)
		);
	}

	/**
	 * Logs an error without personal data.
	 *
	 * @param string     $phase Phase.
	 * @param \Throwable $error Error.
	 */
	public static function log_error( string $phase, \Throwable $error ): void {
		if ( function_exists( 'wc_get_logger' ) ) {
			wc_get_logger()->error( 'Cooloff ' . $phase . ' error: ' . get_class( $error ), array( 'source' => 'cooloff' ) );
		}
	}
}
