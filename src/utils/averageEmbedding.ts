import { l2Normalize } from './normalizeEmbedding';

/**
 * Computes the mean of multiple L2-normalized embeddings,
 * then re-normalizes the result to unit length.
 *
 * Returns null if:
 * - Input is empty
 * - Any embedding has wrong dimensions or non-finite values
 * - The resulting average has a near-zero norm (degenerate case)
 */
export const averageEmbedding = (embeddings: number[][]): number[] | null => {

    // ✅ Return null instead of throwing — consistent with pipeline contract
    if (!embeddings || embeddings.length === 0) {
        console.warn('[averageEmbedding] No embeddings provided');
        return null;
    }

    const length = embeddings[0].length;

    if (length === 0) {
        console.warn('[averageEmbedding] Embeddings have zero length');
        return null;
    }

    // ✅ Validate every embedding BEFORE averaging — reject the whole batch if any is bad
    for (let e = 0; e < embeddings.length; e++) {
        const emb = embeddings[e];

        if (!emb || emb.length !== length) {
            console.warn(`[averageEmbedding] Embedding ${e} has wrong length: ${emb?.length} vs ${length}`);
            return null;
        }

        // ✅ Check for NaN/Infinity — reject entire average if any value is bad
        for (let i = 0; i < emb.length; i++) {
            if (!isFinite(emb[i])) {
                console.warn(`[averageEmbedding] Embedding ${e} has non-finite value at index ${i}: ${emb[i]}`);
                return null;  // ✅ Reject whole batch — don't silently patch with 0
            }
        }
    }

    // Compute element-wise mean
    const avg = new Array<number>(length).fill(0);

    for (const emb of embeddings) {
        for (let i = 0; i < length; i++) {
            avg[i] += emb[i];
        }
    }

    for (let i = 0; i < length; i++) {
        avg[i] /= embeddings.length;
    }

    // ✅ Re-normalize: average of unit vectors is NOT guaranteed to be unit length
    const normalized = l2Normalize(avg);

    if (!normalized) {
        console.warn('[averageEmbedding] L2 normalization of mean vector failed — degenerate average');
        return null;
    }

    console.log(`[averageEmbedding] Mean embedding computed from ${embeddings.length} frames, norm validated ✅`);
    return normalized;
};