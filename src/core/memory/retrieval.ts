const MULTI_LANG_SEGMENTER = new Intl.Segmenter(['en', 'zh'], { granularity: 'word' });

const BM25_K1 = 1.5;
const BM25_B = 0.75;

export interface BM25Result {
  text: string;
  originalIndex: number;
  score: number;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];

  for (const segment of MULTI_LANG_SEGMENTER.segment(text)) {
    if (segment.isWordLike) {
      const token = segment.segment.trim().toLowerCase();
      if (token.length > 0) {
        tokens.push(token);
      }
    }
  }

  return tokens;
}

export class BM25 {
  readonly #docs: string[];
  readonly #docTokens: string[][];
  readonly #docLengths: number[];
  readonly #termFrequencies: Map<string, number>[];
  readonly #idf: Map<string, number>;
  readonly #avgDocLength: number;

  constructor(docs: string[]) {
    this.#docs = docs;
    this.#docTokens = docs.map((doc) => tokenize(doc));
    this.#docLengths = this.#docTokens.map((tokens) => tokens.length);
    this.#termFrequencies = this.#docTokens.map((tokens) => {
      const termFrequency = new Map<string, number>();
      for (const token of tokens) {
        termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      }
      return termFrequency;
    });

    const totalLength = this.#docLengths.reduce((sum, length) => sum + length, 0);
    this.#avgDocLength = docs.length > 0 ? totalLength / docs.length : 0;

    const documentFrequency = new Map<string, number>();
    for (const termFrequency of this.#termFrequencies) {
      for (const token of termFrequency.keys()) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
    }

    this.#idf = new Map<string, number>();
    const docCount = docs.length;
    for (const [token, df] of documentFrequency) {
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
      this.#idf.set(token, idf);
    }
  }

  search(query: string, topK: number): BM25Result[] {
    if (this.#docs.length === 0 || topK <= 0) {
      return [];
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const queryTermFrequency = new Map<string, number>();
    for (const token of queryTokens) {
      queryTermFrequency.set(token, (queryTermFrequency.get(token) ?? 0) + 1);
    }

    const scoredDocs: BM25Result[] = this.#docs.map((text, originalIndex) => {
      const termFrequency = this.#termFrequencies[originalIndex] ?? new Map<string, number>();
      const docLength = this.#docLengths[originalIndex] ?? 0;
      const lengthNormBase =
        this.#avgDocLength > 0 ? 1 - BM25_B + BM25_B * (docLength / this.#avgDocLength) : 1;
      let score = 0;

      for (const [token, qtf] of queryTermFrequency) {
        const tf = termFrequency.get(token) ?? 0;
        if (tf === 0) {
          continue;
        }

        const idf = this.#idf.get(token) ?? 0;
        const numerator = tf * (BM25_K1 + 1);
        const denominator = tf + BM25_K1 * lengthNormBase;
        score += idf * (numerator / denominator) * qtf;
      }

      return { text, originalIndex, score };
    });

    return scoredDocs.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

function splitOversizedChunk(chunk: string, maxChunkSize: number): string[] {
  if (chunk.length <= maxChunkSize) {
    return [chunk];
  }

  const parts: string[] = [];
  let start = 0;

  while (start < chunk.length) {
    const end = Math.min(start + maxChunkSize, chunk.length);
    const piece = chunk.slice(start, end).trim();
    if (piece.length > 0) {
      parts.push(piece);
    }
    start = end;
  }

  return parts;
}

export function chunkMarkdown(text: string, maxChunkSize = 800): string[] {
  if (text.trim().length === 0) {
    return [];
  }

  const safeMaxChunkSize = Math.max(1, maxChunkSize);
  const rawSegments = text
    .split('\n\n')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (rawSegments.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = '';

  for (const segment of rawSegments) {
    const segmentParts = splitOversizedChunk(segment, safeMaxChunkSize);

    for (const part of segmentParts) {
      if (current.length === 0) {
        current = part;
        continue;
      }

      const candidate = `${current}\n\n${part}`;
      if (candidate.length <= safeMaxChunkSize) {
        current = candidate;
      } else {
        chunks.push(current);
        current = part;
      }
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function retrieveTopK(text: string, query: string, topK = 3): string {
  const chunks = chunkMarkdown(text);
  if (chunks.length === 0 || topK <= 0) {
    return '';
  }

  const bm25 = new BM25(chunks);
  const ranked = bm25.search(query, topK);
  if (ranked.length === 0) {
    return '';
  }

  const orderedByOriginalIndex = ranked.sort((a, b) => a.originalIndex - b.originalIndex);
  const separator = '\n\n... [Memory truncated: only the fragments most relevant to the current task are kept] ...\n\n';

  return orderedByOriginalIndex.map((item) => item.text).join(separator);
}
