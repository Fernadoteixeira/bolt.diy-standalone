export const MEMORY_VECTOR_DIMENSIONS = 256;

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 512);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

export function createDeterministicEmbedding(input: string, dimensions = MEMORY_VECTOR_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(input);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const baseHash = fnv1a(token);
    const secondaryHash = fnv1a(`${token}:${token.length}`);
    const indexA = baseHash % dimensions;
    const indexB = secondaryHash % dimensions;
    const weight = Math.max(1, Math.min(token.length, 12));

    vector[indexA] += weight;
    vector[indexB] += weight * 0.5;
  }

  return normalize(vector);
}
