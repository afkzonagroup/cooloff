<?php
/**
 * Mirrors test/schema.test.ts in the Cooloff package.
 *
 * @package Cooloff
 */

use Cooloff\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase {

	/**
	 * @param array<string, mixed> $overrides Overrides.
	 * @return array<string, mixed>
	 */
	private static function body( array $overrides = array() ): array {
		$body = array_merge(
			array(
				'name'           => 'Jane Doe',
				'contract'       => 'ORDER-1001',
				'email'          => 'jane@example.eu',
				'idempotencyKey' => 'k_0123456789abcdef',
			),
			$overrides
		);
		return array_filter( $body, static fn( $v ) => '__unset__' !== $v );
	}

	/**
	 * @param mixed $body Body.
	 * @return list<string>
	 */
	private static function errors( $body, bool $partial = false ): array {
		$result = Validator::validate( $body, $partial );
		return $result['ok'] ? array() : array_map( static fn( $e ) => $e['field'] . ':' . $e['code'], $result['errors'] );
	}

	public function test_accepts_and_normalises(): void {
		$result = Validator::validate( self::body( array( 'name' => "  Jane \t Doe ", 'email' => 'Jane@Example.EU' ) ) );
		$this->assertTrue( $result['ok'] );
		$this->assertSame(
			array(
				'name'           => 'Jane Doe',
				'contract'       => 'ORDER-1001',
				'email'          => 'Jane@example.eu',
				'items'          => array(),
				'language'       => 'en',
				'idempotencyKey' => 'k_0123456789abcdef',
			),
			$result['value']
		);
	}

	public function test_refuses_non_objects_and_unknown_fields(): void {
		foreach ( array( null, 'x', 5, array( 'a', 'b' ) ) as $body ) {
			$this->assertSame( array( '_:not_an_object' ), self::errors( $body ) );
		}
		$this->assertSame( array( '_:unknown_field' ), self::errors( self::body( array( 'admin' => true ) ) ) );
		$this->assertSame( array( '_:unknown_field' ), self::errors( json_decode( '{"__proto__":{},"name":"a","contract":"b","email":"a@b.eu","idempotencyKey":"k_0123456789abcdef"}', true ) ) );
	}

	public function test_name_and_contract_rules(): void {
		foreach ( array( 'name' => Validator::NAME_MAX, 'contract' => Validator::CONTRACT_MAX ) as $field => $max ) {
			$this->assertSame( array( "$field:required" ), self::errors( self::body( array( $field => '__unset__' ) ) ) );
			$this->assertSame( array( "$field:required" ), self::errors( self::body( array( $field => '   ' ) ) ) );
			$this->assertSame( array( "$field:required" ), self::errors( self::body( array( $field => "\u{200B}" ) ) ) );
			$this->assertSame( array( "$field:invalid_type" ), self::errors( self::body( array( $field => 5 ) ) ) );
			$this->assertSame( array(), self::errors( self::body( array( $field => str_repeat( 'a', $max ) ) ) ) );
			$this->assertSame( array( "$field:too_long" ), self::errors( self::body( array( $field => str_repeat( 'a', $max + 1 ) ) ) ) );
			$this->assertSame( array( "$field:too_long" ), self::errors( self::body( array( $field => str_repeat( 'a', $max * 10 ) ) ) ) );
			$this->assertSame( array(), self::errors( self::body( array( $field => str_repeat( 'ž', $max ) ) ) ) );
		}
	}

	public function test_length_counts_like_javascript(): void {
		$this->assertSame( 3, \Cooloff\Text::length( 'abc' ) );
		$this->assertSame( 2, \Cooloff\Text::length( 'žą' ) );
		$this->assertSame( 2, \Cooloff\Text::length( "\u{1F600}" ) );
		$this->assertSame( 0, \Cooloff\Text::length( '' ) );
		$this->assertSame( 'Jane@example.eu', \Cooloff\Text::normalise_email( ' Jane@EXAMPLE.EU ' ) );
	}

	public function test_removes_bidi_and_control_characters(): void {
		$result = Validator::validate( self::body( array( 'name' => "Jane\u{202E}Doe\r\n" ) ) );
		$this->assertSame( 'Jane Doe', $result['value']['name'] );
	}

	public function test_email_rules(): void {
		$this->assertSame( array( 'email:required' ), self::errors( self::body( array( 'email' => '__unset__' ) ) ) );
		$this->assertSame( array( 'email:required' ), self::errors( self::body( array( 'email' => ' ' ) ) ) );
		$this->assertSame( array( 'email:invalid_type' ), self::errors( self::body( array( 'email' => array() ) ) ) );
		$this->assertSame( array( 'email:invalid_email' ), self::errors( self::body( array( 'email' => 'nope' ) ) ) );
		$this->assertSame( array( 'email:too_long' ), self::errors( self::body( array( 'email' => str_repeat( 'a', 5000 ) ) ) ) );
	}

	/**
	 * @return array<string, array{string}>
	 */
	public static function valid_emails(): array {
		return array_combine(
			$list = array( 'jane@example.eu', 'jane.doe+x@shop.example.co.uk', 'žydrūnas@pavyzdys.lt', 'user@xn--bcher-kva.example', "o'brien@example.ie" ),
			array_map( static fn( $e ) => array( $e ), $list )
		);
	}

	#[DataProvider( 'valid_emails' )]
	public function test_valid_email( string $email ): void {
		$this->assertTrue( Validator::is_valid_email( $email ) );
	}

	/**
	 * @return array<string, array{string}>
	 */
	public static function invalid_emails(): array {
		$list = array( '', 'plain', '@example.eu', 'jane@', 'jane@example', 'jane@@example.eu', 'jane@exa mple.eu', 'jane@example.123', 'jane..doe@example.eu', '.jane@example.eu', 'jane.@example.eu', 'jane@-example.eu', 'jane@example-.eu', 'jane@example..eu', '"jane"@example.eu', 'jane@[192.0.2.1]', "jane@example.eu\r\nBcc: victim@example.eu", "jane@example.eu\nX: y", "jane\u{202E}@example.eu", str_repeat( 'a', 65 ) . '@example.eu', 'jane@' . str_repeat( 'a', 64 ) . '.eu' );
		$out  = array();
		foreach ( $list as $i => $email ) {
			$out[ 'case ' . $i ] = array( $email );
		}
		return $out;
	}

	#[DataProvider( 'invalid_emails' )]
	public function test_invalid_email( string $email ): void {
		$this->assertFalse( Validator::is_valid_email( $email ) );
	}

	public function test_items_rules(): void {
		$this->assertSame( array( 'items:partial_not_allowed' ), self::errors( self::body( array( 'items' => array( 'Shoes' ) ) ) ) );
		$this->assertSame( array( 'Shoes' ), Validator::validate( self::body( array( 'items' => array( ' Shoes ', '', ' ' ) ) ), true )['value']['items'] );
		$this->assertSame( array(), self::errors( self::body( array( 'items' => array() ) ) ) );
		$this->assertSame( array( 'items:invalid_type' ), self::errors( self::body( array( 'items' => 'Shoes' ) ), true ) );
		$this->assertSame( array( 'items:invalid_type' ), self::errors( self::body( array( 'items' => array( 'a' => 'x' ) ) ), true ) );
		$this->assertSame( array( 'items:invalid_type' ), self::errors( self::body( array( 'items' => array( 1 ) ) ), true ) );
		$this->assertSame( array( 'items:too_many_items' ), self::errors( self::body( array( 'items' => array_fill( 0, 51, 'x' ) ) ), true ) );
		$this->assertSame( array( 'items:item_too_long' ), self::errors( self::body( array( 'items' => array( str_repeat( 'x', 201 ) ) ) ), true ) );
	}

	public function test_language_rules(): void {
		$this->assertSame( 'de', Validator::validate( self::body( array( 'language' => 'de' ) ) )['value']['language'] );
		$this->assertSame( 'lt', Validator::validate( self::body(), false, 'lt' )['value']['language'] );
		foreach ( array( 'de-AT', 'xx', 1 ) as $value ) {
			$this->assertSame( array( 'language:invalid_language' ), self::errors( self::body( array( 'language' => $value ) ) ) );
		}
	}

	public function test_idempotency_key_rules(): void {
		foreach ( array( '__unset__', 1, '', 'short', str_repeat( 'x', 65 ), 'k_0123456789abcde!', 'k 0123456789abcdef' ) as $key ) {
			$this->assertSame( array( 'idempotencyKey:invalid_idempotency_key' ), self::errors( self::body( array( 'idempotencyKey' => $key ) ) ) );
		}
		$this->assertSame( array(), self::errors( self::body( array( 'idempotencyKey' => str_repeat( 'a', 64 ) ) ) ) );
	}

	public function test_reports_all_errors(): void {
		$this->assertSame(
			array( 'name:required', 'contract:required', 'email:required', 'idempotencyKey:invalid_idempotency_key' ),
			self::errors( array( 'name' => null ) )
		);
	}
}
