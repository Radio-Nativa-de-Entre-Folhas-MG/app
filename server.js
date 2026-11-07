'use strict';
/**
 * Nativa FM PWA 1.4.0 — servidor opcional de mesma origem, sem pacotes npm.
 * Node.js 20+. Permite análise do espectro musical real sem depender do CORS da Zeno.
 * Acesso local: http://localhost:8080  |  Produção: publique atrás de HTTPS.
 */
const http = require('node:http');
const {createReadStream, stat} = require('node:fs');
const path = require('node:path');
const {Readable} = require('node:stream');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const STREAM = 'https://stream.zeno.fm/6lsfodimfbztv';
const META = 'https://api.zeno.fm/mounts/metadata/subscribe/6lsfodimfbztv';
const STATIC = new Set([
  '/index.html', '/styles.css', '/gate.js', '/landing.js', '/app.js', '/config.js', '/sw.js', '/manifest.webmanifest',
  '/assets/nativa-fm-original.png', '/assets/whatsapp.svg',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png', '/icons/favicon-64.png'
]);
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8',
  '.png':'image/png','.svg':'image/svg+xml'};
function secureHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self' https://api.zeno.fm https://stream.zeno.fm; " +
    "media-src 'self' https://stream.zeno.fm; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
}
function json(res, code, obj) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(obj));
}
function sendFile(req, res, pathname) {
  const name = pathname === '/' ? '/index.html' : pathname;
  if (!STATIC.has(name)) return json(res, 404, {error:'Arquivo não encontrado.'});
  const file = path.join(ROOT, name.slice(1));
  stat(file, (err, info) => {
    if (err || !info.isFile()) return json(res,404,{error:'Arquivo não encontrado.'});
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length':info.size,
      'Cache-Control': /\.(?:html|js|css|webmanifest)$/.test(name)
        ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}
async function proxyStream(res, target, isSSE) {
  const controller = new AbortController();
  let done = false;
  res.on('close', () => {if (!done) controller.abort();});
  try {
    const upstream = await fetch(target, {
      redirect:'follow', signal:controller.signal,
      headers: isSSE
        ? {'Accept':'text/event-stream','Cache-Control':'no-cache'}
        : {'Accept':'audio/mpeg, audio/aac, */*', 'Icy-MetaData':'0'}
    });
    if (!upstream.ok || !upstream.body) throw new Error(`Status remoto ${upstream.status}`);
    const headers = {
      'Content-Type': isSSE ? 'text/event-stream; charset=utf-8' : (upstream.headers.get('content-type') || 'audio/mpeg'),
      'Cache-Control': isSSE ? 'no-cache, no-transform' : 'no-store, no-transform',
      'X-Accel-Buffering':'no',
      'Access-Control-Allow-Origin':'*'
    };
    if (isSSE) headers.Connection = 'keep-alive';
    res.writeHead(200, headers);
    if (isSSE) res.flushHeaders();
    const readable = Readable.fromWeb(upstream.body);
    readable.on('error', () => {if (!res.destroyed) res.destroy();});
    readable.on('end', () => {done = true;});
    readable.pipe(res);
  } catch (err) {
    if (res.destroyed) return;
    console.error(`[Nativa FM] ${isSSE ? 'Metadados' : 'Streaming'}: ${err.message}`);
    if (res.headersSent) res.destroy();
    else json(res, 502, {error:'Origem indisponível; verifique o streaming da Zeno.'});
  }
}
const server = http.createServer((req, res) => {
  secureHeaders(res);
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') return json(res, 405, {error:'Método não permitido.'});
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch (_) {return json(res, 400, {error:'URL inválida.'});}
  if (pathname === '/api/health') return json(res, 200, {service:'nativa-fm-proxy', ready:true, version:'1.6.2'});
  if (pathname === '/api/stream' && method === 'GET') return void proxyStream(res, STREAM, false);
  if (pathname === '/api/metadata' && method === 'GET') return void proxyStream(res, META, true);
  if (pathname.startsWith('/api/')) return json(res, 404, {error:'Rota não encontrada.'});
  sendFile(req, res, pathname);
});
server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => {
  console.log(`\n Nativa FM PWA pronta: http://localhost:${PORT}`);
  console.log(' Streaming e metadados pela própria origem.');
  console.log(' Em produção, configure domínio + HTTPS.\n');
});
