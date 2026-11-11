/**
 * The small part of Markdown an answer may use: paragraphs, "- " and "1. "
 * lists, and **bold** (ADR-038).
 *
 * The first live answers came back with exactly these, and a screen that
 * printed them as typed showed asterisks around every key figure. They are
 * turned into React elements here, NEVER into HTML through innerHTML: an
 * answer quotes product and customer names, which are the business's own
 * data, and a name like `<img onerror=…>` must reach the screen as text.
 *
 * Anything else — headings, tables, links — is left as the characters it
 * is. The system prompt asks for nothing beyond this subset.
 */
export function AnswerText({ text }) {
  const blocks = toBlocks(String(text ?? ''));

  return (
    <div dir="auto" className="space-y-2 text-sm leading-relaxed text-(--color-text)">
      {blocks.map((block, i) => {
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type;

          return (
            <List
              key={i}
              className={`space-y-1 ps-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
            >
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </List>
          );
        }

        return <p key={i}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

const BULLET = /^\s*[-•*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/** Lines into paragraphs and lists; a blank line ends a paragraph. */
export function toBlocks(text) {
  const blocks = [];
  let paragraph = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);

    if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const last = blocks[blocks.length - 1];
      const item = (bullet ?? numbered)[1];

      if (last?.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line.trim());
    }
  }

  flush();

  return blocks;
}

/** **bold** into <strong>; everything else stays text. */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
