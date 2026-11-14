/* =====================================================================
   PDF → Markdown
   Reads the text layer of a PDF (positions, sizes, fonts), rebuilds the
   structure (headings, paragraphs, lists, tables, code, links) and pulls
   out the embedded pictures. Runs entirely in the browser.
   ===================================================================== */
const PDF_RE = /\.pdf$/i;
const BULLET_CH = '•◦▪▫●○■□➢➤►▶·‣⁃∙\\uf000-\\uf0ff';
const RE_MARKER_ONLY = new RegExp('^([' + BULLET_CH + '\\-–*]|\\(?\\d{1,3}[.)]|\\(?[a-zA-Z][.)]|\\[[ xX]\\]|[☐☑☒])$');
const RE_BULLET = new RegExp('^(?:[' + BULLET_CH + ']\\s*|[-–*]\\s+)');
const RE_TASK = /^(\[( |x|X)\]|[☐☑☒])\s+/;
const RE_ORDERED = /^\(?(\d{1,3})[.)]\s+/;
const RE_PAGENUM = /^(p[áa]g(ina|\.)?\s*)?\d{1,4}(\s*(\/|de|of)\s*\d{1,4})?$/i;
const RE_END = /[.!?:;…]["”»)\]]?$/;

async function loadPdfJs() {
  await loadLib('pdfworker'); // parser; runs in this page, so no separate worker file is needed
  await loadLib('pdfjs');
  return window.pdfjsLib;
}
function matMul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function pdfImageToCanvas(o) {
  const w = o.width, h = o.height;
  if (!(w >= 16 && h >= 16)) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let opaque = true;
  if (o.bitmap) { ctx.drawImage(o.bitmap, 0, 0); opaque = false; }
  else if (o.data) {
    const id = ctx.createImageData(w, h), d = id.data, s = o.data;
    if (o.kind === 3) { d.set(s.subarray(0, w * h * 4)); for (let i = 3; i < d.length; i += 4 * 53) if (d[i] < 250) { opaque = false; break; } }
    else if (o.kind === 2) { for (let i = 0, j = 0; j < d.length; i += 3, j += 4) { d[j] = s[i]; d[j + 1] = s[i + 1]; d[j + 2] = s[i + 2]; d[j + 3] = 255; } }
    else if (o.kind === 1) {
      const rb = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (s[y * rb + (x >> 3)] & (0x80 >> (x & 7))) ? 255 : 0; const j = (y * w + x) * 4; d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255; }
    } else return null;
    ctx.putImageData(id, 0, 0);
  } else return null;
  return { canvas: c, opaque };
}
function pdfEncodeCanvas(c, opaque) {
  let out = c;
  if (c.width > 2000) {
    const k = 2000 / c.width; out = document.createElement('canvas'); out.width = 2000; out.height = Math.round(c.height * k);
    const o2 = out.getContext('2d'); if (opaque) { o2.fillStyle = '#ffffff'; o2.fillRect(0, 0, out.width, out.height); }
    o2.drawImage(c, 0, 0, out.width, out.height);
  }
  const jpeg = opaque && c.width * c.height > 250000;
  return { url: out.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.88), ext: jpeg ? 'jpg' : 'png' };
}
function pdfImageToDataURL(o) { const r = pdfImageToCanvas(o); return r ? pdfEncodeCanvas(r.canvas, r.opaque) : null; }
/* A page stored as one picture with its text on top (scans with OCR, PDFs made by this app):
   cut out the areas between text lines that hold drawings, formulas or photos. */
function pdfFiguresFromRaster(obj, b, lines) {
  const r = pdfImageToCanvas(obj); if (!r) return [];
  const c = r.canvas, sx = c.width / (b.x1 - b.x0), sy = c.height / (b.y1 - b.y0);
  const spans = lines.filter(L => L.y > b.y0 && L.y < b.y1 + L.fs).map(L => [L.y - L.fs, L.y + L.fs * 0.35]).sort((p, q) => p[0] - q[0]);
  const gaps = []; let at = b.y0;
  for (const sp of spans) { if (sp[0] - at >= 28) gaps.push([at, sp[0]]); at = Math.max(at, sp[1]); }
  if (b.y1 - at >= 28) gaps.push([at, b.y1]);
  if (!gaps.length) return [];
  const k = Math.min(1, 360 / c.width);
  const sm = document.createElement('canvas'); sm.width = Math.max(1, Math.round(c.width * k)); sm.height = Math.max(1, Math.round(c.height * k));
  const sctx = sm.getContext('2d'); sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, sm.width, sm.height); sctx.drawImage(c, 0, 0, sm.width, sm.height);
  const px = sctx.getImageData(0, 0, sm.width, sm.height).data;
  const out = [];
  for (const g of gaps) {
    const r0 = Math.max(0, Math.floor((g[0] - b.y0) * sy * k)), r1 = Math.min(sm.height, Math.ceil((g[1] - b.y0) * sy * k));
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = r0; y < r1; y++) for (let x = 0; x < sm.width; x++) {
      const j = (y * sm.width + x) * 4, R = px[j], G = px[j + 1], B = px[j + 2];
      if ((R + G + B) / 3 < 215 || Math.max(R, G, B) - Math.min(R, G, B) > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) continue;
    const pad = 5; // points
    const fx0 = Math.max(0, x0 / k - pad * sx), fx1 = Math.min(c.width, (x1 + 1) / k + pad * sx), fy0 = Math.max(0, y0 / k - pad * sy), fy1 = Math.min(c.height, (y1 + 1) / k + pad * sy);
    const wpt = (fx1 - fx0) / sx, hpt = (fy1 - fy0) / sy;
    if (wpt < 24 || hpt < 20) continue;
    const cut = document.createElement('canvas'); cut.width = Math.round(fx1 - fx0); cut.height = Math.round(fy1 - fy0);
    const cctx = cut.getContext('2d'); cctx.fillStyle = '#ffffff'; cctx.fillRect(0, 0, cut.width, cut.height);
    cctx.drawImage(c, fx0, fy0, cut.width, cut.height, 0, 0, cut.width, cut.height);
    out.push(Object.assign({ y: b.y0 + fy0 / sy, w: wpt }, pdfEncodeCanvas(cut, true)));
  }
  return out;
}

/* ---------- one page: text lines + pictures, in page coordinates (y grows downward) ---------- */
function pdfBuildLine(items, page) {
  items.sort((a, b) => a.x - b.x);
  const count = new Map();
  for (const it of items) { const k = Math.round(it.fs * 2) / 2; count.set(k, (count.get(k) || 0) + it.str.trim().length); }
  let fs = 0, best = -1;
  for (const [k, n] of count) if (n > best) { best = n; fs = k; }
  const segs = []; let cur = null, prev = null;
  for (const it of items) {
    if (prev && Math.abs(it.x - prev.x) < 0.5 && it.str === prev.str) continue;
    const gap = prev ? it.x - prev.x1 : 0;
    const curText = cur ? cur.runs.map(r => r.text).join('').trim() : '';
    if (!cur || (gap > Math.max(1.1 * fs, 10) && !RE_MARKER_ONLY.test(curText))) { cur = { x0: it.x, x1: it.x1, runs: [] }; segs.push(cur); }
    else {
      const last = cur.runs[cur.runs.length - 1];
      const tight = /^[,.;:!?)\]»”%]/.test(it.str) || /[(\[«“¿¡]$/.test(prev.str) || it.v || prev.v;
      const restyled = prev.b !== it.b || prev.i !== it.i || prev.m !== it.m || prev.link !== it.link;
      if (gap > (tight ? 0.5 : restyled ? 0.04 : 0.15) * it.fs && last && !/\s$/.test(last.text) && !/^\s/.test(it.str)) cur.runs.push({ text: ' ', b: last.b, i: last.i, m: last.m, link: last.link });
    }
    cur.runs.push({ text: it.str, b: it.b, i: it.i, m: it.m, link: it.link, v: it.v || '' });
    cur.x1 = Math.max(cur.x1, it.x1);
    prev = it;
  }
  return pdfLineFromSegs({ page, y: items.reduce((a, it) => (it.fs >= a.fs ? it : a), items[0]).y, fs }, segs);
}
function pdfLineFromSegs(base, segs) {
  for (const s of segs) s.text = s.runs.map(r => r.text).join('').replace(/\s+/g, ' ').trim();
  const runs = [];
  segs.forEach((s, i) => { if (i) runs.push({ text: ' ', b: false, i: false, m: s.runs[0] ? s.runs[0].m : false, link: null }); runs.push(...s.runs); });
  const solid = runs.filter(r => r.text.trim());
  return {
    type: 'line', page: base.page, y: base.y, fs: base.fs, segs, runs,
    x: segs[0].x0, x1: segs[segs.length - 1].x1,
    text: segs.map(s => s.text).join(' '),
    mono: solid.length > 0 && solid.every(r => r.m),
    bold: solid.length > 0 && solid.every(r => r.b)
  };
}
async function pdfReadPage(page, pdfjsLib, pageNo, shared) {
  const vp = page.getViewport({ scale: 1 });
  const W = vp.width, H = vp.height;
  let ops = null;
  try { ops = await page.getOperatorList(); } catch (e) { /* text only */ }
  const tc = await page.getTextContent();
  let annots = [];
  try { annots = await page.getAnnotations(); } catch (e) { /* no links */ }
  const links = annots.filter(a => a.subtype === 'Link' && a.url).map(a => {
    const r = vp.convertToViewportRectangle(a.rect);
    return { url: a.url, x0: Math.min(r[0], r[2]), x1: Math.max(r[0], r[2]), y0: Math.min(r[1], r[3]), y1: Math.max(r[1], r[3]) };
  });
  const fonts = new Map();
  const fontInfo = name => {
    if (fonts.has(name)) return fonts.get(name);
    let f = null;
    try { if (page.commonObjs.has(name)) f = page.commonObjs.get(name); } catch (e) { /* not loaded */ }
    const st = (tc.styles && tc.styles[name]) || {};
    const nm = (f && f.name) || '';
    const info = {
      b: !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demibold/i.test(nm),
      i: !!(f && f.italic) || /italic|oblique/i.test(nm),
      m: !!(f && f.isMonospace) || /mono|courier|consol|menlo/i.test(nm) || st.fontFamily === 'monospace'
    };
    fonts.set(name, info); return info;
  };
  const items = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const t = pdfjsLib.Util.transform(vp.transform, it.transform);
    const fs = Math.hypot(t[2], t[3]);
    if (fs < 2 || t[0] <= 0 || Math.abs(t[1]) > 0.3 * Math.abs(t[0])) continue; // skip rotated text (watermarks, side labels)
    const fi = fontInfo(it.fontName);
    const x = t[4], y = t[5], x1 = x + it.width;
    if (x1 < 0 || x > W || y < 0 || y > H + fs) continue;
    const cy = y - fs * 0.3;
    const mk = (str, a, z, link) => { if (str) items.push({ str, x: a, x1: z, y, fs, b: fi.b, i: fi.i, m: fi.m, link }); };
    const over = links.filter(l => cy >= l.y0 - 1 && cy <= l.y1 + 1 && l.x1 > x + 1 && l.x0 < x1 - 1).sort((p, q) => p.x0 - q.x0);
    if (!over.length) { mk(it.str, x, x1, null); continue; }
    const n = it.str.length, cw = (x1 - x) / n;
    const snap = k => { k = Math.max(0, Math.min(n, Math.round(k))); for (const d of [0, -1, 1, -2, 2]) { const q = k + d; if (q <= 0 || q >= n) return q <= 0 ? 0 : n; if (/\s/.test(it.str[q]) || /\s/.test(it.str[q - 1])) return /\s/.test(it.str[q - 1]) ? q : q; } return k; };
    let pos = 0;
    for (const l of over) {
      const a = snap((l.x0 - x) / cw), z = snap((l.x1 - x) / cw);
      let z2 = z; while (z2 > a + 1 && (/\s/.test(it.str[z2 - 1]) || (/[.,;:!?)]/.test(it.str[z2 - 1]) && !l.url.endsWith(it.str[z2 - 1])))) z2--;
      if (z2 <= a || a < pos) continue;
      mk(it.str.slice(pos, a), x + pos * cw, x + a * cw, null);
      mk(it.str.slice(a, z2), x + a * cw, x + z2 * cw, l.url);
      pos = z2;
    }
    mk(it.str.slice(pos), x + pos * cw, x1, null);
  }
  for (let k = items.length - 1; k >= 0; k--) if (!items[k].str.trim()) items.splice(k, 1);
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const groups = [];
  for (const it of items) {
    let g = null;
    for (let k = groups.length - 1; k >= 0 && k >= groups.length - 8; k--) {
      if (Math.abs(groups[k].y - it.y) <= 0.4 * Math.max(groups[k].fs, it.fs)) { g = groups[k]; break; }
    }
    if (!g) { g = { y: it.y, fs: it.fs, items: [] }; groups.push(g); }
    else if (it.fs > g.fs) { g.fs = it.fs; g.y = it.y; }
    g.items.push(it);
  }
  groups.sort((a, b) => a.y - b.y);
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    if (!g || g.items.reduce((t, it) => t + it.str.trim().length, 0) > 6) continue;
    const gx0 = Math.min(...g.items.map(it => it.x)), gx1 = Math.max(...g.items.map(it => it.x1));
    for (const h of [groups[k + 1], groups[k - 1]]) {
      if (!h || g.fs > 0.8 * h.fs || Math.abs(h.y - g.y) > 0.95 * h.fs) continue;
      const hx0 = Math.min(...h.items.map(it => it.x)), hx1 = Math.max(...h.items.map(it => it.x1));
      if (gx0 < hx0 - 1 || gx1 > hx1 + 0.6 * h.fs) continue;
      h.items.push(...g.items); groups[k] = null; break;
    }
  }
  for (const g of groups) if (g) for (const it of g.items) {
    if (it.fs <= 0.8 * g.fs && it.str.trim().length <= 6) it.v = it.y < g.y - 0.12 * g.fs ? 'sup' : it.y > g.y + 0.08 * g.fs ? 'sub' : '';
  }
  let lines = groups.filter(Boolean).map(g => pdfBuildLine(g.items, pageNo)).sort((a, b) => a.y - b.y);

  /* pictures */
  const images = [], dots = [];
  let raster = null;
  if (ops) {
    const OPS = pdfjsLib.OPS;
    let ctm = vp.transform.slice(); const stack = [];
    const getObj = name => new Promise(res => {
      const objs = String(name).startsWith('g_') ? page.commonObjs : page.objs;
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 4000);
      try { objs.get(name, o => { if (!done) { done = true; clearTimeout(t); res(o); } }); } catch (e) { clearTimeout(t); res(null); }
    });
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = matMul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = matMul(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.constructPath) {
        const mm = args && args[2];
        if (!mm || !isFinite(mm[0]) || !isFinite(mm[3])) continue;
        const px = [mm[0], mm[1]], py = [mm[2], mm[3]], xs = [], ys = [];
        for (const a of px) for (const b of py) { xs.push(ctm[0] * a + ctm[2] * b + ctm[4]); ys.push(ctm[1] * a + ctm[3] * b + ctm[5]); }
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
        if (w <= 9 && h <= 9 && (w < 0.5 && h < 0.5 || (w >= 1.5 && h >= 1.5 && w / h > 0.6 && w / h < 1.7))) dots.push({ x0: Math.min(...xs), x1: Math.max(...xs), yc: (Math.min(...ys) + Math.max(...ys)) / 2 });
      }
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]];
        const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]];
        const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        const w = b.x1 - b.x0, h = b.y1 - b.y0;
        if (w < 20 || h < 20 || shared.images >= 60) continue;
        const area = (w * h) / (W * H);
        const inside = items.filter(it => it.x >= b.x0 - 2 && it.x1 <= b.x1 + 2 && it.y >= b.y0 && it.y <= b.y1 + 2).length;
        if (area > 0.4 && items.length >= 3 && inside >= 0.5 * items.length) { // picture of the page under its own text
          shared.raster++;
          if (!raster) { const o = fn === OPS.paintInlineImageXObject ? args[0] : await getObj(args[0]); if (o) raster = { obj: o, b }; }
          continue;
        }
        const obj = fn === OPS.paintInlineImageXObject ? args[0] : await getObj(args[0]);
        if (!obj) continue;
        let enc = null;
        try { enc = pdfImageToDataURL(obj); } catch (e) { enc = null; }
        if (!enc) continue;
        const key = obj.width + 'x' + obj.height + ':' + enc.url.length + ':' + enc.url.slice(-48);
        if (shared.seen.has(key)) continue; // repeated logo or background
        shared.seen.add(key);
        if (!items.length && area > 0.5) shared.scanned++;
        shared.images++;
        images.push({ type: 'img', page: pageNo, y: b.y0, w, wide: w >= 0.6 * W, url: enc.url, ext: enc.ext, n: shared.images });
      }
    }
  }
  if (raster) {
    try {
      for (const f of pdfFiguresFromRaster(raster.obj, raster.b, lines)) {
        if (shared.images >= 60) break;
        shared.images++;
        images.push({ type: 'img', page: pageNo, y: f.y, w: f.w, wide: f.w >= 0.6 * W, url: f.url, ext: f.ext, n: shared.images });
      }
    } catch (e) { /* keep the text */ }
  }
  // bullets drawn as small shapes instead of characters
  if (dots.length) {
    lines = lines.map(L => {
      if (RE_BULLET.test(L.text) || RE_ORDERED.test(L.text)) return L;
      const d = dots.find(d => d.x1 <= L.x + 1 && L.x - d.x1 > 1 && L.x - d.x1 < 2.6 * L.fs && d.yc > L.y - L.fs * 0.95 && d.yc < L.y + L.fs * 0.1);
      if (!d) return L;
      const f = L.segs[0].runs[0];
      L.segs[0].runs.unshift({ text: '• ', b: false, i: false, m: f ? f.m : false, link: null });
      L.segs[0].x0 = d.x0;
      return pdfLineFromSegs(L, L.segs);
    });
  }
  images.sort((a, b) => a.y - b.y);
  return { W, H, lines, images };
}

/* ---------- running headers/footers and page numbers ---------- */
function pdfDropFurniture(pages) {
  const n = pages.length;
  const seen = new Map();
  const edge = (p, L) => L.y < p.H * 0.09 || L.y > p.H * 0.91;
  const keyOf = L => Math.round(L.y / 6) + '|' + L.text.replace(/\d+/g, '#');
  for (const p of pages) { const ks = new Set(p.lines.filter(L => edge(p, L)).map(keyOf)); for (const k of ks) seen.set(k, (seen.get(k) || 0) + 1); }
  const need = Math.max(2, Math.ceil(n * 0.5));
  for (const p of pages) {
    p.lines = p.lines.filter(L => {
      if (!edge(p, L)) return true;
      if (RE_PAGENUM.test(L.text) && (L.y > p.H * 0.88 || L.y < p.H * 0.08)) return false;
      return !(n >= 2 && seen.get(keyOf(L)) >= need);
    });
  }
}
/* ---------- two-column pages: read the left column first ---------- */
function pdfColumns(p) {
  const pieces = [];
  for (const L of p.lines) for (const sg of L.segs) pieces.push({ y: L.y, x0: sg.x0, x1: sg.x1, len: sg.text.length });
  if (pieces.length < 12) return;
  const l = Math.min(...pieces.map(q => q.x0)), r = Math.max(...pieces.map(q => q.x1)), w = r - l;
  if (w < 200) return;
  const starts = new Map();
  for (const q of pieces) if (q.x0 > l + 0.44 * w && q.x0 < l + 0.7 * w) { const k = Math.round(q.x0 / 3); starts.set(k, (starts.get(k) || 0) + 1); }
  let bk = null, bn = 0;
  for (const [k, n] of starts) if (n > bn) { bn = n; bk = k; }
  if (bn < 5) return;
  const rx = Math.min(...pieces.filter(q => Math.abs(q.x0 / 3 - bk) <= 1).map(q => q.x0));
  const g = rx - 3;
  const part = (L, side) => { const sg = L.segs.filter(q => (side ? q.x0 >= g - 2 : q.x1 <= g + 2)); return sg.length ? { y: L.y, x0: sg[0].x0, len: sg.reduce((t, q) => t + q.text.length, 0) } : null; };
  const rightP = p.lines.map(L => part(L, 1)).filter(q => q && Math.abs(q.x0 - rx) <= 4);
  if (rightP.length < 5) return;
  const bandTop = Math.min(...rightP.map(q => q.y)) - 1, bandBot = Math.max(...rightP.map(q => q.y));
  const leftP = p.lines.map(L => part(L, 0)).filter(q => q && q.y >= bandTop && q.y <= bandBot + 30);
  const avg = a => a.reduce((t, q) => t + q.len, 0) / (a.length || 1);
  if (leftP.length < 5 || avg(rightP) < 25 || avg(leftP) < 25) return;
  const out = []; let left = [], right = [], lastLeft = null, over = false;
  const flush = () => { out.push(...left, ...right); left = []; right = []; lastLeft = null; };
  for (const L of p.lines) {
    const a = L.segs.filter(sg => sg.x1 <= g + 2), b = L.segs.filter(sg => sg.x0 >= g - 2);
    const cross = a.length + b.length < L.segs.length;
    if (over || L.y < bandTop) { out.push(L); continue; }
    if (cross) { flush(); out.push(L); continue; }
    if (L.y > bandBot + 0.5 * L.fs && !b.length && (!lastLeft || L.y - lastLeft.y > 2.2 * L.fs || Math.abs(L.fs - lastLeft.fs) > 0.6)) { flush(); over = true; out.push(L); continue; }
    if (a.length) { left.push(pdfLineFromSegs(L, a)); lastLeft = L; }
    if (b.length) right.push(pdfLineFromSegs(L, b));
  }
  flush();
  p.lines = out; p.columns = true;
}

/* ---------- inline text → Markdown ---------- */
function mdEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/([*`\[\]<$])/g, '\\$1')
    .replace(/_/g, (m, off, str) => (/[\p{L}\p{N}]/u.test(str[off - 1] || '') && /[\p{L}\p{N}]/u.test(str[off + 1] || '') ? '_' : '\\_'));
}
function pdfRunsToMd(runs, o) {
  o = o || {};
  const merged = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = merged[merged.length - 1];
    const blank = !r.text.trim();
    if (last && (blank || (last.b === r.b && last.i === r.i && last.m === r.m && last.link === r.link && (last.v || '') === (r.v || '')))) last.text += r.text;
    else if (blank && !last) continue;
    else merged.push({ text: r.text, b: r.b, i: r.i, m: r.m, link: r.link, v: r.v || '' });
  }
  let out = '';
  for (const r of merged) {
    const lead = /^\s*/.exec(r.text)[0], trail = /\s*$/.exec(r.text)[0];
    let core = r.text.trim().replace(/\s+/g, ' ');
    if (!core) { out += ' '; continue; }
    if (r.m && !o.plain) core = core.includes('`') ? '`` ' + core + ' ``' : '`' + core + '`';
    else {
      core = mdEscape(core);
      const b = r.b && !o.noBold && !o.plain, i = r.i && !o.plain;
      if (b && i) core = '***' + core + '***'; else if (b) core = '**' + core + '**'; else if (i) core = '*' + core + '*';
      if (r.v && !o.plain) core = '<' + r.v + '>' + core + '</' + r.v + '>';
    }
    if (r.link && !o.plain) core = '[' + core + '](' + r.link.replace(/\s/g, '%20').replace(/\)/g, '%29') + ')';
    out += (lead ? ' ' : '') + core + (trail ? ' ' : '');
  }
  return out.replace(/ {2,}/g, ' ').trim();
}
function pdfDropChars(runs, n) {
  const out = [];
  for (const r of runs) {
    if (n >= r.text.length) { n -= r.text.length; continue; }
    out.push(n > 0 ? Object.assign({}, r, { text: r.text.slice(n) }) : r); n = 0;
  }
  return out;
}
function pdfJoinLines(lines) {
  const runs = [];
  lines.forEach((L, k) => {
    if (k) {
      const prev = runs[runs.length - 1];
      const first = L.runs.find(r => r.text.trim());
      if (prev && /[\p{L}]-$/u.test(prev.text.trimEnd()) && first && /^\p{Ll}/u.test(first.text.trimStart())) prev.text = prev.text.trimEnd().slice(0, -1); // word split across lines
      else runs.push({ text: ' ', b: false, i: false, m: false, link: null });
    }
    runs.push(...L.runs.map(r => Object.assign({}, r)));
  });
  return runs;
}

/* ---------- tables: rows of cells whose columns line up ---------- */
function pdfTableCols(rows) {
  const iv = [];
  for (const L of rows) if (L.segs.length >= 2) for (const s of L.segs) iv.push([s.x0, s.x1]);
  iv.sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const v of iv) { const c = cols[cols.length - 1]; if (c && v[0] <= c[1] + 3) c[1] = Math.max(c[1], v[1]); else cols.push([v[0], v[1]]); }
  return cols;
}
function pdfColOf(cols, s) {
  let best = -1, ov = -Infinity;
  cols.forEach((c, i) => { const o = Math.min(c[1], s.x1) - Math.max(c[0], s.x0); if (o > ov) { ov = o; best = i; } });
  return best;
}
function pdfFitsCol(cols, s) {
  const i = pdfColOf(cols, s);
  if (i < 0) return false;
  const lo = i > 0 ? cols[i - 1][1] + 2 : cols[0][0] - 6;
  const hi = i < cols.length - 1 ? cols[i + 1][0] - 2 : Infinity;
  return s.x0 >= lo && s.x1 <= hi;
}
function pdfTryTable(stream, i, isHeading) {
  const first = stream[i];
  const rows = [];
  let j = i, prev = null;
  // a wrapped cell can sit slightly above the row's main line when cells are centred vertically
  if (first.segs.length < 2) {
    const nx = stream[i + 1];
    if (!(nx && nx.type === 'line' && nx.page === first.page && nx.segs.length >= 2 && nx.y - first.y > 0 && nx.y - first.y < 1.1 * nx.fs)) return null;
  }
  for (; j < stream.length; j++) {
    const L = stream[j];
    if (L.type !== 'line' || L.page !== first.page || L.mono || isHeading(L)) break;
    if (prev) {
      const dy = L.y - prev.y;
      if (dy <= 0 || dy > 3.2 * Math.max(L.fs, prev.fs)) break;
      if (L.segs.length < 2) {
        const cols = pdfTableCols(rows);
        if (cols.length < 2 || dy > 1.9 * L.fs || !pdfFitsCol(cols, L.segs[0])) break;
      }
    }
    rows.push(L); prev = L;
  }
  while (rows.length > 1 && rows[rows.length - 1].segs.length < 2 && rows[rows.length - 1].y - rows[rows.length - 2].y > 1.35 * rows[rows.length - 1].fs) rows.pop();
  const cols = pdfTableCols(rows);
  let start = 0;
  if (rows.length && rows[0].segs.length < 2 && (cols.length < 2 || !pdfFitsCol(cols, rows[0].segs[0]))) return null;
  const multi = rows.filter(L => L.segs.length >= 2);
  if (multi.length < 2 || cols.length < 2) return null;
  const spread = multi.filter(L => new Set(L.segs.map(s => pdfColOf(cols, s))).size >= 2).length;
  if (spread < 0.8 * multi.length) return null;
  if (cols.length === 2) { let c = 0, k = 0; for (const L of multi) for (const s of L.segs) { c += s.text.length; k++; } if (c / k > 40) return null; }

  const dys = []; for (let k = 1; k < rows.length; k++) dys.push(rows[k].y - rows[k - 1].y);
  const minDy = Math.min(...dys), maxDy = Math.max(...dys);
  const banded = maxDy > 1.3 * minDy, thr = minDy * 1.3;
  const out = []; let cur = null;
  for (let k = start; k < rows.length; k++) {
    const L = rows[k];
    const cells = L.segs.map(s => ({ c: pdfColOf(cols, s), runs: s.runs }));
    const has0 = cells.some(x => x.c === 0), isMulti = L.segs.length >= 2;
    const dy = k ? L.y - rows[k - 1].y : Infinity;
    let fresh;
    if (!cur) fresh = true;
    else if (banded) fresh = dy > thr || (isMulti && has0 && cur.has0);
    else fresh = isMulti;
    if (fresh) { cur = { cells: cols.map(() => []), has0: false }; out.push(cur); }
    for (const x of cells) { if (cur.cells[x.c].length) cur.cells[x.c].push({ text: ' ', b: false, i: false, m: false, link: null }); cur.cells[x.c].push(...x.runs); }
    if (has0) cur.has0 = true;
  }
  if (out.length < 2) return null;
  const filled = out.reduce((a, r) => a + r.cells.filter(c => c.length).length, 0);
  if (filled < 0.5 * out.length * cols.length) return null;
  const cellMd = (runs, head) => pdfRunsToMd(runs, { noBold: head }).replace(/\|/g, '\\|');
  const body = out.slice(1).map(r => r.cells.map(c => cellMd(c, false)));
  const align = cols.map((c, ci) => {
    const vals = body.map(r => r[ci]).filter(Boolean);
    return vals.length && vals.filter(v => /^[^\p{L}]*\d[\d.,\s]*[^\p{L}]*$/u.test(v.replace(/\\/g, ''))).length >= 0.7 * vals.length ? '--:' : '---';
  });
  return { table: true, head: out[0].cells.map(c => cellMd(c, true)), align, body, page: first.page, firstY: first.y, next: i + rows.length };
}

/* ---------- the whole document ---------- */
async function pdfToMarkdown(file, base, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false, disableFontFace: true, fontExtraProperties: true, isOffscreenCanvasSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error(t('pdf.password'));
    throw new Error(t('pdf.unreadable'));
  }
  const shared = { images: 0, scanned: 0, raster: 0, seen: new Set() };
  const pages = [];
  const numPages = pdf.numPages;
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (onProgress) onProgress(n, pdf.numPages);
      const page = await pdf.getPage(n);
      pages.push(await pdfReadPage(page, pdfjsLib, n, shared));
      page.cleanup();
      await sleep(0);
    }
  } finally { try { await pdf.destroy(); } catch (e) { /* already closed */ } }

  pdfDropFurniture(pages);
  for (const p of pages) pdfColumns(p);
  const stream = [];
  for (const p of pages) {
    const seq = p.lines.slice();
    for (const im of p.images) {
      let k = p.columns ? seq.length : seq.findIndex(L => L.type === 'line' && L.y > im.y);
      if (k < 0) k = seq.length;
      seq.splice(k, 0, im);
    }
    stream.push(...seq);
  }
  const lines = stream.filter(e => e.type === 'line');

  // body size, usual line spacing and heading sizes
  const sizeCount = new Map();
  for (const L of lines) sizeCount.set(L.fs, (sizeCount.get(L.fs) || 0) + L.text.length);
  let body = 11, top = -1;
  for (const [k, v] of sizeCount) if (v > top) { top = v; body = k; }
  const ratios = [];
  for (let k = 1; k < lines.length; k++) {
    const a = lines[k - 1], b = lines[k];
    if (a.page === b.page && Math.abs(a.fs - b.fs) < 0.6 && Math.abs(a.fs - body) < 0.6) { const r = (b.y - a.y) / b.fs; if (r > 0.8 && r < 2.2) ratios.push(r); }
  }
  ratios.sort((a, b) => a - b);
  const lead = ratios.length ? ratios[ratios.length >> 1] : 1.25;
  const hsizes = Array.from(new Set(lines.filter(L => L.fs >= body * 1.12 && L.text.length <= 200 && !L.mono).map(L => L.fs))).sort((a, b) => b - a);
  const clusters = [];
  for (const s of hsizes) { if (!clusters.length || clusters[clusters.length - 1] / s > 1.06) clusters.push(s); }
  const levelOf = L => {
    if (L.mono || L.fs < body * 1.12 || L.text.length > 200) return 0;
    let k = clusters.findIndex(c => c / L.fs <= 1.06); if (k < 0) k = clusters.length - 1;
    return Math.min(4, k + 1);
  };
  const boldLevel = Math.max(2, Math.min(6, Math.min(4, clusters.length) + 1));
  const pageBox = new Map();
  for (const L of lines) { const b = pageBox.get(L.page) || { l: Infinity, r: 0 }; b.l = Math.min(b.l, L.x); b.r = Math.max(b.r, L.x1); pageBox.set(L.page, b); }

  const out = [];
  const imgDir = safeFile(base).replace(/\s+/g, '-') + '-' + t('pdf.imgDir');
  const images = [];
  let para = null, list = null, listXs = [];
  const flushPara = () => {
    if (!para) return;
    const ls = para; para = null;
    const runs = pdfJoinLines(ls);
    const text = ls.map(L => L.text).join(' ');
    if (ls.length === 1 && ls[0].bold && text.length <= 90 && !/[.:;,]$/.test(text)) { out.push('#'.repeat(boldLevel) + ' ' + pdfRunsToMd(runs, { noBold: true })); return; }
    let md = pdfRunsToMd(runs);
    if (/^(#{1,6}\s|>|[-+]\s|\d+[.)]\s|={3,}|-{3,}|\|)/.test(md)) md = '\\' + md;
    if (md) out.push(md);
  };
  const flushList = () => {
    if (!list) return;
    const it = list; list = null;
    const md = pdfRunsToMd(pdfJoinLines(it.lines));
    const row = '    '.repeat(it.level) + it.marker + md;
    const last = out[out.length - 1];
    const kind = /^\d/.test(it.marker) ? 'o' : 'u';
    if (last && last.list && !(it.level === 0 && last.kind !== kind)) last.rows.push(row); else out.push({ list: true, kind, rows: [row] });
  };
  const flush = () => { flushPara(); flushList(); };
  const endList = () => { listXs = []; };

  for (let i = 0; i < stream.length; i++) {
    const L = stream[i];
    if (L.type === 'img') {
      flush(); endList();
      const path = imgDir + '/pag' + L.page + '-' + L.n + '.' + L.ext;
      images.push({ path, url: L.url });
      out.push(L.wide ? '![' + t('pdf.imgAlt', L.n) + '](' + path + ')' : '<img src="' + path + '" alt="' + t('pdf.imgAlt', L.n) + '" width="' + Math.round(L.w * 96 / 72) + '">');
      continue;
    }
    const prev = i && stream[i - 1].type === 'line' ? stream[i - 1] : null;
    const lvl = levelOf(L);
    if (L.segs.length >= 2 || (stream[i + 1] && stream[i + 1].type === 'line' && stream[i + 1].segs.length >= 2)) {
      const t = pdfTryTable(stream, i, x => levelOf(x) > 0);
      if (t) {
        flush(); endList();
        const last = out[out.length - 1];
        const firstOnPage = !stream.slice(0, i).some(e => e.page === t.page && e.type === 'line');
        if (last && last.table && firstOnPage && t.page === last.page + 1 && t.head.length === last.head.length) {
          if (t.head.join('|') !== last.head.join('|')) last.body.push(t.head);
          last.body.push(...t.body); last.page = t.page;
        } else out.push(t);
        i = t.next - 1; continue;
      }
    }
    if (lvl) {
      flush(); endList();
      const hs = [L];
      while (stream[i + 1] && stream[i + 1].type === 'line' && stream[i + 1].page === L.page && Math.abs(stream[i + 1].fs - L.fs) < 0.6 && stream[i + 1].y - stream[i].y > 0 && stream[i + 1].y - stream[i].y < 1.5 * L.fs) hs.push(stream[++i]);
      out.push('#'.repeat(lvl) + ' ' + pdfRunsToMd(pdfJoinLines(hs), { noBold: true }));
      continue;
    }
    if (L.mono) {
      flush(); endList();
      const code = [L];
      while (stream[i + 1] && stream[i + 1].type === 'line' && stream[i + 1].mono && stream[i + 1].page === code[code.length - 1].page && stream[i + 1].y - stream[i].y > 0 && stream[i + 1].y - stream[i].y < 3.3 * L.fs) code.push(stream[++i]);
      const x0 = Math.min(...code.map(c => c.x));
      const cw = L.fs * 0.6;
      const rows = [];
      code.forEach((c, k) => {
        if (k && c.y - code[k - 1].y > 1.9 * c.fs) rows.push('');
        let s = ' '.repeat(Math.max(0, Math.round((c.x - x0) / cw))), px = c.x;
        for (const sg of c.segs) { s += ' '.repeat(Math.max(0, Math.round((sg.x0 - px) / cw))) + sg.runs.map(r => r.text).join(''); px = sg.x1; }
        rows.push(s.replace(/\s+$/, ''));
      });
      out.push('```\n' + rows.join('\n') + '\n```');
      continue;
    }
    // list items
    const isHeadish = L.bold && L.text.length <= 90;
    const mt = RE_TASK.exec(L.text), mb = RE_BULLET.exec(L.text), mo = !isHeadish && RE_ORDERED.exec(L.text);
    if (mt || mb || mo) {
      flush();
      const m = mt || mb || mo;
      let level = listXs.filter(x => x < L.x - 5).length;
      if (!listXs.some(x => Math.abs(x - L.x) <= 5)) listXs.push(L.x);
      level = Math.min(level, 5);
      const marker = mt ? '- [' + (/x|☑|☒/i.test(mt[1]) ? 'x' : ' ') + '] ' : mb ? '- ' : mo[1] + '. ';
      const rest = pdfDropChars(L.runs, pdfMarkerLen(L.runs, m[0]));
      list = { level, marker, lines: [Object.assign({}, L, { runs: rest })], x: L.x, last: L };
      continue;
    }
    if (list) {
      const dy = L.y - list.last.y;
      if (L.page === list.last.page && dy > 0 && dy <= L.fs * lead * 1.3 && L.x > list.x + 3 && Math.abs(L.fs - list.last.fs) < 0.6) { list.lines.push(L); list.last = L; continue; }
      flushList();
    }
    // paragraphs
    if (para && prev) {
      const A = para[para.length - 1];
      const box = pageBox.get(A.page) || { l: 0, r: 600 };
      const same = Math.abs(A.fs - L.fs) < 0.6;
      let cont;
      if (A.page === L.page) {
        const dy = L.y - A.y;
        cont = same && dy > 0 && dy <= L.fs * lead * 1.3
          && !(para.length > 1 && L.x - para[1].x > 0.8 * L.fs)
          && !(RE_END.test(A.text) && A.x1 < box.l + (box.r - box.l) * 0.72);
      } else cont = same && !RE_END.test(A.text) && A.x1 > box.l + (box.r - box.l) * 0.6;
      if (cont) { para.push(L); continue; }
    }
    flushPara();
    if (!list) endList();
    para = [L];
  }
  flush();

  const tableMd = t => ['| ' + t.head.join(' | ') + ' |', '| ' + t.align.join(' | ') + ' |'].concat(t.body.map(r => '| ' + r.join(' | ') + ' |')).join('\n');
  const md = out.map(b => (b.list ? b.rows.join('\n') : b.table ? tableMd(b) : b)).join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
  return { md, images, pages: numPages, scanned: shared.scanned, raster: shared.raster, chars: lines.reduce((a, L) => a + L.text.length, 0), columns: pages.some(p => p.columns) };
}
// length of the list marker inside the raw run text (which may have extra spaces the cleaned text does not)
function pdfMarkerLen(runs, marker) {
  const raw = runs.map(r => r.text).join('');
  const want = marker.replace(/\s+/g, '');
  let k = 0, seen = 0;
  while (k < raw.length && /\s/.test(raw[k])) k++;
  while (k < raw.length && seen < want.length) { if (!/\s/.test(raw[k])) seen++; k++; }
  while (k < raw.length && /\s/.test(raw[k])) k++;
  return k;
}
