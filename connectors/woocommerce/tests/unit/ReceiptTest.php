<?php
/**
 * @package Cooloff
 */

use Cooloff\Acknowledgement;
use Cooloff\Receipt;
use PHPUnit\Framework\TestCase;

final class ReceiptTest extends TestCase {

	/**
	 * Shared vectors produced by the TypeScript implementation.
	 *
	 * @return array<string, mixed>
	 */
	private static function vectors(): array {
		return json_decode( (string) file_get_contents( cooloff_repo_root() . '/data/test-vectors.json' ), true );
	}

	public function test_shared_vectors_reproduce(): void {
		$file = self::vectors();
		$this->assertGreaterThanOrEqual( 5, count( $file['vectors'] ) );
		foreach ( $file['vectors'] as $vector ) {
			$input = $vector['input'];
			$this->assertSame( $vector['canonical'], Receipt::canonical( $input ) );
			$this->assertSame( $vector['receiptId'], Receipt::id( $file['secret'], $input ) );
			$this->assertSame( $vector['storageKey'], Receipt::storage_key( $file['secret'], $input['idempotencyKey'] ) );
			$ack = Acknowledgement::build( $input, $vector['receiptId'], new DateTimeImmutable( $file['submittedAt'] ), $file['trader']['name'], $file['trader']['timeZone'] );
			$this->assertSame( $vector['acknowledgement']['subject'], $ack['subject'] );
			$this->assertSame( $vector['acknowledgement']['lines'], $ack['lines'] );
			$this->assertSame( $vector['acknowledgement']['text'], Acknowledgement::render_email( $ack )['text'] );
		}
	}

	public function test_base32_vectors(): void {
		$this->assertSame( '', Receipt::base32( '' ) );
		$this->assertSame( '00', Receipt::base32( "\0" ) );
		$this->assertSame( 'ZW', Receipt::base32( "\xff" ) );
		$this->assertSame( 'CSQPYRK1E8', Receipt::base32( 'foobar' ) );
	}

	public function test_id_changes_with_every_field_and_the_secret(): void {
		$secret = str_repeat( 's', 32 );
		$base   = array(
			'name'           => 'Jane',
			'contract'       => 'C',
			'email'          => 'j@example.eu',
			'items'          => array(),
			'language'       => 'en',
			'idempotencyKey' => 'k_0123456789abcdef',
		);
		$id     = Receipt::id( $secret, $base );
		$this->assertMatchesRegularExpression( '/^WD-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/', $id );
		foreach ( array( 'name' => 'Jan', 'contract' => 'D', 'email' => 'k@example.eu', 'items' => array( 'x' ), 'language' => 'de', 'idempotencyKey' => 'k_0123456789abcdeX' ) as $field => $value ) {
			$this->assertNotSame( $id, Receipt::id( $secret, array_merge( $base, array( $field => $value ) ) ), $field );
		}
		$this->assertNotSame( $id, Receipt::id( $secret . 'x', $base ) );
	}

	public function test_short_secret_is_refused(): void {
		$this->expectException( InvalidArgumentException::class );
		Receipt::storage_key( 'short', 'k_0123456789abcdef' );
	}
}
