export const averageEmbedding = (embeddings: number[][]): number[] => {
    if (!embeddings || embeddings.length === 0) {
        throw new Error('No embeddings provided for averaging');
    }

    const length = embeddings[0].length;

    // Validate all embeddings
    for (const emb of embeddings) {
        if (!emb || emb.length !== length) {
            throw new Error('Inconsistent embedding dimensions');
        }
    }

    const avg = new Array<number>(length).fill(0);

    for (const emb of embeddings) {
        for (let i = 0; i < length; i++) {
            avg[i] += emb[i];
        }
    }

    for (let i = 0; i < length; i++) {
        avg[i] /= embeddings.length;

        // Safety clamp
        if (Number.isNaN(avg[i])) {
            avg[i] = 0;
        }
    }

    return avg;
};
