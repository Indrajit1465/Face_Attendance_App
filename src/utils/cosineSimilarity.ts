import { l2Normalize } from './normalizeEmbedding';

/**
 * Computes cosine similarity between two embedding vectors.
 * Both inputs should already be L2-normalized (unit vectors).
 * Returns null if either input is invalid.
 */
export const cosineSimilarity = (a: number[], b: number[]): number | null => {
    // Validate inputs
    if (!a || !b || a.length === 0 || b.length === 0) {
        console.warn('[cosineSimilarity] Empty vector received');
        return null;
    }

    if (a.length !== b.length) {
        console.warn(`[cosineSimilarity] Vector length mismatch: ${a.length} vs ${b.length}`);
        return null;
    }

    // Normalize defensively (handles case where caller forgot to normalize)
    const na = l2Normalize(a);
    const nb = l2Normalize(b);

    // ✅ Null check after normalization
    if (!na || !nb) {
        console.warn('[cosineSimilarity] Normalization failed for one or both vectors');
        return null;
    }

    // Dot product of unit vectors = cosine similarity
    let dot = 0;
    for (let i = 0; i < na.length; i++) {
        dot += na[i] * nb[i];
    }

    // Clamp to [-1, 1] to handle floating point drift
    return Math.max(-1, Math.min(1, dot));
};