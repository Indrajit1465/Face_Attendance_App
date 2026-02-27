const NORM_EPSILON = 1e-6; // Safe floor to prevent division by near-zero

export const l2Normalize = (v: number[]): number[] | null => {
    // 1. Guard: reject empty vectors
    if (!v || v.length === 0) {
        console.warn('[l2Normalize] Empty vector received');
        return null;
    }

    // 2. Guard: reject vectors containing NaN or Infinity (bad model output)
    if (v.some(x => !isFinite(x))) {
        console.warn('[l2Normalize] Vector contains NaN or Infinity — bad embedding');
        return null;
    }

    // 3. Calculate Euclidean norm
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));

    // 4. Reject near-zero norm (epsilon guard, not strict === 0)
    if (norm < NORM_EPSILON) {
        console.warn(`[l2Normalize] Near-zero norm (${norm}) — likely a blank/bad frame`);
        return null; // ← Return null, NOT the raw vector
    }

    // 5. Normalize to unit vector
    const normalized = v.map(x => x / norm);

    // 6. Sanity check: unit vector magnitude should be ~1.0
    const checkNorm = Math.sqrt(normalized.reduce((s, x) => s + x * x, 0));
    if (Math.abs(checkNorm - 1.0) > 0.01) {
        console.warn(`[l2Normalize] Output not unit-length (${checkNorm}) — numerical error`);
        return null;
    }

    return normalized;
};