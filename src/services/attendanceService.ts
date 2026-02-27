import { cosineSimilarity } from '../utils/cosineSimilarity';
import { l2Normalize } from '../utils/normalizeEmbedding';
import { getAllEmployees } from '../database/employeeRepo';

const SIMILARITY_THRESHOLD = 0.72;
const MARGIN_THRESHOLD = 0.05; // Strict Phase 14 limit
const DEBUG_RECOGNITION = true; // Phase 13.5: Production debugging

export const processMultiAttendance = (embeddings: number[][]) => {
    const employees = getAllEmployees();
    if (employees.length === 0 || embeddings.length === 0) return [];

    const matchedResults: Array<{ name: string; id: string }> = [];

    for (let faceEmbedding of embeddings) {
        // Phase 13.2: Defensively normalize the incoming live embedding
        faceEmbedding = l2Normalize(faceEmbedding);

        let best = { emp: null as any, score: 0 };
        let second = { score: 0 };

        for (const emp of employees) {
            // Note: DB embeddings are normalized during Registration before saving,
            // and cosineSimilarity also applies defensive normalization internally.
            const score = cosineSimilarity(faceEmbedding, emp.embedding);

            if (score > best.score) {
                second = { ...best };
                best = { emp, score };
            } else if (score > second.score) {
                second = { score };
            }
        }

        const margin = best.score - second.score;

        if (DEBUG_RECOGNITION && best.emp) {
            console.log(`[BIOMETRIC DEBUG] Target: ${best.emp.name}`);
            console.log(` - Best Score:    ${best.score.toFixed(4)}`);
            console.log(` - Second Best:   ${second.score.toFixed(4)}`);
            console.log(` - Margin :       ${margin.toFixed(4)}`);
            console.log(` - Threshold Required: ${SIMILARITY_THRESHOLD}, Margin Required: ${MARGIN_THRESHOLD}`);

            if (best.score >= SIMILARITY_THRESHOLD && margin >= MARGIN_THRESHOLD) {
                console.log(` => Result: SUCCESSFUL MATCH`);
            } else {
                console.log(` => Result: ABORTED (Unsafe distance or margin)`);
            }
        }

        // Validate if the best match is strong enough and distinct from the second best
        if (
            best.score >= SIMILARITY_THRESHOLD &&
            margin >= MARGIN_THRESHOLD
        ) {
            // Phase 12.4: Pure Recognition
            // Just return the recognized identity. Let CameraScreen handle the state and DB.
            matchedResults.push({ name: best.emp.name, id: best.emp.emp_id });
        }
    }

    return matchedResults;
};