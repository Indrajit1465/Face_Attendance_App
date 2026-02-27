import { l2Normalize } from './normalizeEmbedding';

export const cosineSimilarity = (a: number[], b: number[]) => {
    // 1. Defensively normalize both vectors exactly before mapping
    const na = l2Normalize(a);
    const nb = l2Normalize(b);

    // 2. Compute spatial distance
    let dot = 0;
    for (let i = 0; i < na.length; i++) {
        dot += na[i] * nb[i];
    }
    return dot;
};
