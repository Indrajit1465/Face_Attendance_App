import { cosineSimilarity } from '../utils/cosineSimilarity';
import { getAllEmployees } from '../database/employeeRepo';
import { markAttendance } from '../database/attendanceRepo';

const SIMILARITY_THRESHOLD = 0.75;

export const processAttendance = (faceEmbedding: number[]) => {
    // 🔒 Guard: embedding must be valid
    if (!faceEmbedding || faceEmbedding.length === 0) {
        console.warn('[Attendance] Invalid embedding');
        return [];
    }

    const employees = getAllEmployees();

    // 🔒 Guard: no registered employees
    if (employees.length === 0) {
        console.warn('[Attendance] No employees registered');
        return [];
    }

    let bestMatch: any = null;
    let bestScore = 0;

    // 1️⃣ Find best match
    for (const emp of employees) {
        const score = cosineSimilarity(faceEmbedding, emp.embedding);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = emp;
        }
    }

    console.log(
        `[Attendance] Best score: ${bestScore.toFixed(3)}`
    );

    // 2️⃣ Threshold check
    if (!bestMatch || bestScore < SIMILARITY_THRESHOLD) {
        console.warn('[Attendance] Face not recognized');
        return [];
    }

    // 3️⃣ Mark attendance
    markAttendance(bestMatch.emp_id, bestMatch.name);

    // 4️⃣ Return matched employee name
    return [bestMatch.name];
};
