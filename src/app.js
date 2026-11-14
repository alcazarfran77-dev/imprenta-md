(function () {
'use strict';

const VARIANT = '@@VARIANT@@';
const SAMPLES = /*@@SAMPLE@@*/{};
const isSample = md => md === SAMPLES.es || md === SAMPLES.en;
/*@@I18N@@*/

/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtNum = (n, d = 0) => Number(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const store = {
  get(k, d) { try { const v = localStorage.getItem('imprenta-md:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('imprenta-md:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};
function baseName(name) { return (name || 'documento').split('/').pop().replace(/\.(md|markdown|mdown|mkdn?|txt)$/i, '') || 'documento'; }
function safeFile(name) { return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'documento'; }
function blobToDataURL(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); }); }
function dataURLToBytes(url) {
  const i = url.indexOf(','); const meta = url.slice(5, i); const body = url.slice(i + 1);
  if (/;base64/i.test(meta)) { const bin = atob(body); const out = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j); return { mime: meta.split(';')[0].toLowerCase(), bytes: out }; }
  return { mime: meta.split(';')[0].toLowerCase(), bytes: new TextEncoder().encode(decodeURIComponent(body)) };
}
function canvasToBlob(c, type, q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('No se pudo generar la imagen.')), type, q)); }

/* =====================================================================
   Page geometry
   ===================================================================== */
const MM = 96 / 25.4;
const PAGE_SIZES = {
  letter: { w: 215.9, h: 279.4 },
  a4: { w: 210, h: 297 },
  oficio: { w: 216, h: 340 },
  legal: { w: 215.9, h: 355.6 }
};
const MARGINS = {
  estrecho: { mm: 12.7 },
  moderado: { mm: 19.05 },
  normal: { mm: 25.4 }
};
const DEFAULTS = { format: 'pdf', theme: 'github', page: 'letter', margin: 'normal', orient: 'portrait', fs: 11, pdfres: 2, pdftext: true, pdfnum: true, docxnum: true, imgtype: 'png', imgres: 2, lang: (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en', imgmode: 'single', mdimg: 'zip', fm: 'hide', zoom: 'fit' };
const opts = Object.assign({}, DEFAULTS, store.get('opts', {}));
for (const k of Object.keys(DEFAULTS)) if (typeof opts[k] !== typeof DEFAULTS[k]) opts[k] = DEFAULTS[k];
if (!['pdf', 'docx', 'image', 'md'].includes(opts.format)) opts.format = DEFAULTS.format;
if (!['es', 'en'].includes(opts.lang)) opts.lang = DEFAULTS.lang;
if (!PAGE_SIZES[opts.page]) opts.page = DEFAULTS.page;
if (!MARGINS[opts.margin]) opts.margin = DEFAULTS.margin;

function geom() {
  const ps = PAGE_SIZES[opts.page];
  let w = ps.w, h = ps.h;
  if (opts.orient === 'landscape') { const t = w; w = h; h = t; }
  const m = MARGINS[opts.margin].mm;
  return { wmm: w, hmm: h, mmm: m, pageW: w * MM, pageH: h * MM, m: m * MM, contentW: (w - 2 * m) * MM, contentH: (h - 2 * m) * MM };
}

/* =====================================================================
   Lazy libraries (CDN in the published page, embedded in the offline file)
   ===================================================================== */
const LIBS = window.__IMPRENTA_LIBS__ || {};
const libPromises = {};
function loadLib(name) {
  if (libPromises[name]) return libPromises[name];
  const def = LIBS[name];
  if (!def) return Promise.reject(new Error(t('lib.missing', name)));
  libPromises[name] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    let blobUrl = null;
    if (def.inline) {
      const node = document.getElementById(def.inline);
      blobUrl = URL.createObjectURL(new Blob([node.textContent], { type: 'text/javascript' }));
      s.src = blobUrl;
    } else s.src = def.url;
    s.onload = () => { if (blobUrl) URL.revokeObjectURL(blobUrl); resolve(); };
    s.onerror = () => { delete libPromises[name]; reject(new Error(t('lib.failed', name))); };
    document.head.appendChild(s);
  });
  return libPromises[name];
}
let katexCss = null;
async function ensureKatex() {
  await loadLib('katex');
  if (!katexCss) {
    const node = document.getElementById('katex-css');
    katexCss = node ? node.textContent : '';
    const st = document.createElement('style'); st.id = 'katex-style'; st.textContent = katexCss; document.head.appendChild(st);
  }
}
function katexFontCss() {
  if (!katexCss) return '';
  return (katexCss.match(/@font-face\s*{[^}]*}/g) || []).join('\n');
}

/* =====================================================================
   Saving files (host capability inside claude.ai, plain download offline)
   ===================================================================== */
const hasHost = !!(window.claude && typeof window.claude.use === 'function');
const dlPromise = hasHost ? Promise.resolve().then(() => window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
async function saveFile(filename, blob) {
  if (hasHost) {
    const dl = await dlPromise;
    if (!dl) { toast(t('save.noHost'), true); return false; }
    try { await dl.save({ filename, data: blob }); toast(t('save.saved', filename)); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') toast(t('save.declined'));
      else if (code === 'rate_limited') toast(t('save.pending'), true);
      else if (code === 'too_large') toast(t('save.tooLarge'), true);
      else toast(t('save.failed', code || (e && e.message) || e), true);
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 8000);
  toast(t('save.downloaded', filename));
  return true;
}

/* =====================================================================
   Markdown → HTML
   ===================================================================== */
const mathBlockExt = {
  name: 'mathBlock', level: 'block',
  start(src) { const m = /(^|\n) {0,3}(\$\$|\\\[)/.exec(src); return m ? m.index + m[1].length : undefined; },
  tokenizer(src) {
    const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src) || /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/.exec(src);
    if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim() };
  },
  renderer(t) { return '<div class="math-display" data-i="' + (parseStore.math.push(t.text) - 1) + '"></div>\n'; }
};
const mathInlineExt = {
  name: 'mathInline', level: 'inline',
  start(src) { const i = src.search(/\$|\\\(/); return i < 0 ? undefined : i; },
  tokenizer(src) {
    let m = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: true };
    m = /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$(?![0-9A-Za-z])/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1], display: false };
    m = /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: false };
  },
  renderer(t) { return '<span class="' + (t.display ? 'math-display' : 'math-inline') + '" data-i="' + (parseStore.math.push(t.text) - 1) + '"></span>'; }
};
// Sources for diagrams and formulas are kept out of the HTML string so the sanitizer
// (which drops attributes containing "-->" or "]>") cannot damage them.
let parseStore = { math: [], mermaid: [] };

let parser = null;
function getParser() {
  if (parser) return parser;
  const M = new marked.Marked();
  M.use({ gfm: true, breaks: false });
  if (window.markedGfmHeadingId) M.use(window.markedGfmHeadingId.gfmHeadingId({}));
  if (window.markedFootnote) M.use(window.markedFootnote({ description: 'Notas', refMarkers: false }));
  M.use({ extensions: [mathBlockExt, mathInlineExt] });
  M.use({
    renderer: {
      code(token) {
        const text = token.text || '';
        const lang = String(token.lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (lang === 'mermaid') return '<div class="mermaid-box" data-i="' + (parseStore.mermaid.push(text) - 1) + '"></div>\n';
        if (lang === 'math' || lang === 'katex') return '<div class="math-display" data-i="' + (parseStore.math.push(text) - 1) + '"></div>\n';
        let html;
        if (lang && window.hljs && hljs.getLanguage(lang)) {
          try { html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; } catch (e) { html = esc(text); }
        } else html = esc(text);
        return '<pre' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code class="hljs' + (lang ? ' language-' + esc(lang) : '') + '">' + html + '</code></pre>\n';
      }
    }
  });
  parser = M;
  return M;
}

function preprocess(src) {
  let s = String(src || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  let fm = null;
  const m = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(s);
  if (m && /^[\w"'-][^\n]*:/m.test(m[1])) { fm = m[1]; s = s.slice(m[0].length); }
  const lines = s.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(L);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && /^ {0,3}(`{3,}|~{3,})\s*$/.test(L)) fence = null;
      continue;
    }
    if (!fence && /^\s*(\\newpage|\\pagebreak|\\clearpage|<!--\s*(page-?break|new-?page|salto(\s+de\s+p[aá]gina)?)\s*-->)\s*$/i.test(L)) lines[i] = '\n<div class="pb"></div>\n';
  }
  return { body: lines.join('\n'), fm };
}

function mdToHtml(src) {
  const { body, fm } = preprocess(src);
  parseStore = { math: [], mermaid: [] };
  const raw = getParser().parse(body);
  const html = DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'align', 'start'], FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'], ALLOW_DATA_ATTR: true });
  return { html, fm, store: parseStore };
}

function guessLang(text) {
  const es = (text.match(/\b(el|la|los|las|de|del|que|y|en|para|con|una|por|se|es|como)\b/gi) || []).length;
  const en = (text.match(/\b(the|and|of|to|is|in|for|with|that|this|are|on|as)\b/gi) || []).length;
  return es >= en ? 'es' : 'en';
}
const ALERTS = { note: ['Nota', 'Note'], tip: ['Consejo', 'Tip'], important: ['Importante', 'Important'], warning: ['Advertencia', 'Warning'], caution: ['Precaución', 'Caution'] };

function fmTable(fm) {
  const t = document.createElement('table'); t.className = 'fm-table';
  const tb = document.createElement('tbody'); t.appendChild(tb);
  let last = null;
  for (const line of fm.split('\n')) {
    const m = /^([^\s:#][^:]*):\s*(.*)$/.exec(line);
    if (m) {
      const tr = document.createElement('tr'); const th = document.createElement('th'); const td = document.createElement('td');
      th.textContent = m[1].trim(); td.textContent = m[2].trim().replace(/^["']|["']$/g, '');
      tr.append(th, td); tb.appendChild(tr); last = td;
    } else if (last && line.trim()) last.textContent += (last.textContent ? ' ' : '') + line.trim().replace(/^-\s*/, '');
  }
  return t;
}

/* ---------- assets (images dropped with the document) ---------- */
const assets = new Map();
function normPath(p) { const out = []; for (const seg of String(p).replace(/\\/g, '/').split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); } return out.join('/'); }
function addAsset(path, url) {
  const p = normPath(path).toLowerCase();
  assets.set(p, url);
  const b = '#' + p.split('/').pop();
  if (!assets.has(b)) assets.set(b, url);
}
function findAsset(src, docPath) {
  let s = src; try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ }
  s = s.split(/[?#]/)[0].replace(/\\/g, '/');
  const dir = docPath && docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
  for (const c of [normPath(dir + s), normPath(s)]) { const hit = assets.get(c.toLowerCase()); if (hit) return hit; }
  return assets.get('#' + normPath(s).split('/').pop().toLowerCase()) || null;
}
function missingBox(img, label) {
  const span = document.createElement('span'); span.className = 'img-missing';
  span.textContent = t('img.missing', label);
  img.replaceWith(span);
}
function waitImg(img) {
  return new Promise(res => {
    if (img.complete) return res();
    const t = setTimeout(res, 15000);
    img.addEventListener('load', () => { clearTimeout(t); res(); }, { once: true });
    img.addEventListener('error', () => { clearTimeout(t); res(); }, { once: true });
  });
}
async function embedRemote(img, url, w) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url.startsWith('//') ? 'https:' + url : url, { signal: ctrl.signal, mode: 'cors' });
    clearTimeout(t);
    if (!res.ok) throw new Error(res.status);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) throw new Error('no es imagen');
    img.src = await blobToDataURL(blob);
  } catch (e) { img.dataset.remote = '1'; w.remote.push(url); }
}
async function resolveImages(root, doc, w) {
  const jobs = [];
  for (const img of $$('img', root)) {
    const raw = img.getAttribute('src') || '';
    if (!raw || /^(data|blob):/i.test(raw)) continue;
    if (/^(https?:)?\/\//i.test(raw)) { img.removeAttribute('src'); jobs.push(embedRemote(img, raw, w).then(() => { if (!img.getAttribute('src')) img.src = raw; })); continue; }
    const hit = findAsset(raw, doc.path);
    if (hit) img.src = hit; else { w.missing.push(raw); missingBox(img, raw); }
  }
  await Promise.all(jobs);
  const imgs = $$('img', root);
  await Promise.all(imgs.map(waitImg));
  for (const img of imgs) {
    if (img.naturalWidth === 0) {
      const src = img.getAttribute('src') || '';
      if (img.dataset.remote) { w.remote = w.remote.filter(u => u !== src); w.remoteBroken.push(src); }
      missingBox(img, img.getAttribute('alt') || src.split('/').pop() || t('img.noName'));
    }
  }
}

let mermaidReady = false, mmdSeq = 0;
async function renderMermaid(root, store) {
  const boxes = $$('.mermaid-box', root);
  if (!boxes.length) return;
  await loadLib('mermaid');
  if (!mermaidReady) {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: '"Segoe UI", Helvetica, Arial, sans-serif' });
    mermaidReady = true;
  }
  for (const box of boxes) {
    const id = 'imd-mmd-' + (++mmdSeq);
    try {
      const { svg } = await window.mermaid.render(id, store.mermaid[Number(box.getAttribute('data-i'))] || '');
      box.innerHTML = svg;
    } catch (e) {
      box.innerHTML = '<pre class="mermaid-error">' + esc(t('mermaid.error', (e && e.message) || e)) + '</pre>';
      const junk = document.getElementById('d' + id) || document.getElementById(id); if (junk) junk.remove();
    }
  }
}
async function renderMath(root, store) {
  const els = $$('.math-inline, .math-display', root);
  if (!els.length) return;
  for (const el of els) el.setAttribute('data-tex', store.math[Number(el.getAttribute('data-i'))] || '');
  await ensureKatex();
  for (const el of els) {
    const tex = el.getAttribute('data-tex') || '';
    try { katex.render(tex, el, { displayMode: el.classList.contains('math-display'), throwOnError: false, output: 'html', strict: 'ignore' }); }
    catch (e) { el.textContent = tex; el.classList.add('math-error'); }
  }
}

async function decorate(root, doc, lang, w, store) {
  for (const bq of $$('blockquote', root)) {
    const p = bq.firstElementChild;
    if (!p || p.tagName !== 'P' || !p.firstChild || p.firstChild.nodeType !== 3) continue;
    const m = /^\s*\[!(note|tip|important|warning|caution)\]\s*/i.exec(p.firstChild.nodeValue);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    p.firstChild.nodeValue = p.firstChild.nodeValue.slice(m[0].length);
    if (p.firstChild && p.firstChild.nodeName === 'BR') p.firstChild.remove();
    if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    bq.classList.add('markdown-alert', 'markdown-alert-' + kind);
    const t = document.createElement('p'); t.className = 'markdown-alert-title';
    t.textContent = ALERTS[kind][lang === 'es' ? 0 : 1];
    bq.prepend(t);
  }
  for (const cb of $$('li > input[type="checkbox"], li > p:first-child > input[type="checkbox"]', root)) {
    const li = cb.closest('li'); li.classList.add('task-list-item');
    if (li.parentElement) li.parentElement.classList.add('contains-task-list');
    cb.setAttribute('disabled', '');
  }
  $$('details', root).forEach(d => { d.open = true; });
  for (const a of $$('a[href]', root)) {
    if (/^(https?:|mailto:)/i.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  }
  const fn = $('section.footnotes', root);
  if (fn) {
    const prev = fn.previousElementSibling;
    if (!(prev && prev.tagName === 'HR')) { const hr = document.createElement('hr'); hr.className = 'fn-rule'; fn.prepend(hr); }
  }
  await resolveImages(root, doc, w);
  await renderMath(root, store);
  await renderMermaid(root, store);
}

/* =====================================================================
   App state & UI
   ===================================================================== */
const state = { docs: [], current: -1, seq: 0 };
const els = {
  editor: $('#editor'), tabs: $('#tabs'), doc: $('#doc'), paper: $('#paper'), frame: $('#paper-frame'), desk: $('#desk'),
  breaks: $('#breaks'), empty: $('#empty'), notices: $('#notices'), meta: $('#proof-meta'), srcStats: $('#src-stats'), srcEnc: $('#src-enc'),
  exportBtn: $('#btn-export'), exportLabel: $('#export-label'), outName: $('#out-name'), exportAll: $('#btn-export-all'),
  busy: $('#busy'), busyTitle: $('#busy-title'), busyStep: $('#busy-step'), busyBar: $('#busy-bar'), toast: $('#toast'), drop: $('#drop')
};
function current() { return state.docs[state.current] || null; }

let toastTimer = null;
function toast(msg, isErr) {
  els.toast.textContent = msg; els.toast.classList.toggle('ui-err', !!isErr); els.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { els.toast.hidden = true; }, isErr ? 7000 : 3500);
}
function busy(on, title) {
  els.busy.hidden = !on; if (title) els.busyTitle.textContent = title;
  if (on) { els.busyStep.textContent = ''; els.busyBar.style.width = '0%'; }
  els.exportBtn.disabled = !!on;
}
function progress(step, frac) { els.busyStep.textContent = step || ''; if (frac != null) els.busyBar.style.width = Math.round(frac * 100) + '%'; }

function addDoc(name, md, path, enc) {
  const d = { id: ++state.seq, name, md, path: path || name, enc: enc || 'UTF-8' };
  state.docs.push(d);
  return d;
}
function persistDocs() {
  const data = state.docs.map(d => ({ name: d.name, md: d.md, path: d.path, enc: d.enc, pdfInfo: d.pdfInfo }));
  const size = JSON.stringify(data).length;
  if (size < 1500000) { store.set('docs', data); store.set('current', state.current); }
}
function renderTabs() {
  els.tabs.replaceChildren();
  state.docs.forEach((d, i) => {
    const tab = document.createElement('div'); tab.className = 'ui-tab'; tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(i === state.current)); tab.tabIndex = 0; tab.title = d.path;
    const nm = document.createElement('span'); nm.className = 'ui-tab-name'; nm.textContent = d.name;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ui-tab-x'; x.setAttribute('aria-label', t('tab.close', d.name));
    x.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', ev => { ev.stopPropagation(); closeDoc(i); });
    tab.addEventListener('click', () => selectDoc(i));
    tab.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectDoc(i); } });
    tab.append(nm, x); els.tabs.appendChild(tab);
  });
  const n = state.docs.length;
  els.exportAll.hidden = n < 2;
  if (n >= 2) els.exportAll.textContent = t('all.zip', n);
}
function selectDoc(i) {
  if (i < 0 || i >= state.docs.length) i = state.docs.length ? 0 : -1;
  state.current = i;
  const d = current();
  els.editor.value = d ? d.md : '';
  els.editor.disabled = !d;
  els.srcEnc.textContent = d ? (d.enc === 'pdf' || d.enc === 'Desde PDF' ? t('src.fromPdf') : d.enc) : '';
  renderTabs(); updateOutName(); persistDocs();
  return render();
}
function closeDoc(i) {
  state.docs.splice(i, 1);
  let next = state.current;
  if (i < next || next >= state.docs.length) next = Math.max(0, next - 1);
  selectDoc(state.docs.length ? next : -1);
}

function updateSrcStats() {
  const d = current();
  if (!d) { els.srcStats.textContent = ''; return; }
  const lines = d.md.split('\n').length;
  els.srcStats.textContent = t('src.stats', fmtNum(lines), fmtNum(d.md.length));
}

/* ---------- options UI ---------- */
function fillSelect(sel, map, val, prefix) {
  sel.replaceChildren(...Object.keys(map).map(k => { const o = document.createElement('option'); o.value = k; o.textContent = t(prefix + k); return o; }));
  sel.value = val;
}
function syncOptionsUI() {
  applyPageTexts();
  fillSelect($('#opt-page'), PAGE_SIZES, opts.page, 'page.');
  fillSelect($('#opt-margin'), MARGINS, opts.margin, 'margin.');
  $('#opt-theme').value = opts.theme;
  $('#opt-fm').value = opts.fm;
  $('#zoom').value = String(opts.zoom);
  const radios = { format: opts.format, orient: opts.orient, fs: String(opts.fs), pdfres: String(opts.pdfres), imgtype: opts.imgtype, imgres: String(opts.imgres), imgmode: opts.imgmode, mdimg: opts.mdimg, lang: lang() };
  for (const [name, v] of Object.entries(radios)) { const r = $('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }
  $('#opt-pdftext').checked = opts.pdftext; $('#opt-pdfnum').checked = opts.pdfnum; $('#opt-docxnum').checked = opts.docxnum;
  syncFormatUI();
}
function bindOptions() {
  syncOptionsUI();
  const relayout = () => { saveOpts(); applyDocStyle(); scheduleLayout(); updateMeta(); updateOutName(); };
  const rerender = () => { saveOpts(); render(); updateOutName(); };
  $('#opt-page').addEventListener('change', e => { opts.page = e.target.value; relayout(); });
  $('#opt-margin').addEventListener('change', e => { opts.margin = e.target.value; relayout(); });
  $('#opt-theme').addEventListener('change', e => { opts.theme = e.target.value; relayout(); });
  $('#opt-fm').addEventListener('change', e => { opts.fm = e.target.value; rerender(); });
  $('#zoom').addEventListener('change', e => { opts.zoom = e.target.value; saveOpts(); scheduleLayout(); });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.type === 'radio') {
      const num = ['fs', 'pdfres', 'imgres'].includes(t.name);
      opts[t.name] = num ? Number(t.value) : t.value;
      if (t.name === 'format') { saveOpts(); syncFormatUI(); updateOutName(); return; }
      if (t.name === 'lang') { saveOpts(); switchLang(); return; }
      if (t.name === 'orient' || t.name === 'fs') { relayout(); return; }
      saveOpts(); updateOutName();
    } else if (t.type === 'checkbox' && t.id.startsWith('opt-')) {
      opts[t.id.slice(4)] = t.checked; saveOpts();
    }
  });
}
function switchLang() {
  syncOptionsUI();
  // an untouched example follows the language
  for (const d of state.docs) if (d.sample && isSample(d.md)) { d.md = SAMPLES[lang()]; d.name = d.path = t('sample.name'); }
  if (state.docs.length) selectDoc(state.current); else { renderTabs(); updateMeta(); }
}
function saveOpts() { store.set('opts', opts); }
function syncFormatUI() {
  $('#opts-pdf').hidden = opts.format !== 'pdf';
  $('#opts-docx').hidden = opts.format !== 'docx';
  $('#opts-image').hidden = opts.format !== 'image';
  $('#opts-md').hidden = opts.format !== 'md';
  els.exportLabel.textContent = t('dl.' + opts.format);
}
function outExt() { return opts.format === 'docx' ? 'docx' : opts.format === 'pdf' ? 'pdf' : opts.format === 'md' ? 'md' : opts.imgtype; }
function updateOutName() {
  const d = current();
  if (!d) { els.outName.textContent = ''; return; }
  let n = safeFile(baseName(d.name)) + '.' + outExt();
  if (opts.format === 'image' && opts.imgmode === 'pages' && lastLayout.pages > 1) n = safeFile(baseName(d.name)) + '-' + t('zip.pages') + '.zip';
  if (opts.format === 'md' && opts.mdimg === 'zip' && mdImageRefs(d).length) n = safeFile(baseName(d.name)) + '-markdown.zip';
  els.outName.textContent = n;
}

/* ---------- paper layout, zoom and page breaks ---------- */
const lastLayout = { pages: 1, starts: [0] };
function applyDocStyle() {
  const g = geom();
  const p = els.paper;
  p.style.width = g.pageW + 'px';
  p.style.minHeight = g.pageH + 'px';
  p.style.padding = g.m + 'px';
  els.doc.className = 'md theme-' + opts.theme;
  els.doc.style.setProperty('--doc-fs', opts.fs + 'pt');
}
let zoomK = 1;
function layoutPaper() {
  const g = geom();
  let k = 1;
  if (opts.zoom === 'fit') {
    const avail = els.desk.clientWidth - (window.innerWidth <= 760 ? 24 : 48);
    k = Math.min(1, Math.max(0.2, avail / g.pageW));
  } else k = Number(opts.zoom) || 1;
  if (document.body.classList.contains('exporting')) k = 1;
  zoomK = k;
  els.paper.style.transform = k === 1 ? 'none' : 'scale(' + k + ')';
  els.frame.style.width = (g.pageW * k) + 'px';
  els.frame.style.height = (els.paper.offsetHeight * k) + 'px';
}
let layoutTimer = 0;
function scheduleLayout() {
  cancelAnimationFrame(layoutTimer);
  layoutTimer = requestAnimationFrame(() => { layoutPaper(); updateBreaks(); });
}
function measure(root) {
  const R = root.getBoundingClientRect();
  const k = (R.width / root.offsetWidth) || 1;
  return { k, y: v => (v - R.top) / k, x: v => (v - R.left) / k };
}

const ATOMIC = 'img, svg, .katex, hr, input, canvas, video, .mermaid-box, .img-missing, kbd, .math-display';
function collectZones(root) {
  const { y, k } = measure(root);
  const atoms = [];
  const range = document.createRange();
  (function walk(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim()) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.height > 0) atoms.push([y(r.top), y(r.bottom)]);
      } else if (n.nodeType === 1) {
        if (n.matches(ATOMIC)) { const r = n.getBoundingClientRect(); if (r.height > 0) atoms.push([y(r.top), y(r.bottom)]); }
        else if (!n.matches('.sr-only')) walk(n);
      }
    }
  })(root);
  // keep short table rows whole so pages break between rows
  for (const tr of $$('tr', root)) { const r = tr.getBoundingClientRect(); if (r.height > 0 && r.height / k < 360) atoms.push([y(r.top) + 0.6, y(r.bottom) - 0.6]); }
  atoms.sort((a, b) => a[0] - b[0]);
  const zones = [];
  for (const a of atoms) {
    const z = zones[zones.length - 1];
    if (z && a[0] < z[1] - 0.5) z[1] = Math.max(z[1], a[1]);
    else zones.push([a[0], a[1]]);
  }
  for (const h of $$('h1, h2, h3, h4, h5, h6, .markdown-alert-title, summary, dt', root)) {
    const r = h.getBoundingClientRect(); const top = y(r.top), bot = y(r.bottom);
    let i0 = -1, i1 = -1;
    zones.forEach((z, i) => { if (z[1] > top && z[0] < bot) { if (i0 < 0) i0 = i; i1 = i; } });
    if (i0 >= 0 && i1 + 1 < zones.length) { zones[i0][1] = zones[i1 + 1][1]; zones.splice(i0 + 1, i1 + 1 - i0); }
  }
  const forced = [];
  for (const el of $$('.pb, [style*="break-"]', root)) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (/page|always|left|right/.test(cs.breakBefore + ' ' + cs.pageBreakBefore)) forced.push(y(r.top));
    if (el.classList.contains('pb') || /page|always|left|right/.test(cs.breakAfter + ' ' + cs.pageBreakAfter)) forced.push(y(r.bottom));
  }
  forced.sort((a, b) => a - b);
  // tables whose header row should repeat on every page they continue onto
  const tables = $$('table', root).filter(t => t.tHead && t.tHead.rows.length).map(t => {
    const r = t.getBoundingClientRect(), h = t.tHead.getBoundingClientRect();
    return { top: y(r.top), bottom: y(r.bottom), ht: y(h.top), hb: y(h.bottom) };
  });
  return { zones, forced, tables };
}
function paginate(root, pageH) {
  const total = root.offsetHeight;
  const { zones, forced, tables } = collectZones(root);
  const pages = [];
  let top = 0, guard = 0;
  while (guard++ < 5000) {
    const tb = top > 0 ? tables.find(t => top > t.hb - 0.5 && top < t.bottom - 1 && t.hb - t.ht < pageH * 0.3) : null;
    const head = tb ? [tb.ht, tb.hb] : null;
    const limit = top + pageH - (head ? head[1] - head[0] : 0);
    let cut = null;
    const f = forced.find(v => v > top + 1 && v <= Math.min(limit, total - 1));
    if (f != null) cut = f;
    else if (limit < total - 0.5) {
      cut = limit;
      const z = zones.find(z => z[0] < cut - 0.01 && z[1] > cut + 0.01);
      if (z && z[0] > top + 24) cut = z[0];
    }
    pages.push([top, cut == null ? total : cut, head]);
    if (cut == null) break;
    top = cut;
  }
  return { pages, total };
}
function updateBreaks() {
  const d = current();
  els.breaks.replaceChildren();
  if (!d) return;
  const g = geom();
  const { pages } = paginate(els.doc, g.contentH);
  lastLayout.pages = pages.length;
  pages.forEach((p, i) => {
    if (i === 0) return;
    const line = document.createElement('div'); line.className = 'break-line';
    line.style.top = (g.m + p[0]) + 'px';
    const tag = document.createElement('span'); tag.className = 'break-tag'; tag.textContent = t('break.tag', i + 1);
    line.appendChild(tag); els.breaks.appendChild(line);
  });
  updateMeta(); updateOutName();
}
function updateMeta() {
  const g = geom(); const d = current();
  const ps = { label: t('page.' + opts.page) };
  const dims = fmtNum(g.wmm, 1) + ' × ' + fmtNum(g.hmm, 1) + ' mm · ' + t('meta.margins', fmtNum(g.mmm / 10, 2));
  if (!d) { els.meta.innerHTML = '<span><strong>' + esc(ps.label) + '</strong> · ' + dims + '</span>'; return; }
  let words = 0;
  const tw = document.createTreeWalker(els.doc, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('svg, style, .katex, .sr-only') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  while (tw.nextNode()) words += (tw.currentNode.nodeValue.match(/[\p{L}\p{N}]+/gu) || []).length;
  els.meta.innerHTML = '<span><strong>' + esc(ps.label) + '</strong> · ' + dims + '</span>' +
    '<span><strong>' + fmtNum(lastLayout.pages) + '</strong> ' + t('n.pages', lastLayout.pages) + '</span>' +
    '<span><strong>' + fmtNum(words) + '</strong> ' + t('n.words', words) + '</span>';
}

function renderNotices(w) {
  const out = [];
  const cd = current();
  if (cd && cd.pdfInfo) {
    const p = cd.pdfInfo;
    const found = [count(p.pages, 'n.pages')];
    if (p.tables) found.push(count(p.tables, 'n.tables'));
    if (p.images) found.push(count(p.images, 'n.images'));
    out.push('<div class="ui-notice">' + t('pdf.note', esc(p.file), found.length > 1 ? found.slice(0, -1).join(', ') + t('and') + found[found.length - 1] : found[0]) + '</div>');
    if (p.noText) out.push('<div class="ui-notice">' + t('pdf.noText') + '</div>');
    else if (p.scanned) out.push('<div class="ui-notice">' + t('pdf.scanned', p.scanned) + '</div>');
    if (p.columns) out.push('<div class="ui-notice">' + t('pdf.columns') + '</div>');
  }
  const uniq = a => Array.from(new Set(a));
  const list = a => uniq(a).slice(0, 6).map(s => '<code>' + esc(s) + '</code>').join(', ') + (uniq(a).length > 6 ? '…' : '');
  if (w.missing.length) out.push('<div class="ui-notice">' + t('warn.missing', uniq(w.missing).length, list(w.missing)) + '</div>');
  if (w.remoteBroken.length) out.push('<div class="ui-notice">' + t('warn.broken', list(w.remoteBroken)) + '</div>');
  if (w.remote.length) out.push('<div class="ui-notice">' + t('warn.remote', list(w.remote)) + '</div>');
  els.notices.innerHTML = out.join('');
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const d = current();
  applyDocStyle();
  els.empty.hidden = !!d;
  els.frame.hidden = !d;
  updateSrcStats();
  if (!d) { els.doc.replaceChildren(); els.notices.innerHTML = ''; updateMeta(); return; }
  const w = { missing: [], remote: [], remoteBroken: [] };
  let tmp;
  try {
    const { html, fm, store } = mdToHtml(d.md);
    tmp = document.createElement('div'); tmp.innerHTML = html;
    if (fm && opts.fm === 'table') tmp.prepend(fmTable(fm));
    d.lang = guessLang(tmp.textContent);
    await decorate(tmp, d, d.lang, w, store);
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return;
    toast(t('render.failed', e.message || e), true);
    return;
  }
  if (seq !== renderSeq) return;
  els.doc.replaceChildren(...tmp.childNodes);
  renderNotices(w);
  await nextFrame();
  if (seq !== renderSeq) return;
  const maxW = els.doc.clientWidth + 1;
  for (const t of $$('table', els.doc)) if (t.offsetWidth > maxW) t.classList.add('tbl-tight');
  layoutPaper(); updateBreaks();
}
let editTimer = 0;
els.editor.addEventListener('input', () => {
  const d = current(); if (!d) return;
  d.md = els.editor.value; updateSrcStats();
  clearTimeout(editTimer); editTimer = setTimeout(() => { render(); persistDocs(); }, 350);
});

new ResizeObserver(() => scheduleLayout()).observe(els.desk);
new ResizeObserver(() => scheduleLayout()).observe(els.doc);
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => scheduleLayout());

els.doc.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  e.preventDefault();
  let id = a.getAttribute('href').slice(1); try { id = decodeURIComponent(id); } catch (err) { /* raw */ }
  const t = document.getElementById(id); if (t && els.doc.contains(t)) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- loading files ---------- */
/*@@PDF2MD@@*/
const MD_RE = /\.(md|markdown|mdown|mkdn?|txt)$/i;
const IMG_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'UTF-8' }; }
  catch (e) { return { text: new TextDecoder('windows-1252').decode(buf), enc: 'Windows-1252' }; }
}
async function ingest(entries) {
  // entries: [{file, path}]
  let mdCount = 0, imgCount = 0, firstNew = -1;
  const mds = entries.filter(e => MD_RE.test(e.file.name)).sort((a, b) => a.path.localeCompare(b.path, 'es'));
  const imgs = entries.filter(e => IMG_RE.test(e.file.name) || /^image\//.test(e.file.type));
  for (const e of imgs) { try { addAsset(e.path, await blobToDataURL(e.file)); imgCount++; } catch (err) { /* skip unreadable */ } }
  // a pristine example is replaced by the user's first file
  const pdfs = entries.filter(e => PDF_RE.test(e.file.name)).sort((a, b) => a.path.localeCompare(b.path, 'es'));
  const onlySample = state.docs.length === 1 && state.docs[0].sample && isSample(state.docs[0].md);
  if ((mds.length || pdfs.length) && onlySample) state.docs = [];
  for (const e of mds) {
    const { text, enc } = await readText(e.file);
    const existing = state.docs.findIndex(d => d.path === e.path);
    if (existing >= 0) { state.docs[existing].md = text; state.docs[existing].enc = enc; if (firstNew < 0) firstNew = existing; }
    else { addDoc(e.file.name, text, e.path, enc); if (firstNew < 0) firstNew = state.docs.length - 1; }
    mdCount++;
  }
  let pdfCount = 0; const pdfErrors = [];
  if (pdfs.length) {
    busy(true, t('pdf.reading', pdfs.length));
    for (let k = 0; k < pdfs.length; k++) {
      const e = pdfs[k];
      try {
        const base = baseName(e.file.name.replace(PDF_RE, ''));
        const r = await pdfToMarkdown(e.file, base, (n, total) => progress(t('pdf.page', e.file.name, n, total), (k + n / total) / pdfs.length));
        const path = e.path.replace(PDF_RE, '.md');
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        for (const im of r.images) addAsset(dir + im.path, im.url);
        const info = { file: e.file.name, pages: r.pages, tables: r.tables, images: r.images.length, noText: r.chars < 20 * r.pages, scanned: r.scanned, columns: r.columns };
        const existing = state.docs.findIndex(d => d.path === path);
        let d;
        if (existing >= 0) { d = state.docs[existing]; d.md = r.md; if (firstNew < 0) firstNew = existing; }
        else { d = addDoc(base + '.md', r.md, path, 'pdf'); if (firstNew < 0) firstNew = state.docs.length - 1; }
        d.enc = 'pdf'; d.pdfInfo = info;
        pdfCount++;
      } catch (err) { console.error(err); pdfErrors.push(e.file.name + ': ' + ((err && err.message) || err)); }
    }
    busy(false);
    if (pdfCount && opts.format === 'pdf') { opts.format = 'md'; saveOpts(); syncOptionsUI(); }
  }
  if (pdfErrors.length && !pdfCount && !mdCount) { toast(t('in.failed', pdfErrors.join('; ')), true); return; }
  if (!mdCount && !imgCount && !pdfCount) { toast(t('in.none'), true); return; }
  const parts = [];
  if (pdfCount) parts.push(count(pdfCount, 'n.pdfs'));
  if (mdCount) parts.push(count(mdCount, 'n.docs'));
  if (imgCount) parts.push(count(imgCount, 'n.images'));
  toast(t('in.loaded', parts.join(t('and'))) + (pdfErrors.length ? ' ' + t('in.failed', pdfErrors.join('; ')) : ''), pdfErrors.length > 0);
  if (firstNew >= 0) await selectDoc(firstNew); else await render();
}
function filesFromInput(list) { return Array.from(list).map(f => ({ file: f, path: f.webkitRelativePath || f.name })); }
$('#btn-open').addEventListener('click', () => $('#file-input').click());
$('#btn-folder').addEventListener('click', () => $('#folder-input').click());
$('#file-input').addEventListener('change', e => { ingest(filesFromInput(e.target.files)); e.target.value = ''; });
$('#folder-input').addEventListener('change', e => { ingest(filesFromInput(e.target.files)); e.target.value = ''; });
$('#btn-new').addEventListener('click', () => {
  const n = state.docs.filter(d => /^(sin-titulo|untitled)/.test(d.name)).length + 1;
  addDoc(t('new.name') + '-' + n + '.md', t('new.body'));
  selectDoc(state.docs.length - 1).then(() => els.editor.focus());
});
$('#btn-sample').addEventListener('click', () => { const d = addDoc(t('sample.name'), SAMPLES[lang()]); d.sample = true; selectDoc(state.docs.length - 1); });

async function walkEntry(entry, out, prefix) {
  if (out.length > 800) return;
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, path: prefix + file.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const ch of batch) {
        if (/^(\.|node_modules$)/.test(ch.name)) continue;
        if (ch.isFile && !(MD_RE.test(ch.name) || IMG_RE.test(ch.name) || PDF_RE.test(ch.name))) continue;
        await walkEntry(ch, out, prefix + entry.name + '/');
      }
    } while (batch.length);
  }
}
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth++; els.drop.hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.drop.hidden = true; });
window.addEventListener('dragover', e => { e.preventDefault(); });
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; els.drop.hidden = true;
  const dt = e.dataTransfer; if (!dt) return;
  const out = [];
  const items = Array.from(dt.items || []).filter(i => i.kind === 'file');
  const entries = items.map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (entries.length && entries.every(Boolean)) {
    try { for (const en of entries) await walkEntry(en, out, ''); }
    catch (err) { out.length = 0; out.push(...filesFromInput(dt.files)); }
  } else out.push(...filesFromInput(dt.files));
  ingest(out);
});
document.addEventListener('paste', e => {
  if (document.activeElement === els.editor) return;
  const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
  if (files.length) { e.preventDefault(); ingest(filesFromInput(files)); return; }
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (text && text.trim()) { e.preventDefault(); addDoc(t('paste.name') + '-' + (state.docs.length + 1) + '.md', text); selectDoc(state.docs.length - 1); }
});

/* =====================================================================
   Rasterizing the document (shared by PDF and image)
   ===================================================================== */
async function rasterize(root, scale) {
  await loadLib('shot');
  const w = root.offsetWidth, h = root.offsetHeight;
  const fontCss = katexFontCss();
  const svg = await window.modernScreenshot.domToForeignObjectSvg(root, {
    width: w, height: h, backgroundColor: '#ffffff',
    font: fontCss ? { cssText: fontCss } : false,
    timeout: 30000,
    fetch: { requestInit: { cache: 'force-cache' } }
  });
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('width', String(Math.round(w * scale)));
  svg.setAttribute('height', String(Math.round(h * scale)));
  const str = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.decoding = 'sync';
  // a data: URL (not blob:) keeps the canvas exportable in Chromium-based browsers
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  try { await img.decode(); } catch (e) { await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('No se pudo dibujar el documento.')); if (img.complete) res(); }); }
  return { img, w, h, scale, done() { img.src = ''; } };
}
function sliceCanvas(r, top, bottom, padX, padY, outW, outH, head) {
  const s = r.scale;
  const c = document.createElement('canvas');
  c.width = Math.round(outW * s); c.height = Math.round(outH * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  const sw = Math.round(r.w * s);
  let dy = Math.round(padY * s);
  if (head) {
    const hy = Math.round(head[0] * s), hh = Math.max(1, Math.round((head[1] - head[0]) * s));
    ctx.drawImage(r.img, 0, hy, sw, hh, Math.round(padX * s), dy, sw, hh);
    dy += hh;
  }
  const sy = Math.round(top * s), sh = Math.max(1, Math.round((bottom - top) * s));
  ctx.drawImage(r.img, 0, sy, sw, sh, Math.round(padX * s), dy, sw, sh);
  return c;
}
const headH = p => (p[2] ? p[2][1] - p[2][0] : 0);

/* ---------- text layer & links for the PDF ---------- */
const WIN_EXTRA = new Set(Array.from('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'));
const WIN_MAP = { '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '⇒': '=>', '≠': '!=', '−': '-', '×': 'x', '✓': 'v', '✔': 'v', '☐': '[ ]', '☑': '[x]', ' ': ' ', ' ': ' ', ' ': ' ', '​': '' };
function winAnsi(s) {
  let o = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 161 && c <= 255) || WIN_EXTRA.has(ch)) o += ch;
    else if (WIN_MAP[ch] != null) o += WIN_MAP[ch];
    else if (c === 9 || c === 160) o += ' ';
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      o += /^[\x20-\x7e]$/.test(base) ? base : ' ';
    }
  }
  return o;
}
function collectTextLines(root) {
  const { x, y, k } = measure(root);
  const range = document.createRange();
  const lines = [];
  const cache = new Map();
  const info = el => {
    let v = cache.get(el);
    if (!v) {
      const cs = getComputedStyle(el);
      const mono = !!el.closest('pre, code, kbd, samp');
      v = { fs: parseFloat(cs.fontSize) || 14, sty: (mono ? 'm' : '') + ((parseInt(cs.fontWeight, 10) || 400) >= 600 ? 'b' : '') + (cs.fontStyle === 'italic' ? 'i' : '') };
      cache.set(el, v);
    }
    return v;
  };
  let cur = null;
  // one entry per run of same-styled text on a line; cells of a table row stay separate
  const add = (text, r, fs, sty) => {
    const top = y(r.top), bot = y(r.bottom), left = x(r.left), right = x(r.right);
    if (cur && cur.sty === sty && Math.abs(fs - cur.fs) < 0.5 && Math.abs(top - cur.top) < Math.max(2, (bot - top) * 0.35) && left >= cur.right - 2 && left - cur.right <= fs * 1.5) {
      if (left - cur.right > fs * 0.12) cur.text += ' ';
      cur.text += text; cur.right = Math.max(cur.right, right); cur.bot = Math.max(cur.bot, bot); cur.fs = Math.max(cur.fs, fs);
    } else { cur = { text, top, bot, left, right, fs, sty }; lines.push(cur); }
  };
  // list numbers and bullets are drawn by the browser, not text: write them into the text layer too
  const marker = li => {
    if (li.classList.contains('task-list-item')) return;
    const tw = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode()) && !n.nodeValue.trim());
    if (!n || n.parentElement.closest('li') !== li) return;
    range.setStart(n, n.nodeValue.search(/\S/)); range.setEnd(n, n.nodeValue.search(/\S/) + 1);
    const R = range.getClientRects()[0]; if (!R) return;
    const list = li.parentElement, fs = info(li).fs;
    const text = list.tagName === 'OL' ? ((parseInt(list.getAttribute('start'), 10) || 1) + Array.prototype.indexOf.call(list.children, li)) + '.' : '•';
    add(text, { top: R.top, bottom: R.bottom, left: R.left - 1.5 * fs * k, right: R.left - 0.45 * fs * k }, fs, '');
  };
  (function walk(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) {
        if (n.matches('.katex, svg, .mermaid-box, .sr-only, script, style')) continue;
        if (n.tagName === 'LI') marker(n);
        if (n.tagName === 'INPUT' && n.type === 'checkbox') { const R = n.getBoundingClientRect(); if (R.width > 0) add(n.checked ? '[x]' : '[ ]', R, info(n.parentElement).fs, ''); continue; }
        walk(n); continue;
      }
      if (n.nodeType !== 3) continue;
      const s = n.nodeValue; if (!s.trim()) continue;
      const pre = !!n.parentElement.closest('pre');
      const { fs, sty } = info(n.parentElement);
      const re = pre ? /[^\n]+/g : /\S+/g;
      let m;
      while ((m = re.exec(s))) {
        range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
        const rects = range.getClientRects();
        if (!rects.length) continue;
        if (rects.length === 1 || !pre) { if (rects[0].width > 0) add(m[0], rects[0], fs, sty); continue; }
        const wre = /\S+\s*/g; let wm;
        while ((wm = wre.exec(m[0]))) {
          range.setStart(n, m.index + wm.index); range.setEnd(n, m.index + wm.index + wm[0].length);
          const rr = range.getClientRects(); if (rr.length && rr[0].width > 0) add(wm[0], rr[0], fs, sty);
        }
      }
    }
  })(root);
  return lines;
}
function collectLinks(root) {
  const { x, y } = measure(root);
  const out = [];
  for (const a of $$('a[href]', root)) {
    const href = a.getAttribute('href') || '';
    for (const r of a.getClientRects()) if (r.width > 0) out.push({ href, top: y(r.top), bot: y(r.bottom), left: x(r.left), right: x(r.right) });
  }
  return out;
}
function pageOf(pages, yv) { for (let i = 0; i < pages.length; i++) if (yv < pages[i][1] - 0.5 || i === pages.length - 1) return i; return 0; }

/* =====================================================================
   PDF
   ===================================================================== */
async function buildPDF(root, title) {
  progress(t('p.pdfEngine'), 0.05);
  await loadLib('jspdf');
  const g = geom();
  const { pages } = paginate(root, g.contentH);
  const scale = opts.pdfres;
  progress(t('p.drawing'), 0.12);
  const r = await rasterize(root, scale);
  const lines = opts.pdftext ? collectTextLines(root) : [];
  const links = collectLinks(root);
  const PT = 0.75;
  const pw = g.pageW * PT, ph = g.pageH * PT, mx = g.m * PT;
  const orientation = pw > ph ? 'landscape' : 'portrait';
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: [pw, ph], orientation, compress: true });
  pdf.setProperties({ title: title, creator: 'Imprenta MD', subject: 'Convertido desde Markdown' });
  pdf.setFont('helvetica', 'normal');
  try {
    for (let i = 0; i < pages.length; i++) {
      const [top, bottom] = pages[i];
      const hh = headH(pages[i]);
      progress(t('p.page', i + 1, pages.length), 0.15 + 0.8 * (i / pages.length));
      if (i) pdf.addPage([pw, ph], orientation);
      const c = sliceCanvas(r, top, bottom, 0, 0, r.w, bottom - top + hh, pages[i][2]);
      const data = c.toDataURL('image/jpeg', 0.92);
      pdf.addImage(data, 'JPEG', mx, mx, r.w * PT, (bottom - top + hh) * PT, undefined, 'FAST');
      c.width = c.height = 0;
      const head = pages[i][2];
      for (const L of lines) {
        const inHead = head && L.top >= head[0] - 0.5 && L.top < head[1] - 0.5; // table header repeated on this page
        if (!inHead && (L.top < top - 0.5 || L.top >= bottom - 0.5)) continue;
        const t = winAnsi(L.text).replace(/\s+$/, '');
        if (!t.trim()) continue;
        const size = Math.max(1, L.fs * PT);
        const bi = (L.sty.includes('b') ? 'bold' : '') + (L.sty.includes('i') ? 'italic' : '');
        pdf.setFont(L.sty.includes('m') ? 'courier' : 'helvetica', bi || 'normal');
        pdf.setFontSize(size);
        const nat = pdf.getTextWidth(t);
        const wpt = (L.right - L.left) * PT;
        const hs = nat > 0 ? Math.min(4, Math.max(0.2, wpt / nat)) : 1;
        const base = L.bot - (L.bot - L.top) * 0.22;
        pdf.text(t, mx + L.left * PT, mx + (inHead ? base - head[0] : base - top + hh) * PT, { renderingMode: 'invisible', horizontalScale: hs, baseline: 'alphabetic' });
      }
      for (const lk of links) {
        if (lk.top < top - 0.5 || lk.top >= bottom - 0.5) continue;
        const lx = mx + lk.left * PT, ly = mx + (lk.top - top + hh) * PT, lw = (lk.right - lk.left) * PT, lh = (lk.bot - lk.top) * PT;
        if (lk.href.startsWith('#')) {
          let id = lk.href.slice(1); try { id = decodeURIComponent(id); } catch (e) { /* raw */ }
          const t = id && root.querySelector('[id="' + CSS.escape(id) + '"]');
          if (t) { const { y } = measure(root); pdf.link(lx, ly, lw, lh, { pageNumber: pageOf(pages, y(t.getBoundingClientRect().top)) + 1 }); }
        } else if (/^(https?:|mailto:)/i.test(lk.href)) pdf.link(lx, ly, lw, lh, { url: lk.href });
      }
      if (opts.pdfnum && pages.length > 1) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(120, 128, 136);
        pdf.text((i + 1) + ' / ' + pages.length, pw / 2, ph - Math.max(14, mx * 0.45), { align: 'center', renderingMode: 'fill', baseline: 'alphabetic' });
        pdf.setTextColor(0, 0, 0);
      }
    }
    // outline (bookmarks panel)
    const { y } = measure(root);
    const stack = [];
    for (const h of $$('h1, h2, h3, h4, h5, h6', root)) {
      if (h.closest('.sr-only')) continue;
      const lvl = Number(h.tagName[1]);
      const text = winAnsi(h.textContent.trim()).trim();
      if (!text) continue;
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].node : null;
      const node = pdf.outline.add(parent, text, { pageNumber: pageOf(pages, y(h.getBoundingClientRect().top)) + 1 });
      stack.push({ lvl, node });
    }
  } finally { r.done(); }
  progress(t('p.saving'), 0.98);
  return pdf.output('blob');
}

/* =====================================================================
   Image
   ===================================================================== */
async function buildImages(root, base) {
  const g = geom();
  const type = opts.imgtype === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext = opts.imgtype === 'jpg' ? 'jpg' : 'png';
  let scale = opts.imgres;
  const pad = g.m;
  const out = [];
  if (opts.imgmode === 'pages') {
    const { pages } = paginate(root, g.contentH);
    progress(t('p.drawing'), 0.1);
    const r = await rasterize(root, scale);
    try {
      for (let i = 0; i < pages.length; i++) {
        progress(t('p.page', i + 1, pages.length), 0.15 + 0.8 * (i / pages.length));
        const [top, bottom] = pages[i];
        const c = sliceCanvas(r, top, bottom, pad, pad, g.pageW, g.pageH, pages[i][2]);
        const name = pages.length > 1 ? base + '-' + String(i + 1).padStart(2, '0') + '.' + ext : base + '.' + ext;
        out.push({ name, blob: await canvasToBlob(c, type, 0.93) });
        c.width = c.height = 0;
      }
    } finally { r.done(); }
    return out;
  }
  const total = root.offsetHeight;
  const W = g.contentW + 2 * pad, H = total + 2 * pad;
  const MAXD = 32000, MAXA = 2.4e8;
  const fit = Math.min(scale, MAXD / H, Math.sqrt(MAXA / (W * H)));
  if (fit >= 1) {
    if (fit < scale - 0.01) { scale = Math.floor(fit * 100) / 100; toast(t('img.scaled', fmtNum(scale, 2))); }
    progress(t('p.drawing'), 0.2);
    const r = await rasterize(root, scale);
    try {
      progress(t('p.composing'), 0.7);
      const c = sliceCanvas(r, 0, total, pad, pad, W, H);
      out.push({ name: base + '.' + ext, blob: await canvasToBlob(c, type, 0.93) });
      c.width = c.height = 0;
    } finally { r.done(); }
    return out;
  }
  // too tall for one canvas: split into parts at safe line boundaries
  const partH = Math.floor(MAXD / scale) - 2 * pad;
  const { pages } = paginate(root, partH);
  const r = await rasterize(root, scale);
  try {
    for (let i = 0; i < pages.length; i++) {
      progress(t('p.part', i + 1, pages.length), 0.15 + 0.8 * (i / pages.length));
      const [top, bottom] = pages[i];
      const c = sliceCanvas(r, top, bottom, pad, pad, W, bottom - top + headH(pages[i]) + 2 * pad, pages[i][2]);
      out.push({ name: base + '-' + t('zip.parts') + '-' + String(i + 1).padStart(2, '0') + '.' + ext, blob: await canvasToBlob(c, type, 0.93) });
      c.width = c.height = 0;
    }
  } finally { r.done(); }
  toast(t('img.split', pages.length));
  return out;
}

/* =====================================================================
   Word (.docx) — built natively from the rendered page
   ===================================================================== */
const TW = px => Math.round(px * 15);
const HP = px => Math.max(2, Math.round(px * 1.5));
const EIGHTHS = px => Math.max(2, Math.min(96, Math.round(px * 6)));
function parseColor(str, bg) {
  if (!str) return null;
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(str);
  if (!m) return null;
  let a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
  if (a <= 0.02) return null;
  const base = bg || [255, 255, 255];
  const ch = [1, 2, 3].map((i, j) => Math.round(Number(m[i]) * a + base[j] * (1 - a)));
  return ch.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const MONO_RE = /mono|consolas|courier|menlo|monaco/i;
const LIST_FORMATS = { 'decimal': 'DECIMAL', 'decimal-leading-zero': 'DECIMAL_ZERO', 'lower-alpha': 'LOWER_LETTER', 'lower-latin': 'LOWER_LETTER', 'upper-alpha': 'UPPER_LETTER', 'upper-latin': 'UPPER_LETTER', 'lower-roman': 'LOWER_ROMAN', 'upper-roman': 'UPPER_ROMAN' };
const BULLETS = { disc: '•', circle: '◦', square: '▪' };

class DocxBuilder {
  constructor(root, title) {
    this.root = root; this.title = title; this.D = window.docx; this.DM = window.docxMath || null;
    const cs = getComputedStyle(root);
    const f = v => (cs.getPropertyValue(v) || '').replace(/["']/g, '').trim();
    this.fonts = { body: f('--docx-body') || 'Calibri', heading: f('--docx-heading') || f('--docx-body') || 'Calibri', mono: f('--docx-mono') || 'Consolas' };
    this.baseFs = parseFloat(cs.fontSize) || 14.67;
    this.textColor = parseColor(cs.color) || '000000';
    const m = measure(root); this.m = m;
    const R = root.getBoundingClientRect();
    this.origin = { left: m.x(R.left), right: m.x(R.right) };
    this.numbering = new Map(); this.olSeq = 0;
    this.bookmarks = new Map(); this.bmSeq = 0;
    this.lastMB = 0; this.lastAfter = 0; this.pendingMT = 0; this.pageBreak = false; this.lastWasTable = false;
    this.runCache = new WeakMap();
  }
  bm(id) {
    if (!this.bookmarks.has(id)) this.bookmarks.set(id, ('_' + String(id).replace(/[^A-Za-z0-9_]/g, '_')).slice(0, 30) + '_' + (++this.bmSeq));
    return this.bookmarks.get(id);
  }
  box(el) { const r = el.getBoundingClientRect(); return { left: this.m.x(r.left), right: this.m.x(r.right), top: this.m.y(r.top), bottom: this.m.y(r.bottom), width: r.width / this.m.k, height: r.height / this.m.k }; }
  contentBox(el, cs) {
    const b = this.box(el); cs = cs || getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
    return { left: b.left + pl, right: b.right - pr };
  }
  isBlockish(el, cs) {
    if (el.matches('.math-display')) return true;
    const d = cs.display;
    return !(d === 'inline' || d === 'inline-block' || d === 'inline-flex' || d === 'contents' || d === 'none');
  }

  /* ----- run formatting from computed styles ----- */
  runProps(el, ctx) {
    const key = ctx && ctx.heading ? 'h' : 'b';
    let cache = this.runCache.get(el);
    if (cache && cache[key]) return cache[key];
    const D = this.D;
    const cs = getComputedStyle(el);
    const p = {};
    if ((parseInt(cs.fontWeight, 10) || 400) >= 600) p.bold = true;
    if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') p.italics = true;
    const col = parseColor(cs.color); if (col) p.color = col;
    let fs = parseFloat(cs.fontSize) || this.baseFs;
    const fam = cs.fontFamily || '';
    p.font = MONO_RE.test(fam.split(',')[0]) || /^(code|kbd|samp|tt)$/i.test(el.tagName) || el.closest('pre, code, kbd, samp') ? this.fonts.mono : (ctx && ctx.heading ? this.fonts.heading : this.fonts.body);
    let underline = false, strike = false, va = null, shade = null;
    for (let a = el; a && a !== this.root; a = a.parentElement) {
      const acs = a === el ? cs : getComputedStyle(a);
      const deco = acs.textDecorationLine || acs.textDecoration || '';
      if (/underline/.test(deco)) underline = true;
      if (/line-through/.test(deco)) strike = true;
      if (!va && (acs.verticalAlign === 'super' || acs.verticalAlign === 'sub')) { va = acs.verticalAlign; const parent = a.parentElement; if (parent) fs = parseFloat(getComputedStyle(parent).fontSize) || fs; }
      if (!shade) { const bg = parseColor(acs.backgroundColor); if (bg && bg !== 'FFFFFF') shade = bg; }
      if (!/^inline/.test(acs.display)) break;
    }
    if (shade && el.closest('pre')) shade = null;
    p.size = HP(fs);
    if (underline) p.underline = { type: D.UnderlineType.SINGLE, color: col || undefined };
    if (strike) p.strike = true;
    if (va === 'super') p.superScript = true; else if (va === 'sub') p.subScript = true;
    if (shade) p.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: shade };
    if (cs.fontVariantCaps === 'small-caps') p.smallCaps = true;
    if (cs.textTransform === 'uppercase') p.allCaps = true;
    if (!cache) { cache = {}; this.runCache.set(el, cache); }
    cache[key] = p;
    return p;
  }

  /* ----- inline content → segments ----- */
  async inlines(nodes, ctx) {
    const segs = [];
    for (const n of nodes) await this.inlineNode(n, ctx, segs);
    return segs;
  }
  async inlineNode(n, ctx, segs) {
    if (n.nodeType === 3) {
      let t = n.nodeValue;
      if (!ctx.pre) t = t.replace(/[ \t\n\r\f]+/g, ' ');
      if (!t) return;
      segs.push({ k: 't', text: t, props: this.runProps(n.parentElement, ctx), link: ctx.link || null });
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.classList.contains('sr-only')) return;
    const tag = el.tagName;
    if (el.id && el !== ctx.block) segs.push({ k: 'bm', name: this.bm(el.id) });
    if (tag === 'BR') { segs.push({ k: 'br' }); return; }
    if (tag === 'IMG' || tag === 'svg' || tag === 'SVG' || el instanceof SVGElement) { const run = await this.imageRun(el); if (run) segs.push({ k: 'obj', obj: run, link: ctx.link || null }); return; }
    if (tag === 'INPUT') {
      if (el.type === 'checkbox') segs.push({ k: 't', text: el.checked ? '☑ ' : '☐ ', props: Object.assign({}, this.runProps(el.parentElement, ctx), { font: 'Segoe UI Symbol' }) });
      return;
    }
    if (el.classList.contains('math-inline') || (el.classList.contains('math-display') && ctx.inlineMath)) { const m = await this.mathObj(el); if (m) segs.push(m); return; }
    if (el.classList.contains('img-missing')) { segs.push({ k: 't', text: el.textContent, props: this.runProps(el, ctx) }); return; }
    if (tag === 'A' && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      let link = null;
      if (href.startsWith('#')) { let id = href.slice(1); try { id = decodeURIComponent(id); } catch (e) { /* raw */ } if (id && this.root.querySelector('[id="' + CSS.escape(id) + '"]')) link = { type: 'int', anchor: this.bm(id) }; }
      else if (/^(https?:|mailto:|ftp:)/i.test(href)) link = { type: 'ext', href: el.href || href };
      const inner = Object.assign({}, ctx, { link: link || ctx.link });
      for (const ch of el.childNodes) await this.inlineNode(ch, inner, segs);
      return;
    }
    for (const ch of el.childNodes) await this.inlineNode(ch, ctx, segs);
  }
  toChildren(segs, pre) {
    const D = this.D;
    // whitespace like a browser: collapse across elements, trim line ends
    if (!pre) {
      let prevSpace = true;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.k === 'br') { prevSpace = true; for (let j = i - 1; j >= 0 && segs[j].k === 't'; j--) { segs[j].text = segs[j].text.replace(/ +$/, ''); if (segs[j].text) break; } continue; }
        if (s.k !== 't') { if (s.k === 'obj' || s.k === 'math') prevSpace = false; continue; }
        if (prevSpace) s.text = s.text.replace(/^ +/, '');
        if (s.text) prevSpace = s.text.endsWith(' ');
      }
      for (let j = segs.length - 1; j >= 0; j--) { const s = segs[j]; if (s.k === 'bm') continue; if (s.k !== 't') break; s.text = s.text.replace(/ +$/, ''); if (s.text) break; }
    }
    const out = [];
    const mk = s => {
      if (s.k === 't') return s.text ? new D.TextRun(Object.assign({ text: s.text }, s.props)) : null;
      if (s.k === 'br') return new D.TextRun({ break: 1 });
      if (s.k === 'tab') return new D.TextRun({ children: [new D.Tab()] });
      if (s.k === 'obj' || s.k === 'math') return s.obj;
      if (s.k === 'bm') return new D.Bookmark({ id: s.name, children: [] });
      return null;
    };
    for (let i = 0; i < segs.length;) {
      const s = segs[i];
      if (s.link && (s.k === 't' || s.k === 'obj')) {
        const kids = []; let j = i;
        while (j < segs.length && segs[j].link === s.link && (segs[j].k === 't' || segs[j].k === 'obj')) { const r = mk(segs[j]); if (r) kids.push(r); j++; }
        if (kids.length) out.push(s.link.type === 'ext' ? new D.ExternalHyperlink({ link: s.link.href, children: kids }) : new D.InternalHyperlink({ anchor: s.link.anchor, children: kids }));
        i = j; continue;
      }
      const r = mk(s); if (r) out.push(r); i++;
    }
    return out;
  }
  hasContent(segs) { return segs.some(s => (s.k === 't' && s.text.trim()) || s.k === 'obj' || s.k === 'math'); }

  /* ----- spacing bookkeeping (CSS margin collapsing → Word before/after) ----- */
  enter(el, cs) { this.pendingMT = Math.max(this.pendingMT, parseFloat(cs.marginTop) || 0); }
  leave(el, cs) { this.lastMB = Math.max(this.lastMB, parseFloat(cs.marginBottom) || 0); }
  spacingFor(cs) {
    const mt = parseFloat(cs.marginTop) || 0, mb = parseFloat(cs.marginBottom) || 0;
    const gap = Math.max(this.lastMB, this.pendingMT, mt);
    const before = Math.max(0, gap - this.lastAfter);
    this.lastMB = mb; this.lastAfter = mb; this.pendingMT = 0;
    return { before: TW(before), after: TW(mb) };
  }
  lineFor(cs) {
    const fs = parseFloat(cs.fontSize) || this.baseFs;
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight) || fs * 1.2;
    return { line: Math.max(240, Math.round(240 * (lh / fs) / 1.17)), lineRule: this.D.LineRuleType.AUTO };
  }
  align(cs) {
    const A = this.D.AlignmentType;
    const t = cs.textAlign;
    if (t === 'center' || t === '-webkit-center') return A.CENTER;
    if (t === 'right' || t === 'end' || t === '-webkit-right') return A.RIGHT;
    if (t === 'justify') return A.JUSTIFIED;
    return undefined;
  }
  indentFor(el, cs) {
    const cb = this.contentBox(el, cs);
    return { left: Math.max(0, TW(cb.left - this.origin.left)), right: Math.max(0, TW(this.origin.right - cb.right)) };
  }

  para(segs, el, env, extra) {
    const D = this.D;
    const cs = getComputedStyle(el);
    const o = Object.assign({ children: this.toChildren(segs, extra && extra.pre) }, extra && extra.opts);
    if (!(extra && extra.noSpacing)) o.spacing = Object.assign(this.spacingFor(cs), this.lineFor(cs));
    const al = this.align(cs) || env.align; if (al) o.alignment = al;
    const ind = (extra && extra.indent) || this.indentFor(el, cs);
    o.indent = Object.assign({}, ind, o.indent || {});
    if (env.quote) {
      o.border = Object.assign({}, o.border, { left: { style: D.BorderStyle.SINGLE, size: env.quote.size, color: env.quote.color, space: env.quote.space } });
      if (env.quote.fill) o.shading = { type: D.ShadingType.CLEAR, color: 'auto', fill: env.quote.fill };
    }
    if (this.pageBreak) { o.pageBreakBefore = true; this.pageBreak = false; }
    if (extra && extra.heading) {
      o.heading = D.HeadingLevel['HEADING_' + extra.heading];
      o.keepNext = true; o.keepLines = true;
      const bw = parseFloat(cs.borderBottomWidth) || 0;
      if (bw > 0 && cs.borderBottomStyle !== 'none') {
        o.border = Object.assign({}, o.border, { bottom: { style: D.BorderStyle.SINGLE, size: EIGHTHS(bw), color: parseColor(cs.borderBottomColor) || 'D0D7DE', space: Math.min(31, Math.round((parseFloat(cs.paddingBottom) || 0) * 0.75)) } });
      }
    }
    if (el.id && !(extra && extra.noBookmark)) o.children = [new D.Bookmark({ id: this.bm(el.id), children: o.children })];
    this.lastWasTable = false;
    return new D.Paragraph(o);
  }
  spacer(gapPx, pageBreak) {
    const D = this.D;
    const o = { children: [], spacing: { before: TW(Math.max(0, gapPx)), after: 0, line: 20, lineRule: D.LineRuleType.EXACT }, run: { size: 2 } };
    if (pageBreak) o.pageBreakBefore = true;
    return new D.Paragraph(o);
  }

  /* ----- blocks ----- */
  async blocks(nodes, env) {
    const out = [];
    let buf = [];
    const flush = async () => {
      if (!buf.length) return;
      const nodesNow = buf; buf = [];
      const parent = nodesNow[0].parentElement || this.root;
      const segs = await this.inlines(nodesNow, { block: parent });
      if (this.hasContent(segs)) out.push(this.para(segs, parent, env, { noBookmark: true }));
    };
    for (const n of nodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim() || buf.length) buf.push(n); continue; }
      if (n.nodeType !== 1) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || n.classList.contains('sr-only')) continue;
      if (!this.isBlockish(n, cs)) { buf.push(n); continue; }
      await flush();
      const r = await this.block(n, cs, env);
      if (r) out.push(...r);
    }
    await flush();
    return out;
  }
  async block(el, cs, env) {
    const D = this.D;
    const tag = el.tagName;
    if (el.classList.contains('pb') || /page|always/.test(cs.breakBefore + cs.pageBreakBefore)) { this.pageBreak = true; if (el.classList.contains('pb')) return []; }
    let res;
    if (/^H[1-6]$/.test(tag)) {
      const segs = await this.inlines(Array.from(el.childNodes), { block: el, heading: true });
      res = [this.para(segs, el, env, { heading: Number(tag[1]) })];
    } else if (tag === 'P' || tag === 'SUMMARY' || tag === 'DT' || tag === 'FIGCAPTION' || tag === 'CAPTION') {
      if (Array.from(el.children).some(c => this.isBlockish(c, getComputedStyle(c)))) res = await this.container(el, cs, env);
      else {
        const segs = await this.inlines(Array.from(el.childNodes), { block: el });
        res = this.hasContent(segs) ? [this.para(segs, el, env)] : [];
      }
    } else if (tag === 'UL' || tag === 'OL') res = await this.list(el, cs, env);
    else if (tag === 'PRE') res = await this.code(el, cs, env);
    else if (tag === 'TABLE') res = await this.table(el, cs, env);
    else if (tag === 'HR') res = [this.hr(el, cs, env)];
    else if (tag === 'BLOCKQUOTE') {
      const bw = parseFloat(cs.borderLeftWidth) || 0;
      const q = bw > 0 && cs.borderLeftStyle !== 'none' ? { size: EIGHTHS(bw), color: parseColor(cs.borderLeftColor) || 'D0D7DE', space: Math.min(31, Math.round((parseFloat(cs.paddingLeft) || 0) * 0.75)), fill: parseColor(cs.backgroundColor) } : env.quote;
      res = await this.container(el, cs, Object.assign({}, env, { quote: q }));
    } else if (el.classList.contains('math-display')) res = await this.mathBlock(el, cs, env);
    else if (el.classList.contains('mermaid-box') || tag === 'IMG' || tag === 'svg' || tag === 'FIGURE' && !el.textContent.trim()) {
      const target = el.classList.contains('mermaid-box') ? (el.querySelector('svg') || el) : el;
      if (target === el && el.classList.contains('mermaid-box')) res = await this.container(el, cs, env);
      else {
        const run = await this.imageRun(target);
        res = run ? [this.para([{ k: 'obj', obj: run }], el, Object.assign({}, env, { align: D.AlignmentType.CENTER }))] : [];
      }
    } else res = await this.container(el, cs, env);
    if (/page|always/.test(cs.breakAfter + cs.pageBreakAfter)) this.pageBreak = true;
    return res;
  }
  async container(el, cs, env) {
    this.enter(el, cs);
    const al = this.align(cs);
    const inner = Object.assign({}, env, al ? { align: al } : {});
    const out = await this.blocks(Array.from(el.childNodes), inner);
    this.leave(el, cs);
    return out;
  }
  hr(el, cs) {
    const D = this.D;
    const h = parseFloat(cs.height) || 1;
    const color = parseColor(cs.backgroundColor) || parseColor(cs.borderTopColor) || 'D0D7DE';
    const cb = this.box(el);
    const sp = this.spacingFor(cs);
    this.lastWasTable = false;
    const o = {
      children: [], run: { size: 2 },
      spacing: { before: sp.before, after: sp.after, line: 20, lineRule: D.LineRuleType.EXACT },
      indent: { left: Math.max(0, TW(cb.left - this.origin.left)), right: Math.max(0, TW(this.origin.right - cb.right)) },
      border: { bottom: { style: D.BorderStyle.SINGLE, size: EIGHTHS(h), color, space: 0 } }
    };
    if (this.pageBreak) { o.pageBreakBefore = true; this.pageBreak = false; }
    return new D.Paragraph(o);
  }

  listRef(listEl, cs) {
    const D = this.D;
    if (listEl.tagName === 'UL') {
      const type = BULLETS[cs.listStyleType] ? cs.listStyleType : (cs.listStyleType === 'none' ? 'none' : 'disc');
      const ref = 'ul-' + type;
      if (!this.numbering.has(ref)) {
        const text = type === 'none' ? '' : BULLETS[type];
        this.numbering.set(ref, { reference: ref, levels: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(l => ({ level: l, format: D.LevelFormat.BULLET, text, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } }, run: { font: this.fonts.body, color: this.textColor } } })) });
      }
      return ref;
    }
    const ref = 'ol-' + (++this.olSeq);
    const fmt = D.LevelFormat[LIST_FORMATS[cs.listStyleType] || 'DECIMAL'];
    const start = parseInt(listEl.getAttribute('start'), 10) || 1;
    this.numbering.set(ref, { reference: ref, levels: [{ level: 0, format: fmt, text: '%1.', start, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: this.fonts.body, color: this.textColor } } }] });
    return ref;
  }
  async list(el, cs, env) {
    const D = this.D;
    this.enter(el, cs);
    const ref = this.listRef(el, cs);
    const hanging = Math.min(TW(parseFloat(cs.paddingLeft) || 24), 720);
    const out = [];
    for (const li of Array.from(el.children)) {
      if (li.tagName !== 'LI') { out.push(...await this.blocks([li], env)); continue; }
      const lcs = getComputedStyle(li);
      const isTask = li.classList.contains('task-list-item');
      this.enter(li, lcs);
      const nodes = Array.from(li.childNodes).filter(n => !(n.nodeType === 3 && !n.nodeValue.trim()));
      let first = [], firstEl = li, i = 0;
      while (i < nodes.length && (nodes[i].nodeType === 3 || !this.isBlockish(nodes[i], getComputedStyle(nodes[i])))) first.push(nodes[i++]);
      if (!first.length && nodes[i] && nodes[i].tagName === 'P') { firstEl = nodes[i]; first = Array.from(nodes[i].childNodes); i++; }
      let checkbox = null;
      first = first.filter(n => { if (n.nodeType === 1 && n.tagName === 'INPUT' && n.type === 'checkbox') { checkbox = n; return false; } return true; });
      const segs = await this.inlines(first, { block: firstEl });
      const fcs = getComputedStyle(firstEl);
      const cb = this.contentBox(li, lcs);
      const left = Math.max(0, TW(cb.left - this.origin.left));
      let p;
      if (isTask || checkbox) {
        const props = Object.assign({}, this.runProps(firstEl, {}), { font: 'Segoe UI Symbol' });
        segs.unshift({ k: 't', text: checkbox && checkbox.checked ? '☑' : '☐', props }, { k: 'tab' });
        p = this.para(segs, firstEl, env, { indent: { left, hanging: Math.min(hanging, 400), right: 0 } });
      } else {
        p = this.para(segs, firstEl, env, { indent: { left, hanging, right: 0 }, opts: { numbering: { reference: ref, level: 0, custom: true } } });
      }
      out.push(p);
      if (firstEl !== li) { this.lastMB = parseFloat(fcs.marginBottom) || 0; }
      if (i < nodes.length) out.push(...await this.blocks(nodes.slice(i), env));
      this.leave(li, lcs);
    }
    this.leave(el, cs);
    return out;
  }

  async code(el, cs, env) {
    const D = this.D;
    const codeEl = el.querySelector('code') || el;
    const segs = await this.inlines(Array.from(codeEl.childNodes), { block: el, pre: true });
    const lines = [[]];
    for (const s of segs) {
      if (s.k !== 't') { lines[lines.length - 1].push(s); continue; }
      const parts = s.text.replace(/\t/g, '    ').split('\n');
      parts.forEach((t, i) => { if (i) lines.push([]); if (t) lines[lines.length - 1].push(Object.assign({}, s, { text: t })); });
    }
    while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
    const fs = parseFloat(cs.fontSize) || this.baseFs * 0.85;
    const lh = parseFloat(cs.lineHeight) || fs * 1.45;
    const lineSp = { before: 0, after: 0, line: Math.max(240, Math.round(240 * (lh / fs) / 1.17)), lineRule: D.LineRuleType.AUTO };
    const color = parseColor(cs.color) || this.textColor;
    const paras = lines.map(segsLine => new D.Paragraph({
      children: segsLine.length ? this.toChildren(segsLine, true) : [new D.TextRun({ text: '', size: HP(fs), font: this.fonts.mono })],
      spacing: lineSp, run: { size: HP(fs), font: this.fonts.mono, color }
    }));
    return this.boxTable(el, cs, env, paras);
  }
  boxTable(el, cs, env, children) {
    const D = this.D;
    const b = this.box(el);
    const sp = this.spacingFor(cs);
    const out = [];
    if (sp.before > 0 || this.lastWasTable || this.pageBreak) { out.push(this.spacer(sp.before / 15, this.pageBreak)); this.pageBreak = false; }
    const fill = parseColor(cs.backgroundColor);
    const side = s => {
      const w = parseFloat(cs['border' + s + 'Width']) || 0;
      return w > 0 && cs['border' + s + 'Style'] !== 'none' ? { style: D.BorderStyle.SINGLE, size: EIGHTHS(w), color: parseColor(cs['border' + s + 'Color']) || 'D0D7DE' } : { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    };
    const width = Math.max(200, TW(b.width));
    const cell = new D.TableCell({
      children,
      width: { size: width, type: D.WidthType.DXA },
      shading: fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill } : undefined,
      margins: { top: TW(parseFloat(cs.paddingTop) || 0), bottom: TW(parseFloat(cs.paddingBottom) || 0), left: TW(parseFloat(cs.paddingLeft) || 0), right: TW(parseFloat(cs.paddingRight) || 0) },
      borders: { top: side('Top'), bottom: side('Bottom'), left: side('Left'), right: side('Right') }
    });
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    out.push(new D.Table({
      rows: [new D.TableRow({ children: [cell] })],
      width: { size: width, type: D.WidthType.DXA }, columnWidths: [width], layout: D.TableLayoutType.FIXED,
      indent: { size: Math.max(0, TW(b.left - this.origin.left)), type: D.WidthType.DXA },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
    }));
    this.lastWasTable = true; this.lastAfter = 0;
    return out;
  }

  async table(el, cs, env) {
    const D = this.D;
    const b = this.box(el);
    const sp = this.spacingFor(cs);
    const out = [];
    if (sp.before > 0 || this.lastWasTable || this.pageBreak) { out.push(this.spacer(sp.before / 15, this.pageBreak)); this.pageBreak = false; }
    const rows = Array.from(el.rows);
    // column grid from the row with the most cells
    let grid = [];
    for (const tr of rows) { const cells = Array.from(tr.cells); if (cells.every(c => c.colSpan === 1) && cells.length > grid.length) grid = cells.map(c => this.box(c).width); }
    if (!grid.length && rows[0]) grid = Array.from(rows[0].cells).map(c => this.box(c).width / c.colSpan);
    // a little slack so Word's font metrics don't wrap words the browser kept on one line
    const rawW = grid.map(w => Math.max(120, TW(w)));
    const rawTotal = rawW.reduce((a, c) => a + c, 0);
    const room = TW(this.origin.right - this.origin.left) - Math.max(0, TW(b.left - this.origin.left));
    const slack = Math.max(1, Math.min(1.06, room / rawTotal));
    const colW = rawW.map(w => Math.floor(w * slack));
    const total = colW.reduce((a, c) => a + c, 0);
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'auto' };
    const saved = this.origin, savedState = [this.lastMB, this.lastAfter, this.pendingMT, this.lastWasTable];
    const trs = [];
    for (const tr of rows) {
      const trcs = getComputedStyle(tr);
      const sec = tr.parentElement;
      const cells = [];
      for (const td of Array.from(tr.cells)) {
        const tcs = getComputedStyle(td);
        const side = s => {
          const w = parseFloat(tcs['border' + s + 'Width']) || 0;
          if (!(w > 0) || tcs['border' + s + 'Style'] === 'none' || tcs['border' + s + 'Style'] === 'hidden') return none;
          const st = tcs['border' + s + 'Style'];
          return { style: st === 'dashed' ? D.BorderStyle.DASHED : st === 'dotted' ? D.BorderStyle.DOTTED : st === 'double' ? D.BorderStyle.DOUBLE : D.BorderStyle.SINGLE, size: EIGHTHS(w), color: parseColor(tcs['border' + s + 'Color']) || '000000' };
        };
        const fill = parseColor(tcs.backgroundColor) || parseColor(trcs.backgroundColor) || (sec ? parseColor(getComputedStyle(sec).backgroundColor) : null);
        this.origin = this.contentBox(td, tcs);
        this.lastMB = 0; this.lastAfter = 0; this.pendingMT = 0; this.lastWasTable = false;
        let kids = await this.blocks(Array.from(td.childNodes), { align: this.align(tcs) });
        if (!kids.length) kids = [new D.Paragraph({ children: [], spacing: { before: 0, after: 0 } })];
        if (kids[kids.length - 1] instanceof D.Table) kids.push(new D.Paragraph({ children: [], spacing: { before: 0, after: 0 }, run: { size: 2 } }));
        const va = tcs.verticalAlign;
        cells.push(new D.TableCell({
          children: kids,
          width: { size: Math.floor(Math.max(120, TW(this.box(td).width)) * slack), type: D.WidthType.DXA },
          columnSpan: td.colSpan > 1 ? td.colSpan : undefined,
          rowSpan: td.rowSpan > 1 ? td.rowSpan : undefined,
          shading: fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill } : undefined,
          margins: { top: TW(parseFloat(tcs.paddingTop) || 0), bottom: TW(parseFloat(tcs.paddingBottom) || 0), left: TW(parseFloat(tcs.paddingLeft) || 0), right: TW(parseFloat(tcs.paddingRight) || 0) },
          verticalAlign: va === 'middle' ? D.VerticalAlignTable.CENTER : va === 'bottom' ? D.VerticalAlignTable.BOTTOM : D.VerticalAlignTable.TOP,
          borders: { top: side('Top'), bottom: side('Bottom'), left: side('Left'), right: side('Right') }
        }));
      }
      trs.push(new D.TableRow({ children: cells, tableHeader: sec && sec.tagName === 'THEAD', cantSplit: true }));
    }
    this.origin = saved;
    [this.lastMB, this.lastAfter, this.pendingMT, this.lastWasTable] = savedState;
    out.push(new D.Table({
      rows: trs, width: { size: total, type: D.WidthType.DXA }, columnWidths: colW, layout: D.TableLayoutType.FIXED,
      indent: { size: Math.max(0, TW(b.left - this.origin.left)), type: D.WidthType.DXA },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
    }));
    this.lastWasTable = true; this.lastAfter = 0; this.lastMB = parseFloat(cs.marginBottom) || 0;
    return out;
  }

  async mathObj(el) {
    const tex = el.getAttribute('data-tex') || '';
    if (this.DM && tex) {
      try { return { k: 'math', obj: new this.D.Math({ children: this.DM.latexToMath(tex) }) }; } catch (e) { /* fall back to a picture */ }
    }
    const run = await this.elementImage(el.querySelector('.katex') || el);
    return run ? { k: 'obj', obj: run } : { k: 't', text: tex, props: { font: this.fonts.mono } };
  }
  async mathBlock(el, cs, env) {
    const m = await this.mathObj(el);
    return [this.para([m], el, Object.assign({}, env, { align: this.D.AlignmentType.CENTER }))];
  }

  /* ----- pictures ----- */
  fitSize(w, h) {
    const max = (this.origin.right - this.origin.left) || 600;
    if (w > max) { h = h * max / w; w = max; }
    return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  }
  async imageRun(el) {
    const D = this.D;
    const b = this.box(el);
    if (!(b.width > 0 && b.height > 0)) return null;
    const size = this.fitSize(b.width, b.height);
    let data = null, type = 'png';
    try {
      if (el.tagName === 'IMG') {
        const src = el.currentSrc || el.src || '';
        if (/^data:image\/(png|jpe?g|gif|bmp)/i.test(src)) {
          const { mime, bytes } = dataURLToBytes(src);
          data = bytes; type = /jpe?g/.test(mime) ? 'jpg' : mime.split('/')[1];
        } else {
          data = await this.rasterImage(el, el.naturalWidth || b.width, el.naturalHeight || b.height, size);
        }
      } else if (el instanceof SVGElement) {
        data = await this.svgToPng(el, b);
      }
    } catch (e) { console.warn('Imagen omitida en Word:', e); data = null; }
    if (!data) return null;
    const alt = (el.getAttribute && (el.getAttribute('alt') || el.getAttribute('aria-label'))) || t('img.alt');
    return new D.ImageRun({ type, data, transformation: size, altText: { title: alt, description: alt, name: alt.slice(0, 60) } });
  }
  async rasterImage(img, nw, nh, size) {
    const s = Math.min(3, Math.max(1, (nw / size.width) || 2));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(size.width * s)); c.height = Math.max(1, Math.round(size.height * s));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await canvasToBlob(c, 'image/png');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async svgToPng(svg, b) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(b.width)); clone.setAttribute('height', String(b.height));
    clone.style.maxWidth = 'none';
    const str = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    await img.decode();
    const s = 3;
    const c = document.createElement('canvas');
    c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await canvasToBlob(c, 'image/png');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async elementImage(el) {
    try {
      await loadLib('shot');
      const fontCss = katexFontCss();
      const blob = await window.modernScreenshot.domToBlob(el, { scale: 3, type: 'image/png', font: fontCss ? { cssText: fontCss } : false });
      const b = this.box(el);
      return new this.D.ImageRun({ type: 'png', data: new Uint8Array(await blob.arrayBuffer()), transformation: this.fitSize(b.width, b.height) });
    } catch (e) { console.warn(e); return null; }
  }

  async build() {
    const D = this.D;
    const g = geom();
    progress(t('p.blocks'), 0.2);
    const body = await this.blocks(Array.from(this.root.childNodes), {});
    if (!body.length) body.push(new D.Paragraph({ children: [] }));
    if (body[body.length - 1] instanceof D.Table) body.push(new D.Paragraph({ children: [], run: { size: 2 } }));
    const footers = opts.docxnum ? {
      default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ children: [D.PageNumber.CURRENT, ' / ', D.PageNumber.TOTAL_PAGES], size: 18, color: '7A848E', font: this.fonts.body })] })] })
    } : undefined;
    const lineRatio = Math.round(240 * 1.5 / 1.17);
    const doc = new D.Document({
      creator: 'Imprenta MD', title: this.title, description: 'Convertido desde Markdown',
      styles: {
        default: {
          document: { run: { font: this.fonts.body, size: HP(this.baseFs), color: this.textColor }, paragraph: { spacing: { before: 0, after: 0, line: lineRatio } } },
          heading1: { run: { font: this.fonts.heading, color: this.textColor } }, heading2: { run: { font: this.fonts.heading, color: this.textColor } },
          heading3: { run: { font: this.fonts.heading, color: this.textColor } }, heading4: { run: { font: this.fonts.heading, color: this.textColor } },
          heading5: { run: { font: this.fonts.heading, color: this.textColor } }, heading6: { run: { font: this.fonts.heading, color: this.textColor } }
        }
      },
      numbering: { config: Array.from(this.numbering.values()) },
      features: { updateFields: false },
      sections: [{
        properties: {
          page: {
            size: { width: TW(g.pageW), height: TW(g.pageH), orientation: g.pageW > g.pageH ? D.PageOrientation.LANDSCAPE : D.PageOrientation.PORTRAIT },
            margin: { top: TW(g.m), bottom: TW(g.m), left: TW(g.m), right: TW(g.m), header: TW(g.m / 2), footer: TW(Math.max(18, g.m / 2.2)) }
          }
        },
        footers,
        children: body
      }]
    });
    progress(t('p.packing'), 0.9);
    return D.Packer.toBlob(doc);
  }
}
async function buildDocx(root, title) {
  progress(t('p.word'), 0.05);
  await loadLib('docx');
  if ($('.math-inline, .math-display', root)) { try { await loadLib('docxmath'); } catch (e) { /* images instead */ } }
  const b = new DocxBuilder(root, title);
  return b.build();
}

/* =====================================================================
   Export orchestration
   ===================================================================== */
async function withExportLayout(fn) {
  document.body.classList.add('exporting');
  layoutPaper();
  await nextFrame();
  try { return await fn(); }
  finally { document.body.classList.remove('exporting'); scheduleLayout(); }
}
const MD_IMG_RE = /(!\[[^\]]*\]\(\s*)(<[^>]+>|[^)\s]+)/g;
const HTML_IMG_RE = /(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi;
function mdImageRefs(d) {
  const found = new Map();
  const add = raw => { const src = raw.replace(/^<|>$/g, ''); if (/^(data:|blob:|https?:|\/\/)/i.test(src)) return; const url = findAsset(src, d.path); if (url) found.set(src, url); };
  let m;
  MD_IMG_RE.lastIndex = 0; while ((m = MD_IMG_RE.exec(d.md))) add(m[2]);
  HTML_IMG_RE.lastIndex = 0; while ((m = HTML_IMG_RE.exec(d.md))) add(m[3]);
  return Array.from(found, ([src, url]) => ({ src, url }));
}
function buildMarkdownFiles(d, base) {
  const refs = mdImageRefs(d);
  const text = t => new Blob([t], { type: 'text/markdown;charset=utf-8' });
  if (!refs.length) return [{ name: base + '.md', blob: text(d.md) }];
  if (opts.mdimg === 'embed') {
    const map = new Map(refs.map(r => [r.src, r.url]));
    const md = d.md.replace(MD_IMG_RE, (all, pre, src) => { const u = map.get(src.replace(/^<|>$/g, '')); return u ? pre + u : all; })
      .replace(HTML_IMG_RE, (all, pre, q, src) => { const u = map.get(src); return u ? pre + q + u + q : all; });
    return [{ name: base + '.md', blob: text(md) }];
  }
  const files = [{ name: base + '.md', blob: text(d.md) }];
  const used = new Set();
  for (const r of refs) {
    let path = r.src; try { path = decodeURIComponent(path); } catch (e) { /* raw */ }
    path = normPath(path.split(/[?#]/)[0]);
    if (!path || used.has(path)) continue;
    used.add(path);
    const { mime, bytes } = dataURLToBytes(r.url);
    files.push({ name: path, blob: new Blob([bytes], { type: mime }) });
  }
  return files;
}
async function convertCurrent() {
  const d = current();
  const base = safeFile(baseName(d.name));
  if (opts.format === 'md') return buildMarkdownFiles(d, base);
  const title = (els.doc.querySelector('h1') || {}).textContent || baseName(d.name);
  return withExportLayout(async () => {
    if (opts.format === 'pdf') return [{ name: base + '.pdf', blob: await buildPDF(els.doc, title.trim()) }];
    if (opts.format === 'docx') return [{ name: base + '.docx', blob: await buildDocx(els.doc, title.trim()) }];
    return buildImages(els.doc, base);
  });
}
async function zipFiles(files, name) {
  await loadLib('jszip');
  const zip = new window.JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  return { name, blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }) };
}
async function exportCurrent() {
  const d = current();
  if (!d) { toast(t('ex.none'), true); return; }
  busy(true, t('ex.making', { pdf: 'PDF', docx: 'Word', image: t('ex.image'), md: 'Markdown' }[opts.format]));
  try {
    await render();
    let files = await convertCurrent();
    let out = files[0];
    if (files.length > 1) { progress(t('p.zipping', files.length), 0.97); out = await zipFiles(files, safeFile(baseName(d.name)) + '-' + (opts.format === 'md' ? 'markdown' : opts.imgmode === 'pages' ? t('zip.pages') : t('zip.parts')) + '.zip'); }
    busy(false);
    await saveFile(out.name, out.blob);
  } catch (e) {
    console.error(e);
    busy(false);
    toast(t('ex.failed', (e && e.message) || e), true);
  }
}
async function exportAll() {
  if (state.docs.length < 2) return;
  const keep = state.current;
  busy(true, t('ex.all', state.docs.length));
  try {
    const all = [];
    const used = new Set();
    for (let i = 0; i < state.docs.length; i++) {
      state.current = i;
      els.editor.value = state.docs[i].md; renderTabs();
      progress(t('p.docOf', state.docs[i].name, i + 1, state.docs.length), i / state.docs.length);
      await render();
      const files = await convertCurrent();
      for (const f of files) {
        let n = f.name, k = 2;
        while (used.has(n.toLowerCase())) n = f.name.replace(/(\.[^.]+)$/, '-' + (k++) + '$1');
        used.add(n.toLowerCase()); all.push({ name: n, blob: f.blob });
      }
    }
    progress(t('p.zip'), 0.98);
    const z = await zipFiles(all, t('zip.docs') + '-' + (opts.format === 'image' ? opts.imgtype : opts.format) + '.zip');
    busy(false);
    await saveFile(z.name, z.blob);
  } catch (e) {
    console.error(e); busy(false);
    toast(t('ex.allFailed', (e && e.message) || e), true);
  } finally {
    state.current = keep; selectDoc(keep);
  }
}
els.exportBtn.addEventListener('click', exportCurrent);
els.exportAll.addEventListener('click', exportAll);
window.addEventListener('resize', () => scheduleLayout());

/* =====================================================================
   Start
   ===================================================================== */
bindOptions();
if (!window.marked || !window.DOMPurify) {
  els.frame.hidden = true; els.empty.hidden = false;
  els.empty.innerHTML = t('boot.failed');
  return;
}
const saved = store.get('docs', null);
if (Array.isArray(saved) && saved.length) {
  for (const d of saved) if (d && typeof d.md === 'string') { const n = addDoc(d.name || 'documento.md', d.md, d.path, d.enc); if (isSample(d.md)) n.sample = true; if (d.pdfInfo) n.pdfInfo = d.pdfInfo; }
  const c = store.get('current', 0);
  selectDoc(Math.min(Math.max(0, c | 0), state.docs.length - 1));
} else {
  const d = addDoc(t('sample.name'), SAMPLES[lang()]); d.sample = true;
  selectDoc(0);
}
// test hooks (used by automated checks; harmless for people)
window.__imprenta = { pdfToMarkdown, loadPdfJs, pdfReadPage, pdfColumns, state, opts, render, buildPDF: () => convertCurrent(), exportCurrent, ingest, paginate, geom, selectDoc, setOpt(k, v) { opts[k] = v; syncOptionsUI(); applyDocStyle(); return render(); } };
})();
