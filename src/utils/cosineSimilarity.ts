import { l2Normalize } from './normalizeEmbedding';

/**
 * Computes cosine similarity between two embedding vectors.
 * @param preNormalized — if true, skip L2 re-normalization (caller guarantees unit vectors).
 *                        Use true in the hot-path (attendanceService) where embeddings
 *                        are already normalized by getEmbedding().
 */
export const cosineSimilarity = (
    a: number[],
    b: number[],
    preNormalized: boolean = false,
): number | null => {
    // Validate inputs
    if (!a || !b || a.length === 0 || b.length === 0) {
        console.warn('[cosineSimilarity] Empty vector received');
        return null;
    }

    if (a.length !== b.length) {
        console.warn(`[cosineSimilarity] Vector length mismatch: ${a.length} vs ${b.length}`);
        return null;
    }

    let va = a;
    let vb = b;

    if (!preNormalized) {
        // Normalize defensively (handles case where caller forgot to normalize)
        const na = l2Normalize(a);
        const nb = l2Normalize(b);
        if (!na || !nb) {
            console.warn('[cosineSimilarity] Normalization failed');
            return null;
        }
        va = na;
        vb = nb;
    }

    // Dot product of unit vectors = cosine similarity
    let dot = 0;
    for (let i = 0; i < va.length; i++) {
        dot += va[i] * vb[i];
    }

    // Clamp to [-1, 1] to handle floating point drift
    return Math.max(-1, Math.min(1, dot));
};