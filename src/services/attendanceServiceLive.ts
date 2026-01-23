import { cosineSimilarity } from '../utils/cosineSimilarity';
import { getAllEmployees } from '../database/employeeRepo';
import { markAttendance } from '../database/attendanceRepo';

const SIMILARITY_THRESHOLD = 0.65; // debug value

export const processAttendanceLive = (
    embedding: number[],
    lastSeenMap: Record<string, number>,
    cooldownMs: number
): string[] => {
    const employees = getAllEmployees();

    console.log('[LIVE][DB] Employees:', employees);

    if (!employees || employees.length === 0) {
        console.log('[LIVE][DB] ❌ No employees found in DB');
        return [];
    }

    let bestMatch: any = null;
    let bestScore = 0;

    for (const emp of employees) {
        const score = cosineSimilarity(embedding, emp.embedding);
        console.log(`[LIVE] Comparing with ${emp.name}, score=${score}`);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = emp;
        }
    }

    console.log('[LIVE] Best score:', bestScore);

    if (!bestMatch || bestScore < SIMILARITY_THRESHOLD) {
        console.log('[LIVE] ❌ Below threshold');
        return [];
    }

    const now = Date.now();
    const lastSeen = lastSeenMap[bestMatch.emp_id] || 0;

    if (now - lastSeen < cooldownMs) {
        console.log('[LIVE] ⏳ Cooldown active');
        return [];
    }

    console.log('[LIVE] ✅ Marking attendance for:', bestMatch.name);
    markAttendance(bestMatch.emp_id, bestMatch.name);

    lastSeenMap[bestMatch.emp_id] = now;
    return [bestMatch.name];
};
