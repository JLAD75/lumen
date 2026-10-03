// Serveur statique minimal, sans dépendance : node server.js [port]
// Écoute sur toutes les interfaces pour tester depuis un smartphone du même réseau.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT + sep)) && file !== normalize(ROOT)) { res.writeHead(403); res.end('Interdit'); return; }
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not file');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LUMEN//NULL — serveur prêt`);
  console.log(`  Sur cet ordinateur : http://localhost:${PORT}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Sur le réseau local : http://${a.address}:${PORT}/`);
  }
  console.log('  (Ctrl+C pour arrêter)');
});
