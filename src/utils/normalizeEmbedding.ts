export const l2Normalize = (v: number[]): number[] => {
    // 1. Calculate the Euclidean norm (length vector)
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));

    // 2. Prevent division by zero mathematically
    if (norm === 0) return v;

    // 3. Return strictly unit-length length-1 vector
    return v.map(x => x / norm);
};
