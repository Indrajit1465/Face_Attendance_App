import { cosineSimilarity } from '../utils/cosineSimilarity';
import { l2Normalize } from '../utils/normalizeEmbedding';
import { getAllEmployees, Employee } from '../database/employeeRepo';
import {
    buildClusterIndex,
    findNearestClusters,
    ClusterIndex
} from '../utils/embeddingCluster';
import { saveClusterIndex, loadClusterIndex } from '../database/clusterRepo';

// ─── REPLACE the constants block at the top: ───────────────

const SIMILARITY_THRESHOLD = 0.75;   // ✅ was 0.78 — catches valid matches being missed
const EARLY_EXIT_THRESHOLD = 0.95;   // unchanged
const DEBUG_RECOGNITION = true;   // unchanged
const CACHE_TTL_MS = 30000;  // unchanged

// ✅ NEW — replaces fixed MARGIN_THRESHOLD = 0.10
const getDynamicMargin = (employeeCount: number): number => {
    if (employeeCount <= 10) return 0.03;  // 5 employees → margin 0.03 (your case)
    if (employeeCount <= 30) return 0.05;
    if (employeeCount <= 100) return 0.07;
    return 0.10;                            // 100+ employees → original strict margin
};
// ─────────────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────────────
let employeeCache: Employee[] | null = null;
let clusterIndex: ClusterIndex | null = null;
let employeeMap: Map<string, Employee> = new Map();
let cacheLoadedAt: number = 0;

export const invalidateEmployeeCache = (): void => {
    employeeCache = null;
    clusterIndex = null;
    employeeMap.clear();
    cacheLoadedAt = 0;
    console.log('[attendanceService] Cache + cluster index invalidated');
};

// ─────────────────────────────────────────────────────
// Load employees + build cluster index
// ─────────────────────────────────────────────────────
const initializeIndex = async (): Promise<void> => {
    const now = Date.now();
    if (employeeCache && clusterIndex && (now - cacheLoadedAt) < CACHE_TTL_MS) return;

    try {
        console.log('[attendanceService] Building search index...');
        const t0 = Date.now();

        const employees = await getAllEmployees();
        employeeCache = employees;

        // 🔎 DEBUG: Show DB embedding sample
        console.log(`[MATCH DEBUG] Employee embeddings sample:`);
        if (employees.length > 0) {
            const sample = employees[0];
            const emb = Array.isArray(sample.embedding[0])
                ? (sample.embedding as unknown as number[][])[0]
                : sample.embedding as number[];
            const norm = Math.sqrt(emb.reduce((s: number, x: number) => s + x * x, 0));
            console.log(`  ${sample.name}: embLen=${emb.length} norm=${norm.toFixed(4)}`);
        }

        employeeMap.clear();
        for (const emp of employees) {
            employeeMap.set(emp.emp_id, emp);
        }

        if (employees.length === 0) {
            clusterIndex = { centroids: [], builtAt: now, empCount: 0 };
            cacheLoadedAt = now;
            return;
        }

        const saved = loadClusterIndex();
        if (
            saved &&
            saved.empCount === employees.length &&
            (now - saved.builtAt) < 5 * 60 * 1000
        ) {
            clusterIndex = saved;
            cacheLoadedAt = now;
            console.log(`[attendanceService] Reused saved cluster index in ${Date.now() - t0}ms`);
            return;
        }

        const index = buildClusterIndex(
            employees.map(e => ({
                emp_id: e.emp_id,
                embedding: Array.isArray(e.embedding[0])
                    ? (e.embedding as unknown as number[][])[0]
                    : e.embedding as number[],
            }))
        );

        clusterIndex = index;
        cacheLoadedAt = now;

        saveClusterIndex(index);

        console.log(`[attendanceService] Index built in ${Date.now() - t0}ms`
            + ` (${employees.length} employees, ${index.centroids.length} clusters)`);

    } catch (err) {
        console.error('[attendanceService] Index build failed:', err);
        employeeCache = employeeCache ?? [];
        clusterIndex = clusterIndex ?? { centroids: [], builtAt: 0, empCount: 0 };
    }
};

// ─────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────
export type MatchResult = {
    name: string;
    id: string;
    score: number;
    margin: number;
};

export const processMultiAttendance = async (
    embeddings: number[][]
): Promise<MatchResult[]> => {

    await initializeIndex();

    if (!employeeCache || employeeCache.length === 0 || embeddings.length === 0) {
        return [];
    }

    // ✅ Dynamic margin based on actual employee count
    const effectiveMargin = getDynamicMargin(employeeCache.length);
    console.log(`[MATCH DEBUG] Using margin=${effectiveMargin} for ${employeeCache.length} employees`);

    const matchedResults: MatchResult[] = [];

    for (let faceEmbedding of embeddings) {
        const normalizedLive = l2Normalize(faceEmbedding);
        if (!normalizedLive) continue;

        let bestScore = 0;
        let bestEmp: Employee | null = null;
        let secondScore = 0;

        const t0 = Date.now();

        if (clusterIndex && clusterIndex.centroids.length > 1) {
            const nearestClusters = findNearestClusters(clusterIndex, normalizedLive, 2);
            const candidateIds = new Set<string>();
            for (const cluster of nearestClusters) {
                for (const id of cluster.memberIds) candidateIds.add(id);
            }

            console.log(`[attendanceService] Checking ${candidateIds.size}/${employeeCache.length} candidates`);

            for (const empId of candidateIds) {
                const emp = employeeMap.get(empId);
                if (!emp) continue;

                const storedEmbeddings: number[][] = Array.isArray(emp.embedding[0])
                    ? (emp.embedding as unknown as number[][])
                    : [emp.embedding as number[]];

                let empBestScore = 0;
                for (const storedEmb of storedEmbeddings) {
                    const score = cosineSimilarity(normalizedLive, storedEmb);
                    if (score !== null && score > empBestScore) empBestScore = score;
                }

                if (empBestScore > bestScore) {
                    secondScore = bestScore;
                    bestScore = empBestScore;
                    bestEmp = emp;
                } else if (empBestScore > secondScore) {
                    secondScore = empBestScore;
                }

                if (bestScore >= EARLY_EXIT_THRESHOLD &&
                    bestScore - secondScore >= effectiveMargin) break;
            }

        } else {
            for (const emp of employeeCache) {
                const storedEmbeddings: number[][] = Array.isArray(emp.embedding[0])
                    ? (emp.embedding as unknown as number[][])
                    : [emp.embedding as number[]];

                let empBestScore = 0;
                for (const storedEmb of storedEmbeddings) {
                    const score = cosineSimilarity(normalizedLive, storedEmb);
                    if (score !== null && score > empBestScore) empBestScore = score;
                }

                if (empBestScore > bestScore) {
                    secondScore = bestScore;
                    bestScore = empBestScore;
                    bestEmp = emp;
                } else if (empBestScore > secondScore) {
                    secondScore = empBestScore;
                }

                if (bestScore >= EARLY_EXIT_THRESHOLD &&
                    bestScore - secondScore >= effectiveMargin) break;
            }
        }

        const margin = bestScore - secondScore;
        const searchMs = Date.now() - t0;

        console.log(`[MATCH DEBUG] ── Frame scan ──`);
        console.log(`[MATCH DEBUG] Employees in cache: ${employeeCache?.length ?? 0}`);
        console.log(`[MATCH DEBUG] Live norm: ${normalizedLive
            ? Math.sqrt(normalizedLive.reduce((s, x) => s + x * x, 0)).toFixed(4)
            : 'NULL'
            }`);
        console.log(`[MATCH DEBUG] Best score: ${bestScore.toFixed(4)} vs ${SIMILARITY_THRESHOLD}`);
        console.log(`[MATCH DEBUG] Margin: ${margin.toFixed(4)} vs ${effectiveMargin} (dynamic)`);
        console.log(`[MATCH DEBUG] Best candidate: ${bestEmp?.name ?? 'NONE'}`);
        console.log(`[BIOMETRIC DEBUG] Best: ${bestEmp?.name ?? 'none'}`
            + ` score=${bestScore.toFixed(4)}`
            + ` margin=${margin.toFixed(4)}`
            + ` searchTime=${searchMs}ms`);

        // ✅ Use effectiveMargin not hardcoded MARGIN_THRESHOLD
        if (bestEmp &&
            bestScore >= SIMILARITY_THRESHOLD &&
            margin >= effectiveMargin) {

            matchedResults.push({
                name: bestEmp.name,
                id: bestEmp.emp_id,
                score: bestScore,
                margin: margin,
            });
        }
    }

    return matchedResults;
};