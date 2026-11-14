/* =====================================================================
   Interface language (Spanish / English)
   t('key', a, b) fills {0}, {1}; a value written as [one, other] is picked by the first argument.
   ===================================================================== */
const STR = {
  es: {
    'page.letter': 'Carta', 'page.a4': 'A4', 'page.oficio': 'Oficio (México)', 'page.legal': 'Legal',
    'margin.estrecho': 'Estrechos', 'margin.moderado': 'Moderados', 'margin.normal': 'Normales',
    'lib.missing': 'Falta la librería {0}',
    'lib.failed': 'No se pudo cargar «{0}». Revisa tu conexión a internet.',
    'save.noHost': 'Esta vista no permite descargar archivos. Abre la app desde su archivo .html para descargar.',
    'save.saved': 'Guardado: {0}', 'save.declined': 'Descarga cancelada.',
    'save.pending': 'Ya hay una descarga pendiente de confirmar.',
    'save.tooLarge': 'El archivo es demasiado grande para esta vista. Prueba con menor resolución.',
    'save.failed': 'No se pudo guardar el archivo ({0}).', 'save.downloaded': 'Descargado: {0}',
    'img.missing': '[Imagen: {0}]', 'img.noName': 'sin nombre', 'img.alt': 'Imagen',
    'mermaid.error': 'Diagrama Mermaid con errores: {0}',
    'tab.close': 'Cerrar {0}', 'all.zip': 'Convertir los {0} documentos (ZIP)',
    'src.stats': '{0} líneas · {1} caracteres', 'src.fromPdf': 'Desde PDF',
    'dl.pdf': 'Descargar PDF', 'dl.docx': 'Descargar Word', 'dl.image': 'Descargar imagen', 'dl.md': 'Descargar Markdown',
    'zip.pages': 'paginas', 'zip.parts': 'partes', 'zip.docs': 'documentos',
    'break.tag': 'Pág. {0}', 'meta.margins': 'márgenes {0} cm',
    'n.pages': ['página', 'páginas'], 'n.words': ['palabra', 'palabras'], 'n.images': ['imagen', 'imágenes'],
    'n.docs': ['documento', 'documentos'], 'n.pdfs': ['PDF convertido a Markdown', 'PDF convertidos a Markdown'],
    'warn.missing': '<b>Faltan {0} imágenes:</b> {1}. Arrastra esas imágenes (o la carpeta del documento) a la ventana y se colocarán solas.',
    'warn.broken': '<b>Imágenes de internet que no se pudieron cargar:</b> {0}. Descárgalas y arrástralas aquí para incluirlas.',
    'warn.remote': '<b>Imágenes de internet sin permiso para copiarse:</b> {0}. Se ven en la vista previa, pero pueden faltar al exportar; descárgalas y arrástralas aquí para asegurarlas.',
    'render.failed': 'No se pudo procesar el documento: {0}',
    'pdf.reading': ['Leyendo el PDF…', 'Leyendo {0} archivos PDF…'], 'pdf.page': '{0} · página {1} de {2}',
    'pdf.note': '<b>Convertido desde {0}:</b> {1}. Revisa títulos, listas y tablas antes de descargar; puedes corregirlos aquí mismo.',
    'pdf.noText': '<b>Este PDF casi no tiene texto.</b> Parece escaneado: sus páginas son fotos y habría que pasarlo antes por un reconocimiento de texto (OCR).',
    'pdf.scanned': ['<b>{0} página es una imagen escaneada</b> y se incluyó como imagen, sin texto.', '<b>{0} páginas son imágenes escaneadas</b> y se incluyeron como imagen, sin texto.'],
    'pdf.columns': '<b>Se detectaron páginas a dos columnas</b> y se leyó primero la izquierda. Comprueba el orden del texto.',
    'pdf.password': 'el PDF está protegido con contraseña', 'pdf.unreadable': 'no se pudo leer como PDF',
    'pdf.imgDir': 'imagenes', 'pdf.imgAlt': 'Imagen {0}',
    'in.failed': 'No se pudo convertir {0}.', 'in.none': 'No encontré archivos .md, PDF ni imágenes en lo que soltaste.',
    'in.loaded': 'Cargado: {0}.', 'and': ' y ',
    'new.name': 'sin-titulo', 'new.body': '# Título\n\nEscribe aquí tu documento.\n', 'paste.name': 'pegado', 'sample.name': 'ejemplo.md',
    'p.pdfEngine': 'Preparando el motor de PDF…', 'p.drawing': 'Dibujando el documento…', 'p.page': 'Página {0} de {1}',
    'p.saving': 'Guardando…', 'p.composing': 'Componiendo la imagen…', 'p.part': 'Parte {0} de {1}',
    'p.blocks': 'Convirtiendo bloques…', 'p.packing': 'Empaquetando el .docx…', 'p.word': 'Preparando Word…',
    'p.zipping': 'Comprimiendo {0} archivos…', 'p.zip': 'Comprimiendo…', 'p.docOf': '{0} ({1} de {2})',
    'img.scaled': 'El documento es muy largo: la imagen se generó a {0}×.',
    'img.split': 'El documento es demasiado largo para una sola imagen; se dividió en {0} partes.',
    'ex.none': 'Primero abre o escribe un documento.', 'ex.making': 'Generando {0}…', 'ex.image': 'imagen',
    'ex.failed': 'No se pudo generar el archivo: {0}', 'ex.all': 'Convirtiendo {0} documentos…', 'ex.allFailed': 'No se pudo completar la conversión: {0}',
    'boot.failed': '<h2>No se pudieron cargar los componentes</h2><p>La página necesita conexión a internet la primera vez. Revisa la conexión y recarga.</p>'
  },
  en: {
    'page.letter': 'Letter', 'page.a4': 'A4', 'page.oficio': 'Oficio (Mexico)', 'page.legal': 'Legal',
    'margin.estrecho': 'Narrow', 'margin.moderado': 'Moderate', 'margin.normal': 'Normal',
    'lib.missing': 'Missing library {0}',
    'lib.failed': 'Could not load "{0}". Check your internet connection.',
    'save.noHost': 'This view cannot download files. Open the app from its .html file to download.',
    'save.saved': 'Saved: {0}', 'save.declined': 'Download cancelled.',
    'save.pending': 'A download is already waiting for confirmation.',
    'save.tooLarge': 'The file is too large for this view. Try a lower resolution.',
    'save.failed': 'Could not save the file ({0}).', 'save.downloaded': 'Downloaded: {0}',
    'img.missing': '[Image: {0}]', 'img.noName': 'unnamed', 'img.alt': 'Image',
    'mermaid.error': 'Mermaid diagram has errors: {0}',
    'tab.close': 'Close {0}', 'all.zip': 'Convert all {0} documents (ZIP)',
    'src.stats': '{0} lines · {1} characters', 'src.fromPdf': 'From PDF',
    'dl.pdf': 'Download PDF', 'dl.docx': 'Download Word', 'dl.image': 'Download image', 'dl.md': 'Download Markdown',
    'zip.pages': 'pages', 'zip.parts': 'parts', 'zip.docs': 'documents',
    'break.tag': 'Page {0}', 'meta.margins': 'margins {0} cm',
    'n.pages': ['page', 'pages'], 'n.words': ['word', 'words'], 'n.images': ['image', 'images'],
    'n.docs': ['document', 'documents'], 'n.pdfs': ['PDF converted to Markdown', 'PDFs converted to Markdown'],
    'warn.missing': '<b>{0} images are missing:</b> {1}. Drag those images (or the document\'s folder) into the window and they will be placed automatically.',
    'warn.broken': '<b>Web images that could not be loaded:</b> {0}. Download them and drag them here to include them.',
    'warn.remote': '<b>Web images that cannot be copied:</b> {0}. They show in the preview but may be missing from the export; download them and drag them here to be safe.',
    'render.failed': 'Could not process the document: {0}',
    'pdf.reading': ['Reading the PDF…', 'Reading {0} PDF files…'], 'pdf.page': '{0} · page {1} of {2}',
    'pdf.note': '<b>Converted from {0}:</b> {1}. Check headings, lists and tables before downloading; you can fix them right here.',
    'pdf.noText': '<b>This PDF has almost no text.</b> It looks scanned: its pages are pictures and it needs text recognition (OCR) first.',
    'pdf.scanned': ['<b>{0} page is a scanned picture</b> and was included as an image, without text.', '<b>{0} pages are scanned pictures</b> and were included as images, without text.'],
    'pdf.columns': '<b>Two-column pages were detected</b> and the left column was read first. Check the order of the text.',
    'pdf.password': 'the PDF is password-protected', 'pdf.unreadable': 'it could not be read as a PDF',
    'pdf.imgDir': 'images', 'pdf.imgAlt': 'Image {0}',
    'in.failed': 'Could not convert {0}.', 'in.none': 'No .md files, PDFs or images were found in what you dropped.',
    'in.loaded': 'Loaded: {0}.', 'and': ' and ',
    'new.name': 'untitled', 'new.body': '# Title\n\nWrite your document here.\n', 'paste.name': 'pasted', 'sample.name': 'example.md',
    'p.pdfEngine': 'Preparing the PDF engine…', 'p.drawing': 'Drawing the document…', 'p.page': 'Page {0} of {1}',
    'p.saving': 'Saving…', 'p.composing': 'Composing the image…', 'p.part': 'Part {0} of {1}',
    'p.blocks': 'Converting blocks…', 'p.packing': 'Packing the .docx…', 'p.word': 'Preparing Word…',
    'p.zipping': 'Compressing {0} files…', 'p.zip': 'Compressing…', 'p.docOf': '{0} ({1} of {2})',
    'img.scaled': 'The document is very long: the image was generated at {0}×.',
    'img.split': 'The document is too long for a single image; it was split into {0} parts.',
    'ex.none': 'Open or write a document first.', 'ex.making': 'Generating {0}…', 'ex.image': 'image',
    'ex.failed': 'Could not generate the file: {0}', 'ex.all': 'Converting {0} documents…', 'ex.allFailed': 'Could not finish the conversion: {0}',
    'boot.failed': '<h2>The components could not be loaded</h2><p>The page needs an internet connection the first time. Check the connection and reload.</p>'
  }
};
function lang() { return opts.lang === 'en' ? 'en' : 'es'; }
function t(key, ...a) {
  let s = STR[lang()][key];
  if (s == null) s = STR.es[key];
  if (Array.isArray(s)) s = s[Number(a[0]) === 1 ? 0 : 1];
  return String(s == null ? key : s).replace(/\{(\d)\}/g, (m, i) => (a[i] == null ? '' : a[i]));
}
const count = (n, key) => fmtNum(n) + ' ' + t(key, n);

/* Static page texts: [selector, what, English]. The Spanish originals are read from the page itself. */
const PAGE_EN = [
  ['.ui-brand-sub', 'text', 'Markdown to Word, PDF or image · PDF to Markdown or Word'],
  ['#btn-open', 'title', 'Open .md or .pdf files (and their images)'], ['#btn-open span', 'text', 'Open files'],
  ['#btn-folder', 'title', 'Open a folder with .md files and images'], ['#btn-folder span', 'text', 'Open folder'],
  ['#lang-group', 'aria', 'Language'],
  ['.ui-pane-source', 'aria', 'Markdown text'], ['#tabs', 'aria', 'Open documents'],
  ['#btn-new', 'title', 'Blank document'], ['#btn-new', 'aria', 'Blank document'],
  ['#editor', 'aria', 'Markdown text'], ['#editor', 'ph', 'Type or paste Markdown here, or drag in a .md file'],
  ['.ui-pane-preview', 'aria', 'Preview'], ['.ui-zoom', 'text', 'Zoom'], ['#zoom option[value="fit"]', 'text', 'Fit'],
  ['#empty h2', 'text', 'Drag a .md or .pdf file here'],
  ['#empty p', 'text', 'A PDF is converted to editable Markdown, ready to download as .md or Word. You can also drop a whole folder: the images the document links to are picked up automatically.'],
  ['#btn-sample', 'text', 'Load the example'],
  ['.ui-pane-export', 'aria', 'Export'], ['.ui-pane-export .ui-pane-head .ui-label', 'text', 'Export'],
  ['#lbl-format', 'text', 'Format'], ['#f-image + span', 'text', 'Image'],
  ['label[for="opt-theme"]', 'text', 'Document style'],
  ['#opt-theme option[value="github"]', 'text', 'GitHub (as seen on GitHub)'],
  ['#opt-theme option[value="clasico"]', 'text', 'Classic (serif, report style)'],
  ['#opt-theme option[value="moderno"]', 'text', 'Modern (corporate)'],
  ['label[for="opt-page"]', 'text', 'Page'], ['label[for="opt-margin"]', 'text', 'Margins'],
  ['#lbl-orient', 'text', 'Orientation'], ['#o-portrait + span', 'text', 'Portrait'], ['#o-landscape + span', 'text', 'Landscape'],
  ['#lbl-fs', 'text', 'Text size'],
  ['#lbl-pdfres', 'text', 'Resolution'], ['#pr-2 + span', 'text', 'Standard · 192 dpi'], ['#pr-3 + span', 'text', 'High · 288 dpi'],
  ['#opt-pdftext + span', 'text', 'Selectable text'], ['#opt-pdftext + span small', 'text', 'Lets you search and copy the text inside the PDF.'],
  ['#opt-pdfnum + span', 'text', 'Page numbers'],
  ['#opts-pdf .ui-hint', 'text', 'The dashed lines in the preview mark where each page begins.'],
  ['#opt-docxnum + span', 'text', 'Page numbers'],
  ['#opts-docx .ui-hint', 'text', 'Produces a native, editable Word file: headings with Word styles, lists, tables, colored code and Word equations.'],
  ['#lbl-mdimg', 'text', 'Document images'], ['#mi-zip + span', 'text', 'In a folder (ZIP)'], ['#mi-embed + span', 'text', 'Inside the .md'],
  ['#opts-md .ui-hint', 'text', 'Downloads the Markdown text exactly as it is in the editor. If it has images, they go in a folder next to the .md or embedded in the file itself.'],
  ['#lbl-imgtype', 'text', 'Type'], ['#lbl-imgres', 'text', 'Resolution'], ['#lbl-imgmode', 'text', 'Layout'],
  ['#im-single + span', 'text', 'One long image'], ['#im-pages + span', 'text', 'One per page'],
  ['label[for="opt-fm"]', 'text', 'Metadata (leading YAML block)'],
  ['#opt-fm option[value="hide"]', 'text', 'Hide'], ['#opt-fm option[value="table"]', 'text', 'Show as a table'],
  ['.ui-drop-box strong', 'text', 'Drop your files'],
  ['.ui-drop-box span', 'text', '.md or .pdf files, whole folders, or the images the document uses.']
];
let PAGE_ES = null;
function applyPageTexts() {
  const get = (el, what) => {
    if (what === 'title') return el.getAttribute('title');
    if (what === 'aria') return el.getAttribute('aria-label');
    if (what === 'ph') return el.getAttribute('placeholder');
    const n = Array.from(el.childNodes).find(c => c.nodeType === 3 && c.nodeValue.trim());
    return n ? n.nodeValue : el.textContent;
  };
  const set = (el, what, v) => {
    if (what === 'title') return el.setAttribute('title', v);
    if (what === 'aria') return el.setAttribute('aria-label', v);
    if (what === 'ph') return el.setAttribute('placeholder', v);
    const n = Array.from(el.childNodes).find(c => c.nodeType === 3 && c.nodeValue.trim());
    if (n) n.nodeValue = v; else el.textContent = v;
  };
  if (!PAGE_ES) PAGE_ES = PAGE_EN.map(([sel, what]) => { const el = document.querySelector(sel); return el ? get(el, what) : ''; });
  PAGE_EN.forEach(([sel, what, en], i) => { const el = document.querySelector(sel); if (el) set(el, what, lang() === 'en' ? en : PAGE_ES[i]); });
  document.documentElement.lang = lang();
}
