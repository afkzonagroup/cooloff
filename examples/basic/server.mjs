// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: Apache-2.0
//
// Minimal shop page with the withdrawal function. Run from the repository
// root with `npm run example`, then open http://localhost:3000.
//
// Withdrawals are appended to examples/basic/.data/withdrawals.jsonl. The
// acknowledgement e-mail is not sent: it is written to
// examples/basic/.data/outbox/ so you can read it.

import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { setInterval } from 'node:timers';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FileStore } from '@afkzona/cooloff/file-store';
import { createNodeHandler } from '@afkzona/cooloff/node';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
const distDir = resolve(here, '..', '..', 'dist');
const dataDir = join(here, '.data');
const outbox = join(dataDir, 'outbox');
const port = Number(process.env.PORT ?? 3000);
const origin = process.env.COOLOFF_ORIGIN ?? `http://localhost:${String(port)}`;

let secret = process.env.COOLOFF_SECRET;
if (secret === undefined || secret.length < 32) {
  secret = randomBytes(32).toString('base64url');
  console.warn('COOLOFF_SECRET is not set: using a random secret for this run. Receipt IDs will change after a restart.');
}

const withdraw = createNodeHandler({
  secret,
  trader: { name: 'Example Shop', timeZone: 'Europe/Vilnius' },
  allowedOrigins: [origin],
  store: new FileStore({ directory: dataDir }),
  allowPartial: true,
  notifier: {
    // Replace this with your mail transport. It receives subject, text and HTML.
    async send(email, ack) {
      await mkdir(outbox, { recursive: true, mode: 0o700 });
      const base = join(outbox, ack.receiptId);
      await writeFile(`${base}.txt`, `To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`, { mode: 0o600 });
      await writeFile(`${base}.html`, email.html, { mode: 0o600 });
      console.log(`Acknowledgement ${ack.receiptId} written to ${base}.txt`);
    },
  },
});

// Send acknowledgements that are still pending (Article 11a(4): without undue delay).
setInterval(() => {
  withdraw.retryPendingAcknowledgements().catch(() => undefined);
}, 15 * 60 * 1000).unref();

const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

/** Maps a URL path to a file, refusing anything outside the two folders. */
function fileFor(pathname) {
  if (pathname === '/') return join(publicDir, 'index.html');
  if (pathname === '/app.css' || pathname === '/app.js') return join(publicDir, pathname.slice(1));
  if (pathname.startsWith('/cooloff/') && pathname.endsWith('.js')) {
    const file = resolve(distDir, `.${pathname.slice('/cooloff'.length)}`);
    if (file.startsWith(distDir + sep)) return file;
  }
  return undefined;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname === '/api/withdrawal') {
    void withdraw(req, res);
    return;
  }
  const file = req.method === 'GET' ? fileFor(url.pathname) : undefined;
  if (file === undefined) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...PAGE_HEADERS }).end('Not found');
    return;
  }
  readFile(file).then(
    (content) => {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...PAGE_HEADERS }).end(content);
    },
    () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...PAGE_HEADERS }).end('Not found');
    },
  );
}).listen(port, () => {
  console.log(`Example shop on ${origin}`);
});
