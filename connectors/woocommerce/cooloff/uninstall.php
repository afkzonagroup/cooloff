<?php
/**
 * Uninstall. Withdrawal records can be evidence that a consumer withdrew in
 * time, so they are kept unless the shop chose "Delete all withdrawal
 * records" in the settings.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

$cooloff_settings = get_option( 'cooloff_settings', array() );
if ( is_array( $cooloff_settings ) && ! empty( $cooloff_settings['delete_data'] ) ) {
	global $wpdb;
	$cooloff_table = $wpdb->prefix . 'cooloff_withdrawals';
	$wpdb->query( "DROP TABLE IF EXISTS {$cooloff_table}" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- fixed table name from $wpdb->prefix.
	delete_option( 'cooloff_secret' );
	delete_option( 'cooloff_db_version' );
}
delete_option( 'cooloff_settings' );
wp_clear_scheduled_hook( 'cooloff_retry_acknowledgements' );
