import { cosineSimilarity } from '../utils/cosineSimilarity';
import { getAllEmployees } from '../database/employeeRepo';
import { markAttendance } from '../database/attendanceRepo';

export const processAttendance = (faceEmbedding: number[]) => {
    const employees = getAllEmployees();

    let bestMatch: any = null;
    let bestScore = 0;

    for (const emp of employees) {
        const score = cosineSimilarity(faceEmbedding, emp.embedding);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = emp;
        }
    }

    if (!bestMatch || bestScore < 0.75) {
        return []; // ❌ unknown face
    }

    // Mark attendance
    markAttendance(bestMatch.emp_id, bestMatch.name);

    // ✅ RETURN matched employee name
    return [bestMatch.name];
};
