<?php
/**
 * @package Cooloff
 */

use Cooloff\Acknowledgement;
use PHPUnit\Framework\TestCase;

final class AcknowledgementTest extends TestCase {

	/**
	 * @return array<string, mixed>
	 */
	private static function statement( array $overrides = array() ): array {
		return array_merge(
			array(
				'name'     => 'Jane Doe',
				'contract' => 'ORDER-1001',
				'email'    => 'jane@example.eu',
				'items'    => array(),
				'language' => 'en',
			),
			$overrides
		);
	}

	public function test_contains_content_and_both_timestamps(): void {
		$ack    = Acknowledgement::build( self::statement(), 'WD-1', new DateTimeImmutable( '2026-06-19T08:30:00.000Z' ), 'Example Shop', 'Europe/Vilnius' );
		$values = array_column( $ack['lines'], 'value' );
		foreach ( array( 'Example Shop', 'Jane Doe', 'ORDER-1001', 'jane@example.eu', 'Whole contract', '2026-06-19 11:30:00 (Europe/Vilnius, UTC+03:00)', '2026-06-19 08:30:00 UTC', 'WD-1' ) as $expected ) {
			$this->assertContains( $expected, $values );
		}
		$this->assertSame( 'I withdraw from the contract identified below.', $ack['statementText'] );
		$this->assertSame( '2026-06-19T11:30:00+03:00', $ack['submittedAt']['local'] );
		$this->assertSame( '2026-06-19T08:30:00.000Z', $ack['submittedAt']['utc'] );
	}

	public function test_dst_and_negative_offsets(): void {
		$this->assertSame( '2026-03-29T03:00:00+02:00', Acknowledgement::zoned( new DateTimeImmutable( '2026-03-29T01:00:00Z' ), 'Europe/Paris' )['local'] );
		$this->assertSame( '2025-12-31T23:30:00-01:00', Acknowledgement::zoned( new DateTimeImmutable( '2026-01-01T00:30:00Z' ), 'Atlantic/Azores' )['local'] );
	}

	public function test_escapes_every_dynamic_value_in_html(): void {
		$payloads = array( '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'><svg onload=alert(1)>", '<a href="javascript:alert(1)">x</a>' );
		foreach ( $payloads as $payload ) {
			$ack   = Acknowledgement::build( self::statement( array( 'name' => $payload, 'contract' => $payload, 'items' => array( $payload ) ) ), $payload, new DateTimeImmutable( '2026-06-19T08:30:00Z' ), $payload, 'UTC' );
			$email = Acknowledgement::render_email( $ack );
			$this->assertDoesNotMatchRegularExpression( '/<script|<img|<svg|<a /i', $email['html'] );
			$this->assertStringContainsString( Acknowledgement::escape( $payload ), $email['html'] );
			$this->assertStringContainsString( $payload, $email['text'] );
			$this->assertDoesNotMatchRegularExpression( '/[\r\n]/', $email['subject'] );
		}
	}

	public function test_header_value_strips_line_breaks(): void {
		$this->assertSame( 'a Bcc: x@y.eu', Acknowledgement::header_value( "a\r\nBcc: x@y.eu" ) );
		$this->assertSame( 200, mb_strlen( Acknowledgement::header_value( str_repeat( 'x', 300 ) ) ) );
	}
}
