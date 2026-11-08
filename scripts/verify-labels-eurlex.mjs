// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Re-checks every official label against EUR-Lex. Needs network access, so it
// is not part of `npm run check`. Run: npm run build && node scripts/verify-labels-eurlex.mjs
//
// For each language it downloads the official HTML text of Directive (EU)
// 2023/2673, turns it into plain text and checks that the stored sentences of
// Article 11a(1) and (3), which quote the labels, appear verbatim.

const { OFFICIAL_LABELS } = await import('../dist/core/labels.js');

function toText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;|&#160;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, ' ');
}

let failures = 0;
for (const entry of OFFICIAL_LABELS) {
  const response = await fetch(entry.url, { headers: { 'User-Agent': 'cooloff-label-check' } });
  const text = toText(await response.text());
  const ok = text.includes(entry.withdrawSentence) && text.includes(entry.confirmSentence);
  console.log(`${entry.language}: ${ok ? 'ok' : 'MISMATCH'}`);
  if (!ok) failures += 1;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (failures > 0) {
  console.error(`${String(failures)} language(s) did not match`);
  process.exitCode = 1;
}
