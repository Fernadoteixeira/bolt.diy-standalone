const webCrypto = globalThis.crypto;

const ALGO_MAP: Record<string, string> = {
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
};

export function createHash(algorithm: string) {
  const algo = ALGO_MAP[algorithm.toLowerCase()];

  if (!algo) {
    throw new Error(`Unsupported algorithm: ${algorithm}. Web Crypto API supports: sha1, sha256, sha384, sha512`);
  }

  const chunks: Uint8Array[] = [];

  return {
    update(data: Uint8Array | string) {
      if (typeof data === 'string') {
        chunks.push(new TextEncoder().encode(data));
      } else {
        chunks.push(data);
      }

      return this;
    },
    digest(encoding?: string) {
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      return webCrypto.subtle.digest(algo, combined).then((buf) => {
        const arr = new Uint8Array(buf);

        if (!encoding || encoding === 'hex') {
          return Array.from(arr)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        }

        return arr;
      });
    },
  };
}

export default { createHash };
