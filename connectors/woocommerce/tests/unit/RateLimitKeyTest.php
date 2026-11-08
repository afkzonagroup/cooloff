<?php
/**
 * @package Cooloff
 */

use Cooloff\Rate_Limiter;
use Cooloff\Rest;
use PHPUnit\Framework\TestCase;

/**
 * Same cases as test/hardening.test.ts for clientRateLimitKey() and recipientLimitKey().
 */
final class RateLimitKeyTest extends TestCase {

	public function test_ipv6_addresses_become_their_64_network(): void {
		$this->assertSame( '2001:db8:1:2::/64', Rate_Limiter::client_key( '2001:db8:1:2:aaaa:bbbb:cccc:dddd' ) );
		$this->assertSame( '2001:db8:1:2::/64', Rate_Limiter::client_key( '2001:DB8:1:2::1' ) );
		$this->assertSame( '2001:db8:1:2::/64', Rate_Limiter::client_key( '[2001:db8:1:2::1]' ) );
		$this->assertSame( 'fe80:0:0:0::/64', Rate_Limiter::client_key( 'fe80::1%eth0' ) );
		$this->assertSame( '0:0:0:0::/64', Rate_Limiter::client_key( '::1' ) );
		$this->assertSame( '2001:db8:0:0::/64', Rate_Limiter::client_key( '2001:db8::' ) );
		$this->assertSame( '64:ff9b:0:0::/64', Rate_Limiter::client_key( '64:ff9b::192.0.2.1' ) );
	}

	public function test_ipv4_mapped_addresses_become_ipv4(): void {
		$this->assertSame( '203.0.113.7', Rate_Limiter::client_key( '::ffff:203.0.113.7' ) );
		$this->assertSame( '203.0.113.7', Rate_Limiter::client_key( '::FFFF:cb00:7107' ) );
	}

	public function test_other_values_are_kept(): void {
		$this->assertSame( '203.0.113.7', Rate_Limiter::client_key( '203.0.113.7' ) );
		$this->assertSame( 'tenant-1', Rate_Limiter::client_key( 'tenant-1' ) );
		$this->assertSame( '1:2:3', Rate_Limiter::client_key( '1:2:3' ) );
		$this->assertSame( '1::2::3', Rate_Limiter::client_key( '1::2::3' ) );
		$this->assertSame( 100, strlen( Rate_Limiter::client_key( str_repeat( 'x', 500 ) ) ) );
		$this->assertSame( 'unknown', Rate_Limiter::client_key( '  ' ) );
	}

	public function test_recipient_key_ignores_case_and_tags(): void {
		$this->assertSame( 'jane@example.eu', Rest::recipient_key( 'Jane+Promo@Example.EU' ) );
		$this->assertSame( 'jane@example.eu', Rest::recipient_key( 'jane@example.eu' ) );
		$this->assertSame( '+tag@example.eu', Rest::recipient_key( '+tag@example.eu' ) );
		$this->assertSame( 'no-at-sign', Rest::recipient_key( 'no-at-sign' ) );
	}
}
