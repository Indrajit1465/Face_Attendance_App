import { cosineSimilarity } from '../utils/cosineSimilarity';
import { l2Normalize } from '../utils/normalizeEmbedding';
import { getAllEmployees } from '../database/employeeRepo';

// ✅ Raised from 0.72 → 0.82 (was inside different-person danger zone)
const SIMILARITY_THRESHOLD = 0.82;

// ✅ Raised from 0.05 → 0.10 (requires clear separation between top-2 candidates)
const MARGIN_THRESHOLD = 0.10;

const DEBUG_RECOGNITION = true;

type MatchResult = {
    name: string;
    id: string;
    score: number;   // ✅ expose score for caller's state machine
    margin: number;  // ✅ expose margin for logging/debugging
};

export const processMultiAttendance = async (
    embeddings: number[][]
): Promise<MatchResult[]> => {

    // ✅ Await DB call (was silently returning Promise object if async)
    const employees = await getAllEmployees();

    if (employees.length === 0 || embeddings.length === 0) return [];

    const matchedResults: MatchResult[] = [];

    for (let faceEmbedding of embeddings) {

        // ✅ Normalize live embedding ONCE here (not again inside cosineSimilarity)
        const normalizedLive = l2Normalize(faceEmbedding);
        if (!normalizedLive) {
            console.warn('[attendanceService] Bad live embedding — skipping frame');
            continue;
        }

        let bestScore = 0;
        let bestEmp: any = null;
        let secondScore = 0;

        for (const emp of employees) {
            // ✅ Support multiple stored embeddings per person (array of embeddings)
            // If emp.embedding is a flat number[], wrap it; if it's number[][], use directly
            const storedEmbeddings: number[][] = Array.isArray(emp.embedding[0])
                ? (emp.embedding as unknown as number[][])
                : [emp.embedding as number[]];

            // ✅ Take the MAX score across all stored embeddings for this person
            let empBestScore = 0;
            for (const storedEmb of storedEmbeddings) {
                const score = cosineSimilarity(normalizedLive, storedEmb);
                if (score !== null && score > empBestScore) {
                    empBestScore = score;
                }
            }

            // Update global best / second best
            if (empBestScore > bestScore) {
                secondScore = bestScore;
                bestScore = empBestScore;
                bestEmp = emp;
            } else if (empBestScore > secondScore) {
                secondScore = empBestScore;
            }
        }

        const margin = bestScore - secondScore;

        if (DEBUG_RECOGNITION) {
            console.log(`[BIOMETRIC DEBUG] Best candidate: ${bestEmp?.name ?? 'none'}`);
            console.log(` - Best Score:   ${bestScore.toFixed(4)}`);
            console.log(` - Second Best:  ${secondScore.toFixed(4)}`);
            console.log(` - Margin:       ${margin.toFixed(4)}`);
            console.log(` - Required:     score≥${SIMILARITY_THRESHOLD}, margin≥${MARGIN_THRESHOLD}`);

            if (bestScore >= SIMILARITY_THRESHOLD && margin >= MARGIN_THRESHOLD) {
                console.log(` => ✅ MATCH: ${bestEmp?.name}`);
            } else {
                const reason = bestScore < SIMILARITY_THRESHOLD
                    ? `score too low (${bestScore.toFixed(4)} < ${SIMILARITY_THRESHOLD})`
                    : `margin too small (${margin.toFixed(4)} < ${MARGIN_THRESHOLD})`;
                console.log(` => ❌ REJECTED: ${reason}`);
            }
        }

        // ✅ Both threshold AND margin must pass
        if (
            bestEmp !== null &&
            bestScore >= SIMILARITY_THRESHOLD &&
            margin >= MARGIN_THRESHOLD
        ) {
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