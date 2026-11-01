// ─────────────────────────────────────────────────────────────────────────────
// CHUNKING — splitting documents into retrievable pieces.
//
// Why chunk at all? Embedding a whole document blurs every idea into one
// vector; you can't retrieve "the paragraph about overlap" from a 10-page
// blob. Chunks are the unit of both indexing and retrieval, so their shape
// decides RAG quality more than almost anything else.
//
// The strategy here (a sensible default used by most production systems):
//   1. Split on BLANK LINES first — paragraphs are natural semantic units.
//   2. Pack paragraphs greedily into chunks up to a max token budget.
//   3. Hard-split any monster paragraph by sentences (works for CJK too).
//   4. Overlap consecutive chunks by a few sentences' worth of tokens, so an
//      answer that straddles a boundary still has its context in one chunk.
//
// Tokens are ESTIMATED as characters ÷ 4 (roughly right for English prose).
// A real tokenizer (js-tiktoken) would be exact — deliberately left as an
// exercise, see README "Things to try".
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '@/lib/config';

export interface Chunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

// ~4 characters per token is the usual rule of thumb for English; CJK is
// closer to 1-2 chars/token, so Chinese documents will chunk smaller. Fine
// for learning purposes — the direction of the error is safe (smaller chunks).
const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number =>
  Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));

export function chunkText(
  text: string,
  options: { maxTokens?: number; overlapTokens?: number } = {},
): Chunk[] {
  const maxTokens = options.maxTokens ?? config.chunkMaxTokens;
  const overlapTokens = options.overlapTokens ?? config.chunkOverlapTokens;
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Step 1+3: break into paragraph-sized units, splitting oversized ones by
  // sentence. The lookbehind regex keeps the punctuation attached.
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      units.push(para);
      continue;
    }
    let current = '';
    for (const sentence of para.split(/(?<=[.!?。！？])\s+/)) {
      if (current && current.length + sentence.length + 1 > maxChars) {
        units.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
      // Pathological guard: a "sentence" longer than maxChars (minified text,
      // a wall of URLs) gets chopped hard rather than looping forever.
      while (current.length > maxChars) {
        units.push(current.slice(0, maxChars));
        current = current.slice(maxChars);
      }
    }
    if (current.trim()) units.push(current.trim());
  }

  // Step 2: greedy-pack units into chunks under the token budget.
  const packed: string[] = [];
  let current = '';
  for (const unit of units) {
    if (!current) {
      current = unit;
    } else if (current.length + unit.length + 2 <= maxChars) {
      current += '\n\n' + unit;
    } else {
      packed.push(current);
      current = unit;
    }
  }
  if (current) packed.push(current);

  // Step 4: prepend the tail of the previous chunk (at a word boundary) so
  // context flows across boundaries. Note this means a chunk's TOTAL size can
  // exceed the budget by up to `overlapTokens` — the overlap rides on top.
  return packed.map((content, i) => {
    if (i === 0 || overlapChars === 0) return content;
    const tail = packed[i - 1].slice(-overlapChars);
    const firstSpace = tail.indexOf(' ');
    const cleanTail = firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
    return `${cleanTail}\n\n${content}`;
  }).map((content, index) => ({
    index,
    content,
    tokenEstimate: estimateTokens(content),
  }));
}
