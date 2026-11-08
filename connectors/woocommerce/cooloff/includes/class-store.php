<?php
/**
 * Database storage of withdrawals.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Stores withdrawals in the custom table {prefix}cooloff_withdrawals.
 * Every query uses $wpdb->prepare() or $wpdb->insert()/update().
 */
final class Store {

	const DB_VERSION = '1';

	/**
	 * Table name with prefix.
	 */
	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'cooloff_withdrawals';
	}

	/**
	 * Creates or updates the table.
	 */
	public static function install(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$table} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				receipt_id varchar(32) NOT NULL,
				storage_key char(64) NOT NULL,
				name varchar(255) NOT NULL,
				contract varchar(255) NOT NULL,
				email varchar(254) NOT NULL,
				items text NOT NULL,
				language char(2) NOT NULL,
				submitted_at varchar(32) NOT NULL,
				acknowledged_at varchar(32) NULL,
				order_id bigint(20) unsigned NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY storage_key (storage_key),
				KEY receipt_id (receipt_id),
				KEY submitted_at (submitted_at)
			) {$charset};"
		);
		update_option( 'cooloff_db_version', self::DB_VERSION, false );
	}

	/**
	 * Converts a row to the record shape.
	 *
	 * @param array<string, mixed> $row Row.
	 * @return array<string, mixed>
	 */
	private static function to_record( array $row ): array {
		$items = json_decode( (string) $row['items'], true );
		return array(
			'id'             => (int) $row['id'],
			'receiptId'      => (string) $row['receipt_id'],
			'storageKey'     => (string) $row['storage_key'],
			'statement'      => array(
				'name'     => (string) $row['name'],
				'contract' => (string) $row['contract'],
				'email'    => (string) $row['email'],
				'items'    => is_array( $items ) ? array_values( array_filter( $items, 'is_string' ) ) : array(),
				'language' => (string) $row['language'],
			),
			'submittedAt'    => (string) $row['submitted_at'],
			'acknowledgedAt' => null === $row['acknowledged_at'] ? null : (string) $row['acknowledged_at'],
			'orderId'        => null === $row['order_id'] ? null : (int) $row['order_id'],
		);
	}

	/**
	 * Finds a withdrawal by storage key.
	 *
	 * @param string $storage_key HMAC of the idempotency key.
	 * @return array<string, mixed>|null
	 */
	public static function get( string $storage_key ): ?array {
		global $wpdb;
		$table = self::table();
		// Custom table; must read the latest state, so no caching. The table name comes from $wpdb->prefix.
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE storage_key = %s", $storage_key ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- see comment above.
		return is_array( $row ) ? self::to_record( $row ) : null;
	}

	/**
	 * Inserts a withdrawal unless the storage key exists (the UNIQUE key makes it atomic).
	 *
	 * @param array<string, mixed> $record Record.
	 * @return array{inserted: bool, existing: array<string, mixed>|null}
	 * @throws \RuntimeException If the insert failed for another reason.
	 */
	public static function insert( array $record ): array {
		global $wpdb;
		$statement = $record['statement'];
		// A duplicate storage key is expected on a race; keep the database error out of the response.
		$suppressed = $wpdb->suppress_errors( true );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- custom table.
		$ok = $wpdb->insert(
			self::table(),
			array(
				'receipt_id'   => $record['receiptId'],
				'storage_key'  => $record['storageKey'],
				'name'         => $statement['name'],
				'contract'     => $statement['contract'],
				'email'        => $statement['email'],
				'items'        => (string) wp_json_encode( array_values( $statement['items'] ) ),
				'language'     => $statement['language'],
				'submitted_at' => $record['submittedAt'],
				'order_id'     => $record['orderId'] ?? null,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d' )
		);
		$wpdb->suppress_errors( $suppressed );
		if ( false !== $ok ) {
			return array(
				'inserted' => true,
				'existing' => null,
			);
		}
		$existing = self::get( (string) $record['storageKey'] );
		if ( null === $existing ) {
			throw new \RuntimeException( 'Could not store the withdrawal' );
		}
		return array(
			'inserted' => false,
			'existing' => $existing,
		);
	}

	/**
	 * Records that the acknowledgement was sent.
	 *
	 * @param string $storage_key Storage key.
	 * @param string $at          ISO 8601 UTC.
	 */
	public static function mark_acknowledged( string $storage_key, string $at ): void {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- custom table.
		$wpdb->update( self::table(), array( 'acknowledged_at' => $at ), array( 'storage_key' => $storage_key ), array( '%s' ), array( '%s' ) );
	}

	/**
	 * Withdrawals without an acknowledgement submitted at or after $since, oldest first.
	 *
	 * @param string $since ISO 8601 UTC.
	 * @param int    $limit Rows.
	 * @return list<array<string, mixed>>
	 */
	public static function unacknowledged( string $since, int $limit = 50 ): array {
		global $wpdb;
		$table = self::table();
		// Custom table; must read the latest state, so no caching. The table name comes from $wpdb->prefix.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} WHERE acknowledged_at IS NULL AND submitted_at >= %s ORDER BY submitted_at ASC LIMIT %d", $since, max( 1, min( 500, $limit ) ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- see comment above.
		return array_map( array( self::class, 'to_record' ), is_array( $rows ) ? $rows : array() );
	}

	/**
	 * Latest withdrawals for the admin list.
	 *
	 * @param int $limit  Rows.
	 * @param int $offset Offset.
	 * @return list<array<string, mixed>>
	 */
	public static function latest( int $limit = 50, int $offset = 0 ): array {
		global $wpdb;
		$table = self::table();
		// Custom table, admin-only listing. The table name comes from $wpdb->prefix.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d OFFSET %d", max( 1, min( 200, $limit ) ), max( 0, $offset ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- see comment above.
		return array_map( array( self::class, 'to_record' ), is_array( $rows ) ? $rows : array() );
	}

	/**
	 * Number of stored withdrawals.
	 */
	public static function count(): int {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- custom table, no user input.
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}
}
