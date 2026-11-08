<?php
/**
 * Admin: settings and the list of withdrawals.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * WooCommerce > Withdrawals. Requires the manage_woocommerce capability.
 */
final class Admin {

	const CAPABILITY = 'manage_woocommerce';
	const PAGE       = 'cooloff-withdrawals';

	/**
	 * Registers hooks.
	 */
	public static function register(): void {
		add_action( 'admin_menu', array( self::class, 'menu' ), 60 );
		add_action( 'admin_init', array( self::class, 'settings' ) );
		// options.php checks manage_options by default; shop managers who may see this page may also save its settings.
		add_filter( 'option_page_capability_' . self::PAGE, array( self::class, 'capability' ) );
	}

	/**
	 * Capability needed to save the settings.
	 */
	public static function capability(): string {
		return self::CAPABILITY;
	}

	/**
	 * Adds the submenu page.
	 */
	public static function menu(): void {
		add_submenu_page(
			'woocommerce',
			__( 'Withdrawals', 'cooloff' ),
			__( 'Withdrawals', 'cooloff' ),
			self::CAPABILITY,
			self::PAGE,
			array( self::class, 'page' )
		);
	}

	/**
	 * Registers the settings with a sanitize callback.
	 */
	public static function settings(): void {
		register_setting(
			self::PAGE,
			Plugin::OPTION_SETTINGS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( self::class, 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Sanitises submitted settings.
	 *
	 * @param mixed $input Raw input.
	 * @return array{trader_name: string, allow_partial: bool, show_on_order: bool, delete_data: bool}
	 */
	public static function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : array();
		return array(
			'trader_name'   => mb_substr( sanitize_text_field( (string) ( $input['trader_name'] ?? '' ) ), 0, 200 ),
			'allow_partial' => ! empty( $input['allow_partial'] ),
			'show_on_order' => ! empty( $input['show_on_order'] ),
			'delete_data'   => ! empty( $input['delete_data'] ),
		);
	}

	/**
	 * Renders the page. Every value is escaped on output.
	 */
	public static function page(): void {
		if ( ! current_user_can( self::CAPABILITY ) ) {
			wp_die( esc_html__( 'You do not have permission to view this page.', 'cooloff' ), 403 );
		}
		$settings = Plugin::settings();
		$paged    = isset( $_GET['paged'] ) ? max( 1, absint( wp_unslash( $_GET['paged'] ) ) ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only pagination.
		$per_page = 50;
		$rows     = Store::latest( $per_page, ( $paged - 1 ) * $per_page );
		$total    = Store::count();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Withdrawals', 'cooloff' ); ?></h1>
			<p><?php esc_html_e( 'Withdrawals sent through the withdrawal function (Article 11a of Directive 2011/83/EU). Times are in UTC.', 'cooloff' ); ?></p>
			<p><?php esc_html_e( 'Shortcode for a page of its own:', 'cooloff' ); ?> <code>[cooloff_withdrawal]</code></p>
			<table class="widefat striped">
				<thead>
					<tr>
						<th scope="col"><?php esc_html_e( 'Receipt', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Submitted (UTC)', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Name', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Contract', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'E-mail', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Items', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Acknowledgement sent (UTC)', 'cooloff' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Order', 'cooloff' ); ?></th>
					</tr>
				</thead>
				<tbody>
				<?php if ( array() === $rows ) : ?>
					<tr><td colspan="8"><?php esc_html_e( 'No withdrawals yet.', 'cooloff' ); ?></td></tr>
				<?php endif; ?>
				<?php foreach ( $rows as $row ) : ?>
					<tr>
						<td><?php echo esc_html( $row['receiptId'] ); ?></td>
						<td><?php echo esc_html( $row['submittedAt'] ); ?></td>
						<td><?php echo esc_html( $row['statement']['name'] ); ?></td>
						<td><?php echo esc_html( $row['statement']['contract'] ); ?></td>
						<td><?php echo esc_html( $row['statement']['email'] ); ?></td>
						<td><?php echo esc_html( array() === $row['statement']['items'] ? __( 'Whole contract', 'cooloff' ) : implode( '; ', $row['statement']['items'] ) ); ?></td>
						<td><?php echo esc_html( $row['acknowledgedAt'] ?? __( 'Not yet', 'cooloff' ) ); ?></td>
						<td>
							<?php $cooloff_order = null !== $row['orderId'] && function_exists( 'wc_get_order' ) ? wc_get_order( $row['orderId'] ) : null; ?>
							<?php if ( $cooloff_order instanceof \WC_Order ) : ?>
								<a href="<?php echo esc_url( $cooloff_order->get_edit_order_url() ); ?>">#<?php echo esc_html( (string) $cooloff_order->get_order_number() ); ?></a>
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<?php if ( $total > $paged * $per_page ) : ?>
				<p><a class="button" href="<?php echo esc_url( add_query_arg( 'paged', $paged + 1, menu_page_url( self::PAGE, false ) ) ); ?>"><?php esc_html_e( 'Older', 'cooloff' ); ?></a></p>
			<?php endif; ?>

			<h2><?php esc_html_e( 'Settings', 'cooloff' ); ?></h2>
			<form method="post" action="options.php">
				<?php settings_fields( self::PAGE ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="cooloff-trader-name"><?php esc_html_e( 'Trader name in the acknowledgement', 'cooloff' ); ?></label></th>
						<td><input type="text" class="regular-text" id="cooloff-trader-name" name="<?php echo esc_attr( Plugin::OPTION_SETTINGS ); ?>[trader_name]" value="<?php echo esc_attr( $settings['trader_name'] ); ?>" maxlength="200"></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Options', 'cooloff' ); ?></th>
						<td>
							<p><label><input type="checkbox" name="<?php echo esc_attr( Plugin::OPTION_SETTINGS ); ?>[show_on_order]" value="1" <?php checked( $settings['show_on_order'] ); ?>> <?php esc_html_e( 'Show the withdrawal function on order pages in My account', 'cooloff' ); ?></label></p>
							<p><label><input type="checkbox" name="<?php echo esc_attr( Plugin::OPTION_SETTINGS ); ?>[allow_partial]" value="1" <?php checked( $settings['allow_partial'] ); ?>> <?php esc_html_e( 'Let consumers withdraw from part of an order', 'cooloff' ); ?></label></p>
							<p><label><input type="checkbox" name="<?php echo esc_attr( Plugin::OPTION_SETTINGS ); ?>[delete_data]" value="1" <?php checked( $settings['delete_data'] ); ?>> <?php esc_html_e( 'Delete all withdrawal records when the plugin is deleted', 'cooloff' ); ?></label></p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
