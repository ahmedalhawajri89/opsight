/**
 * An element of the page, saved as an A4 PDF file.
 *
 * DRAWN BY THE BROWSER, THEN PAGED. The element is rendered to an image by
 * the browser's own engine (html-to-image draws it through an SVG
 * foreignObject), so Arabic is joined and set right to left exactly as on
 * screen, and every colour the design tokens use is understood. A PDF
 * library writing the text itself would have to shape Arabic on its own,
 * and none does it reliably.
 *
 * NO ROW IS CUT IN HALF. Before slicing the image into pages, the bottom
 * edge of every row and block is measured, and each page ends at the last
 * of those edges that fits. An element marked `data-pdf-break` always
 * starts a new page.
 *
 * Page numbers are the only text jsPDF writes itself: its built-in font
 * has no Arabic, so anything in words stays in the drawn page.
 *
 * The cost of an image: the text in the file is not selectable. Print, the
 * other button, keeps it as text.
 *
 * Both libraries are loaded on the click, not with the page.
 */

const A4 = { width: 210, height: 297 };
const MARGIN = { x: 12, top: 12, bottom: 16 };
const BLOCKS =
  'tr, li, figure, header, footer, [data-pdf-block], section > div, section > p, section > h3';

export async function exportElementToPdf(element, { filename }) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);

  const origin = element.getBoundingClientRect();
  const widthPx = origin.width;
  const heightPx = element.scrollHeight;

  const offset = (node, edge) => node.getBoundingClientRect()[edge] - origin.top;
  // Never cut between a table's last row and its total: a total alone at the
  // top of a page is a number with nothing above it to add up.
  const lastRows = new Set(element.querySelectorAll('table:has(tfoot) tbody tr:last-child'));
  const edges = [...element.querySelectorAll(BLOCKS)]
    // Nor right after a heading, which would end a page on a title.
    .filter((node) => !lastRows.has(node) && !node.matches('.break-after-avoid'))
    // Two pixels past the edge: the drawn image sits a pixel or so lower than
    // the live layout, and a cut exactly on the edge carried a row's bottom
    // border over to the head of the next page.
    .map((node) => Math.min(offset(node, 'bottom') + 2, heightPx))
    .sort((a, b) => a - b);
  const breaks = [...element.querySelectorAll('[data-pdf-break]')]
    .map((node) => offset(node, 'top'))
    .sort((a, b) => a - b);

  const canvas = await toCanvas(element, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    width: widthPx,
    height: heightPx,
    cacheBust: true,
  });

  const contentWidth = A4.width - MARGIN.x * 2;
  const contentHeight = A4.height - MARGIN.top - MARGIN.bottom;
  const mmPerPx = contentWidth / widthPx;
  const pageHeightPx = contentHeight / mmPerPx;
  const scale = canvas.width / widthPx;

  // Where each page ends, in CSS pixels from the top of the element.
  const cuts = [];
  let start = 0;

  while (start < heightPx - 1) {
    const limit = start + pageHeightPx;
    const forced = breaks.find((y) => y > start + 1 && y <= limit);
    let end;

    if (limit >= heightPx) {
      end = heightPx;
    } else if (forced !== undefined) {
      end = forced;
    } else {
      const fitting = edges.filter((y) => y > start + 1 && y <= limit);
      end = fitting.length ? fitting[fitting.length - 1] : limit;

      // A block taller than half a page is cut rather than leaving the page half empty.
      if (end - start < pageHeightPx * 0.5) end = limit;
    }

    cuts.push([start, end]);
    start = end;
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

  cuts.forEach(([from, to], index) => {
    if (index > 0) pdf.addPage();

    // Both edges rounded the same way, so one page ends on the exact pixel
    // row the next begins: no line drawn twice, at the foot of one page and
    // again at the head of the next.
    const top = Math.round(from * scale);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.round(to * scale) - top;
    const context = slice.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);

    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.92),
      'JPEG',
      MARGIN.x,
      MARGIN.top,
      contentWidth,
      (to - from) * mmPerPx,
    );

    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`${index + 1} / ${cuts.length}`, A4.width / 2, A4.height - 8, { align: 'center' });
  });

  pdf.save(filename);
}
