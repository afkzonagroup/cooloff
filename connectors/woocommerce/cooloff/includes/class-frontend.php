<?php
/**
 * Front end: shortcode, block-free placement on the order page, script module.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Renders <withdrawal-button>.
 */
final class Frontend {

	const SCRIPT_ID = '@cooloff/withdrawal-button';

	/**
	 * Registers the shortcode, the order-page placement and the script module.
	 */
	public static function register(): void {
		add_shortcode( 'cooloff_withdrawal', array( self::class, 'shortcode' ) );
		if ( Plugin::settings()['show_on_order'] ) {
			add_action( 'woocommerce_order_details_after_order_table', array( self::class, 'order_details' ), 5 );
		}
		if ( function_exists( 'wp_register_script_module' ) ) {
			wp_register_script_module(
				self::SCRIPT_ID,
				plugins_url( 'assets/cooloff/component/define.js', COOLOFF_PLUGIN_FILE ),
				array(),
				COOLOFF_VERSION
			);
		}
	}

	/**
	 * Shortcode [cooloff_withdrawal contract="..."].
	 *
	 * @param array<string, string>|string $atts Attributes.
	 */
	public static function shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'contract' => '' ), is_array( $atts ) ? $atts : array(), 'cooloff_withdrawal' );
		return self::render( sanitize_text_field( (string) $atts['contract'] ) );
	}

	/**
	 * Shows the function under the order table on My account > Orders.
	 *
	 * @param \WC_Order $order Order.
	 */
	public static function order_details( $order ): void {
		if ( ! $order instanceof \WC_Order || ! is_account_page() ) {
			return;
		}
		echo self::render( (string) $order->get_order_number(), (string) $order->get_billing_email(), trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- render() escapes every attribute.
	}

	/**
	 * Renders the element. Every attribute value is escaped with esc_attr().
	 *
	 * @param string $contract Prefilled contract.
	 * @param string $email    Prefilled e-mail.
	 * @param string $name     Prefilled name.
	 */
	public static function render( string $contract = '', string $email = '', string $name = '' ): string {
		if ( function_exists( 'wp_enqueue_script_module' ) ) {
			wp_enqueue_script_module( self::SCRIPT_ID );
		}
		$user = wp_get_current_user();
		if ( $user->exists() ) {
			$email = '' !== $email ? $email : (string) $user->user_email;
			$name  = '' !== $name ? $name : trim( $user->first_name . ' ' . $user->last_name );
		}
		$attributes = array(
			'endpoint'         => rest_url( Rest::ROUTE_NAMESPACE . Rest::ROUTE ),
			'lang'             => Data::resolve_language( determine_locale() ),
			'prefill-name'     => $name,
			'prefill-contract' => $contract,
			'prefill-email'    => $email,
		);
		if ( $user->exists() ) {
			// Lets WordPress recognise the logged-in consumer; required by core for cookie-authenticated REST calls.
			$attributes['header-name']  = 'X-WP-Nonce';
			$attributes['header-value'] = wp_create_nonce( 'wp_rest' );
		}
		$html = '<withdrawal-button';
		foreach ( $attributes as $attr => $value ) {
			if ( '' !== $value ) {
				$html .= ' ' . $attr . '="' . esc_attr( $value ) . '"';
			}
		}
		if ( Plugin::settings()['allow_partial'] ) {
			$html .= ' allow-partial';
		}
		$html .= '></withdrawal-button>';
		$html .= '<noscript><p>' . esc_html__( 'To withdraw from your contract, please contact us by e-mail with your name and order number.', 'cooloff' ) . '</p></noscript>';
		return $html;
	}
}
