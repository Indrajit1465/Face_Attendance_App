import { cosineSimilarity } from '../utils/cosineSimilarity';
import { getAllEmployees } from '../database/employeeRepo';
import { markAttendance } from '../database/attendanceRepo';

const SIMILARITY_THRESHOLD = 0.72;
const MARGIN_THRESHOLD = 0.04;

export const processAttendance = (faceEmbedding: number[]) => {
    const employees = getAllEmployees();
    if (employees.length === 0) return [];

    let best = { emp: null as any, score: 0 };
    let second = { score: 0 };

    for (const emp of employees) {
        const score = cosineSimilarity(faceEmbedding, emp.embedding);
        if (score > best.score) {
            second = best;
            best = { emp, score };
        } else if (score > second.score) {
            second = { score };
        }
    }

    console.log(
        `[Attendance] Best: ${best.score.toFixed(3)}, Second: ${second.score.toFixed(3)}`
    );

    if (
        best.score < SIMILARITY_THRESHOLD ||
        best.score - second.score < MARGIN_THRESHOLD
    ) {
        console.warn('[Attendance] Face ambiguous, rejecting');
        return [];
    }

    const status = markAttendance(best.emp.emp_id, best.emp.name);
    return [{ name: best.emp.name, id: best.emp.emp_id, status }];
};
