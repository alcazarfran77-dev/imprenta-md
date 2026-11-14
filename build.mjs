// Builds Imprenta MD from src/ into one self-contained page.
//   node build.mjs             → index.html (everything embedded; works offline and on GitHub Pages)
//   node build.mjs --artifact  → also dist/imprenta-md.html (page fragment that loads libraries from jsDelivr)
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const root = path.dirname(new URL(import.meta.url).pathname);
const nm = p => path.join(root, 'node_modules', p);
const src = p => fs.readFileSync(path.join(root, 'src', p), 'utf8');
const read = p => fs.readFileSync(p, 'utf8');
const CDN = 'https://cdn.jsdelivr.net/npm/';

const CORE = [
  ['marked@15.0.12/lib/marked.umd.js', 'marked/lib/marked.umd.js'],
  ['marked-footnote@1.4.0/dist/index.umd.js', 'marked-footnote/dist/index.umd.js'],
  ['marked-gfm-heading-id@4.1.4/lib/index.umd.js', 'marked-gfm-heading-id/lib/index.umd.js'],
  ['dompurify@3.4.16/dist/purify.min.js', 'dompurify/dist/purify.min.js'],
  ['@highlightjs/cdn-assets@11.12.0/highlight.min.js', '@highlightjs/cdn-assets/highlight.min.js']
];
const LAZY = {
  katex: ['katex@0.19.0/dist/katex.min.js', 'katex/dist/katex.min.js'],
  mermaid: ['mermaid@12.1.0/dist/mermaid.min.js', 'mermaid/dist/mermaid.min.js'],
  shot: ['modern-screenshot@4.7.0/dist/index.js', 'modern-screenshot/dist/index.js'],
  jspdf: ['jspdf@4.2.1/dist/jspdf.umd.min.js', 'jspdf/dist/jspdf.umd.min.js'],
  docx: ['docx@9.8.1/dist/index.iife.js', 'docx/dist/index.iife.js', true],
  docxmath: ['docx@9.8.1/dist/math.iife.js', 'docx/dist/math.iife.js', true],
  jszip: ['jszip@3.10.2/dist/jszip.min.js', 'jszip/dist/jszip.min.js'],
  pdfjs: ['pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjs-dist/build/pdf.min.js'],
  pdfworker: ['pdfjs-dist@3.11.174/build/pdf.worker.min.js', 'pdfjs-dist/build/pdf.worker.min.js']
};

// sanity: installed versions must match the pinned CDN versions
for (const [cdn, local] of [...CORE, ...Object.values(LAZY)]) {
  const m = /^(@?[^@]+)@([^/]+)\//.exec(cdn);
  const v = JSON.parse(read(nm(m[1] + '/package.json'))).version;
  if (v !== m[2]) throw new Error(`${m[1]}: installed ${v}, CDN pinned ${m[2]}`);
}

const escScript = s => s.replace(/<\/script/gi, '\\x3C/script').replace(/<!--/g, '\\x3C!--');
const libText = (local, minify) => {
  let t = read(nm(local));
  if (minify) t = transformSync(t, { minify: true, legalComments: 'none' }).code;
  return escScript(t);
};

// KaTeX stylesheet with woff2 fonts embedded as data URIs
let katexCss = read(nm('katex/dist/katex.min.css'));
katexCss = katexCss.replace(/src:url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\)[^;}]*/g, (_, f) => {
  const b64 = fs.readFileSync(nm(`katex/dist/fonts/${f}.woff2`)).toString('base64');
  return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
});
if (/url\(fonts\//.test(katexCss)) throw new Error('KaTeX CSS still references external fonts');

const css = src('styles.css');
const sample = JSON.stringify(src('sample.md')).replace(/</g, '\\u003c');
const appFor = variant => escScript(src('app.js').replace('/*@@PDF2MD@@*/', () => src('pdf2md.js')).replace("'@@VARIANT@@'", () => JSON.stringify(variant)).replace("/*@@SAMPLE@@*/''", () => sample));
const template = src('template.html');
const katexBlock = `<script type="text/plain" id="katex-css">${katexCss.replace(/<\//g, '<\\/')}</script>`;

function build(variant) {
  let core, lazy;
  if (variant === 'artifact') {
    core = CORE.map(([cdn]) => `<script src="${CDN}${cdn}"></script>`).join('\n');
    const map = Object.fromEntries(Object.entries(LAZY).map(([k, [cdn]]) => [k, { url: CDN + cdn }]));
    lazy = `<script>window.__IMPRENTA_LIBS__ = ${JSON.stringify(map)};</script>`;
  } else {
    core = CORE.map(([, local]) => `<script>${libText(local)}</script>`).join('\n');
    const map = {};
    const blocks = Object.entries(LAZY).map(([k, [, local, minify]]) => {
      map[k] = { inline: 'lib-' + k };
      return `<script type="text/plain" id="lib-${k}">${libText(local, minify)}</script>`;
    });
    lazy = blocks.join('\n') + `\n<script>window.__IMPRENTA_LIBS__ = ${JSON.stringify(map)};</script>`;
  }
  let html = template
    .replace('/*@@CSS@@*/', () => css)
    .replace('<!--@@CORE_LIBS@@-->', () => core)
    .replace('<!--@@KATEX_CSS@@-->', () => katexBlock)
    .replace('<!--@@LAZY_LIBS@@-->', () => lazy)
    .replace('/*@@APP@@*/', () => appFor(variant));
  if (variant === 'offline') {
    const cut = html.indexOf('<div class="ui-app"');
    const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#006d8e" stroke-width="2"><circle cx="16" cy="16" r="8.5"/><circle cx="16" cy="16" r="3.2" fill="#006d8e" stroke="none"/><path d="M16 2v28M2 16h28"/></svg>');
    html = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="icon" href="' + icon + '">\n'
      + html.slice(0, cut).replace(/<meta name="claude:[^>]*>\n/, '') + '</head>\n<body>\n' + html.slice(cut) + '\n</body>\n</html>\n';
  }
  return html;
}

const targets = [['offline', 'index.html']];
if (process.argv.includes('--artifact')) { fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); targets.push(['artifact', 'dist/imprenta-md.html']); }
for (const [variant, file] of targets) {
  const out = build(variant);
  fs.writeFileSync(path.join(root, file), out);
  console.log(file, (Buffer.byteLength(out) / 1024 / 1024).toFixed(2) + ' MB');
}
