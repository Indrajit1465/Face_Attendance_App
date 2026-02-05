const normalize = (v: number[]) => {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map(x => x / norm);
};

export const cosineSimilarity = (a: number[], b: number[]) => {
    const na = normalize(a);
    const nb = normalize(b);

    let dot = 0;
    for (let i = 0; i < na.length; i++) {
        dot += na[i] * nb[i];
    }
    return dot;
};
