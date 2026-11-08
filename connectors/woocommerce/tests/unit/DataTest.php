<?php
/**
 * @package Cooloff
 */

use Cooloff\Data;
use PHPUnit\Framework\TestCase;

final class DataTest extends TestCase {

	public function test_plugin_data_files_equal_the_package_data_files(): void {
		foreach ( array( 'labels.json', 'messages.json' ) as $name ) {
			$this->assertFileEquals( cooloff_repo_root() . '/data/' . $name, dirname( __DIR__, 2 ) . '/cooloff/data/' . $name, $name );
		}
	}

	public function test_all_24_languages_have_both_official_labels(): void {
		$this->assertCount( 24, Data::LANGUAGES );
		foreach ( Data::LANGUAGES as $language ) {
			$labels = Data::labels( $language );
			$this->assertSame( 'official', $labels['source'] );
			$this->assertNotSame( '', $labels['withdrawLabel'] );
			$this->assertNotSame( '', $labels['confirmLabel'] );
			$this->assertStringContainsString( $labels['withdrawLabel'], $labels['withdrawSentence'] );
			$this->assertStringContainsString( $labels['confirmLabel'], $labels['confirmSentence'] );
		}
		$this->assertSame( 'withdraw from contract here', Data::labels( 'en' )['withdrawLabel'] );
		$this->assertSame( 'confirm withdrawal', Data::labels( 'en' )['confirmLabel'] );
		$this->assertSame( 'Vertrag widerrufen', Data::labels( 'de_DE' )['withdrawLabel'] );
	}

	public function test_language_resolution_falls_back_to_english(): void {
		$this->assertSame( 'lt', Data::resolve_language( 'lt_LT' ) );
		$this->assertSame( 'pt', Data::resolve_language( 'pt-BR' ) );
		$this->assertSame( 'en', Data::resolve_language( 'nb_NO' ) );
		$this->assertSame( 'de', Data::resolve_language( '', 'de' ) );
		$this->assertFalse( Data::is_language( 'LT' ) );
		$this->assertFalse( Data::is_language( 5 ) );
	}

	public function test_interpolate_leaves_unknown_placeholders(): void {
		$this->assertSame( 'To a@b.eu {x}', Data::interpolate( 'To {email} {x}', array( 'email' => 'a@b.eu' ) ) );
		$this->assertSame( '{other}', Data::interpolate( '{email}', array( 'email' => '{other}' ) ) );
	}

	public function test_messages_exist_for_every_language(): void {
		$keys = array_keys( Data::messages( 'en' ) );
		foreach ( Data::LANGUAGES as $language ) {
			$this->assertSame( $keys, array_keys( Data::messages( $language ) ), $language );
		}
	}
}
