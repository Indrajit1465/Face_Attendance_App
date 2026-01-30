export const averageEmbedding = (embeddings: number[][]): number[] => {
    const length = embeddings[0].length;
    const avg = new Array(length).fill(0);

    for (const emb of embeddings) {
        for (let i = 0; i < length; i++) {
            avg[i] += emb[i];
        }
    }

    for (let i = 0; i < length; i++) {
        avg[i] /= embeddings.length;
    }

    return avg;
};
