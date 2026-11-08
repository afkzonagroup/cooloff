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
    // Decode entities in one pass so that "&amp;lt;" becomes "&lt;", not "<".
    .replace(/&(nbsp|amp|lt|gt|quot|#\d{1,7});/gu, (_, name) => {
      if (name === 'nbsp' || name === '#160') return ' ';
      if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
      return { amp: '&', lt: '<', gt: '>', quot: '"' }[name];
    })
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
