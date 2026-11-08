<?php
/**
 * Acknowledgement of receipt (Art. 11a(4)) and its e-mail.
 *
 * @package Cooloff
 * @license Apache-2.0
 * Copyright 2026 MB AFKzona Group
 */

namespace Cooloff;

defined( 'ABSPATH' ) || exit;

/**
 * Port of src/core/acknowledgement.ts, src/core/time.ts and src/core/email.ts.
 */
final class Acknowledgement {

	/**
	 * Formats an instant in UTC and in a time zone.
	 *
	 * @param \DateTimeImmutable $instant   Instant.
	 * @param string             $time_zone IANA time zone.
	 * @return array{utc: string, local: string, timeZone: string, offset: string}
	 */
	public static function zoned( \DateTimeImmutable $instant, string $time_zone ): array {
		$utc   = $instant->setTimezone( new \DateTimeZone( 'UTC' ) );
		$local = $instant->setTimezone( new \DateTimeZone( $time_zone ) );
		return array(
			'utc'      => $utc->format( 'Y-m-d\TH:i:s.v\Z' ),
			'local'    => $local->format( 'Y-m-d\TH:i:sP' ),
			'timeZone' => $time_zone,
			'offset'   => $local->format( 'P' ),
		);
	}

	/**
	 * Builds the acknowledgement texts.
	 *
	 * @param array<string, mixed> $statement    Validated statement.
	 * @param string               $receipt_id   Receipt ID.
	 * @param \DateTimeImmutable   $submitted_at Instant of submission.
	 * @param string               $trader_name  Trader name.
	 * @param string               $time_zone    Shop time zone.
	 * @return array{receiptId: string, language: string, submittedAt: array{utc: string, local: string, timeZone: string, offset: string}, subject: string, title: string, intro: string, statementText: string, lines: list<array{label: string, value: string}>, to: string}
	 */
	public static function build( array $statement, string $receipt_id, \DateTimeImmutable $submitted_at, string $trader_name, string $time_zone ): array {
		$m     = Data::messages( $statement['language'] );
		$at    = self::zoned( $submitted_at, $time_zone );
		$wall  = static function ( string $iso ): string {
			return substr( $iso, 0, 10 ) . ' ' . substr( $iso, 11, 8 );
		};
		$lines = array(
			array(
				'label' => $m['traderLabel'],
				'value' => Text::normalise( $trader_name ),
			),
			array(
				'label' => $m['nameLabel'],
				'value' => $statement['name'],
			),
			array(
				'label' => $m['contractLabel'],
				'value' => $statement['contract'],
			),
			array(
				'label' => $m['emailLabel'],
				'value' => $statement['email'],
			),
			array(
				'label' => $m['itemsField'],
				'value' => array() === $statement['items'] ? $m['wholeContract'] : implode( '; ', $statement['items'] ),
			),
			array(
				'label' => $m['submittedAtLabel'],
				'value' => $wall( $at['local'] ) . ' (' . $time_zone . ', UTC' . $at['offset'] . ')',
			),
			array(
				'label' => $m['submittedAtLabel'] . ' (UTC)',
				'value' => $wall( $at['utc'] ) . ' UTC',
			),
			array(
				'label' => $m['receiptLabel'],
				'value' => $receipt_id,
			),
		);
		return array(
			'receiptId'     => $receipt_id,
			'language'      => $statement['language'],
			'submittedAt'   => $at,
			'subject'       => Data::interpolate( $m['emailSubject'], array( 'receipt' => $receipt_id ) ),
			'title'         => $m['successTitle'],
			'intro'         => $m['emailIntro'],
			'statementText' => $m['statementText'],
			'lines'         => $lines,
			'to'            => $statement['email'],
		);
	}

	/**
	 * Escapes text for HTML content and attributes.
	 *
	 * @param string $value Text.
	 */
	public static function escape( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8' );
	}

	/**
	 * Removes characters that could break a mail header and caps the length.
	 *
	 * @param string $value Header value.
	 */
	public static function header_value( string $value ): string {
		$single = trim( (string) preg_replace( '/[\x{0}-\x{1F}\x{7F}-\x{9F}\x{2028}\x{2029}]+/u', ' ', $value ) );
		return mb_substr( $single, 0, 200, 'UTF-8' );
	}

	/**
	 * Renders the e-mail. Every dynamic value in the HTML is escaped.
	 *
	 * @param array<string, mixed> $ack Result of build().
	 * @return array{to: string, subject: string, text: string, html: string}
	 */
	public static function render_email( array $ack ): array {
		$text_lines = array( $ack['intro'], '', $ack['statementText'], '' );
		$rows       = '';
		foreach ( $ack['lines'] as $line ) {
			$text_lines[] = $line['label'] . ': ' . $line['value'];
			$rows        .= '<tr><th scope="row" style="text-align:left;vertical-align:top;padding:4px 16px 4px 0;font-weight:600">'
				. self::escape( $line['label'] ) . '</th><td style="padding:4px 0">' . self::escape( $line['value'] ) . '</td></tr>';
		}
		$text_lines[] = '';
		$html         = '<!doctype html><html lang="' . self::escape( $ack['language'] ) . '"><head><meta charset="utf-8">'
			. '<title>' . self::escape( $ack['subject'] ) . '</title></head>'
			. '<body style="font-family:system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111;background:#fff;margin:0;padding:24px">'
			. '<h1 style="font-size:20px;margin:0 0 16px">' . self::escape( $ack['title'] ) . '</h1>'
			. '<p style="margin:0 0 16px">' . self::escape( $ack['intro'] ) . '</p>'
			. '<p style="margin:0 0 16px;font-weight:600">' . self::escape( $ack['statementText'] ) . '</p>'
			. '<table role="presentation" style="border-collapse:collapse">' . $rows . '</table>'
			. '</body></html>';
		return array(
			'to'      => $ack['to'],
			'subject' => self::header_value( $ack['subject'] ),
			'text'    => implode( "\n", $text_lines ),
			'html'    => $html,
		);
	}
}
