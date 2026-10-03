// Assemble le jeu en un seul fichier HTML autonome (dist/lumen-null.html),
// jouable sans serveur (double-clic) : modules ES regroupés, CSS en ligne.
// Usage : node tools/build-single.js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFile(ROOT + p, 'utf8');

const modules = new Map();
const order = [];

async function visit(p) {
  if (modules.has(p)) return;
  modules.set(p, null);
  let code = await read(p);
  const deps = [];
  code = code.replace(/^﻿/, '');
  code = code.replace(/^import\s+\{([^}]+)\}\s+from\s+'([^']+)';?[ \t]*$/gm, (m, names, spec) => {
    const dep = posix.normalize(posix.join(posix.dirname(p), spec));
    deps.push(dep);
    const list = names.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': '));
    return `const { ${list.join(', ')} } = __mod['${dep}'];`;
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`Import non pris en charge dans ${p}`);
  const exported = [];
  // une seule déclaration par export (« export const a = 1, b = 2 » ne serait exporté qu'à moitié)
  const multi = code.match(/^export\s+(const|let)\s+[A-Za-z_$][\w$]*\s*=[^;\n]*,\s*[A-Za-z_$][\w$]*\s*=/m);
  if (multi) throw new Error(`Export à plusieurs déclarations non pris en charge dans ${p} : ${multi[0]}`);
  code = code.replace(/^export\s+(async\s+)?(function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (m, asy, kind, name) => {
    exported.push(name);
    return `${asy || ''}${kind} ${name}`;
  });
  code = code.replace(/^export\s+\{([^}]+)\};?[ \t]*$/gm, (m, names) => {
    for (const n of names.split(',')) if (n.trim()) exported.push(n.trim());
    return '';
  });
  if (/^\s*export\s/m.test(code)) throw new Error(`Export non pris en charge dans ${p}`);
  for (const d of deps) await visit(d);
  modules.set(p, { code, exported });
  order.push(p);
}

await visit('src/main.js');

let bundle = `(function () {\n'use strict';\nconst __mod = Object.create(null);\n`;
for (const p of order) {
  const { code, exported } = modules.get(p);
  bundle += `\n// ===== ${p} =====\n__mod['${p}'] = (function () {\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;
}
bundle += '\n})();\n';
// évite toute fermeture prématurée de la balise <script>
bundle = bundle.replace(/<\/script/gi, '<\\/script');

let html = await read('index.html');
const css = await read('style.css');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script>\n${bundle}</script>`);
await mkdir(ROOT + 'dist', { recursive: true });
// dist/lumen-null.html est à côté de assets/ : les musiques se chargent depuis ../assets/
const distHtml = html.replace('<script>\n(function () {', () => '<script>window.LN_ASSET_BASE = \'../\';</script>\n<script>\n(function () {');
await writeFile(ROOT + 'dist/lumen-null.html', distHtml, 'utf8');
console.log(`dist/lumen-null.html généré : ${order.length} modules, ${(html.length / 1024).toFixed(0)} Ko`);

// Variante « fragment » (sans doctype/html/head/body) pour un hébergement qui fournit
// son propre squelette de document : titre, police, styles, puis contenu et script.
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const keep = [
  head.match(/<title>[\s\S]*?<\/title>/)[0],
  ...head.match(/<link rel="preconnect"[^>]*>/g),
  head.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0],
  head.match(/<style>[\s\S]*?<\/style>/)[0],
];
const fragment = keep.join('\n') + '\n' + body.trim() + '\n';
await writeFile(ROOT + 'dist/lumen-null.fragment.html', fragment, 'utf8');
console.log(`dist/lumen-null.fragment.html généré (${(fragment.length / 1024).toFixed(0)} Ko)`);
