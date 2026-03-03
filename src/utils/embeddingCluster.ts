import { l2Normalize } from './normalizeEmbedding';
import { cosineSimilarity } from './cosineSimilarity';

export type Centroid = {
    id: number;       // cluster index
    embedding: number[];     // mean of all members
    memberIds: string[];     // emp_id list in this cluster
};

export type ClusterIndex = {
    centroids: Centroid[];
    builtAt: number;       // timestamp
    empCount: number;
};

// ─────────────────────────────────────────────────────
// Optimal cluster count: K = √n (minimizes K + n/K)
// Min 1, Max 20 for typical attendance apps
// ─────────────────────────────────────────────────────
const optimalK = (n: number): number =>
    Math.min(20, Math.max(1, Math.round(Math.sqrt(n))));

// ─────────────────────────────────────────────────────
// K-Means Clustering
// ─────────────────────────────────────────────────────
export const buildClusterIndex = (
    employees: { emp_id: string; embedding: number[] }[]
): ClusterIndex => {

    const n = employees.length;

    if (n === 0) {
        return { centroids: [], builtAt: Date.now(), empCount: 0 };
    }

    // ✅ For small employee counts, single cluster is optimal
    if (n <= 10) {
        const allIds = employees.map(e => e.emp_id);
        const mean = computeMean(employees.map(e => e.embedding));
        return {
            centroids: [{ id: 0, embedding: mean!, memberIds: allIds }],
            builtAt: Date.now(),
            empCount: n,
        };
    }

    const K = optimalK(n);
    console.log(`[clusterIndex] Building K=${K} clusters for ${n} employees`);

    // ── Initialize centroids with K-Means++ seeding ──────────
    const centroids: number[][] = kMeansPlusPlusInit(
        employees.map(e => e.embedding), K
    );

    const MAX_ITER = 20;
    let assignments = new Array(n).fill(0);

    for (let iter = 0; iter < MAX_ITER; iter++) {
        // Assign each employee to nearest centroid
        const newAssignments = employees.map(emp => {
            let bestC = 0;
            let bestSim = -Infinity;
            for (let c = 0; c < K; c++) {
                const sim = dotProduct(emp.embedding, centroids[c]);
                if (sim > bestSim) { bestSim = sim; bestC = c; }
            }
            return bestC;
        });

        // Check convergence
        const changed = newAssignments.some((a, i) => a !== assignments[i]);
        assignments = newAssignments;
        if (!changed) {
            console.log(`[clusterIndex] Converged at iteration ${iter + 1}`);
            break;
        }

        // Recompute centroids as mean of their members
        for (let c = 0; c < K; c++) {
            const members = employees
                .filter((_, i) => assignments[i] === c)
                .map(e => e.embedding);

            if (members.length > 0) {
                const mean = computeMean(members);
                if (mean) centroids[c] = mean;
            }
        }
    }

    // ── Build final index ─────────────────────────────────────
    const result: Centroid[] = [];

    for (let c = 0; c < K; c++) {
        const memberIds = employees
            .filter((_, i) => assignments[i] === c)
            .map(e => e.emp_id);

        if (memberIds.length > 0) {
            result.push({
                id: c,
                embedding: centroids[c],
                memberIds,
            });
        }
    }

    console.log(`[clusterIndex] Built ${result.length} clusters:`);
    result.forEach(c =>
        console.log(`  Cluster ${c.id}: ${c.memberIds.length} members`)
    );

    return { centroids: result, builtAt: Date.now(), empCount: n };
};

// ─────────────────────────────────────────────────────
// Query: find top-N nearest clusters to a live embedding
// ─────────────────────────────────────────────────────
export const findNearestClusters = (
    index: ClusterIndex,
    embedding: number[],
    topN: number = 2  // ✅ search top 2 clusters for safety margin
): Centroid[] => {
    if (index.centroids.length === 0) return [];

    const scored = index.centroids.map(c => ({
        centroid: c,
        score: dotProduct(embedding, c.embedding),
    }));

    // Sort by similarity descending, take top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map(s => s.centroid);
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

const dotProduct = (a: number[], b: number[]): number => {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) dot += a[i] * b[i];
    return dot;
};

const computeMean = (embeddings: number[][]): number[] | null => {
    if (embeddings.length === 0) return null;
    const dim = embeddings[0].length;
    const sum = new Array(dim).fill(0);
    for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) sum[i] += emb[i];
    }
    const mean = sum.map(v => v / embeddings.length);
    return l2Normalize(mean) ?? mean;
};

// K-Means++ initialization — better than random, avoids cluster collapse
const kMeansPlusPlusInit = (
    embeddings: number[][], K: number
): number[][] => {
    const n = embeddings.length;
    const centroids: number[][] = [];

    // Pick first centroid randomly
    centroids.push([...embeddings[Math.floor(Math.random() * n)]]);

    for (let c = 1; c < K; c++) {
        // For each point, compute distance to nearest existing centroid
        const distances = embeddings.map(emb => {
            let minDist = Infinity;
            for (const centroid of centroids) {
                // Distance = 1 - cosine_similarity (since embeddings are normalized)
                const sim = dotProduct(emb, centroid);
                const dist = 1 - sim;
                if (dist < minDist) minDist = dist;
            }
            return minDist;
        });

        // Pick next centroid proportional to distance squared (D² sampling)
        const totalDist = distances.reduce((s, d) => s + d * d, 0);
        let rand = Math.random() * totalDist;

        let chosen = n - 1;
        for (let i = 0; i < n; i++) {
            rand -= distances[i] * distances[i];
            if (rand <= 0) { chosen = i; break; }
        }

        centroids.push([...embeddings[chosen]]);
    }

    return centroids;
};