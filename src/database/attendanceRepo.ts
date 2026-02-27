import { getDB } from './db';

// ─────────────────────────────────────────────────────
// Helper: local time ISO string (no UTC offset confusion)
// ─────────────────────────────────────────────────────

const toLocalISOString = (date: Date): string => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, -1);
    // Output: "2026-02-27T12:00:00.000" — local time, no Z suffix
};

// ─────────────────────────────────────────────────────
// Mark Attendance (check-in / check-out / ignored)
// ─────────────────────────────────────────────────────

export const markAttendance = async (
    empId: string,
    name: string
): Promise<'checkin' | 'checkout' | 'ignored' | 'error'> => {

    // ✅ Input validation — guards against FK violation & NOT NULL DB errors
    if (!empId || typeof empId !== 'string' || empId.trim() === '') {
        console.warn('[attendanceRepo] markAttendance called with empty empId');
        return 'error';
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
        console.warn('[attendanceRepo] markAttendance called with empty name');
        return 'error';
    }

    // ✅ Wrap in try/catch — DB errors must not crash the scan loop
    try {
        const db = getDB();
        const now = new Date();
        const nowStr = toLocalISOString(now); // ✅ Local time, not UTC

        // Look for an open session for this employee
        const result = db.execute(
            `SELECT * FROM attendance
             WHERE emp_id = ?
             AND check_out IS NULL
             ORDER BY id DESC
             LIMIT 1`,
            [empId]
        );

        const rows = result.rows ?? { length: 0, item: (_: number) => null };

        if (rows.length > 0) {
            // ✅ Null-guard on row before accessing properties
            const row = rows.item(0);
            if (!row || !row.check_in || row.id == null) {
                console.warn(`[attendanceRepo] Open session row is invalid for ${empId}`);
                return 'error';
            }

            const checkInTime = new Date(row.check_in);

            // Validate check_in was parseable
            if (isNaN(checkInTime.getTime())) {
                console.warn(`[attendanceRepo] Unparseable check_in for ${empId}: ${row.check_in}`);
                return 'error';
            }

            const diffMs = now.getTime() - checkInTime.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            // ✅ Too soon — ignore (prevents double-tap attendance)
            if (diffMins < 5) {
                console.log(`[attendanceRepo] Ignored: too soon (${diffMins}m < 5m) for ${name}`);
                return 'ignored';
            }

            // CLOSE session (check-out)
            const durationSeconds = Math.floor(diffMs / 1000);

            db.execute(
                `UPDATE attendance
                 SET check_out = ?, duration = ?
                 WHERE id = ?`,
                [nowStr, durationSeconds, row.id]
            );

            console.log(`[attendanceRepo] Check-OUT: ${name} | duration: ${durationSeconds}s`);
            return 'checkout';

        } else {
            // START new session (check-in)
            db.execute(
                `INSERT INTO attendance (emp_id, name, check_in, duration)
                 VALUES (?, ?, ?, 0)`,  // ✅ Explicit duration=0 on insert
                [empId, name, nowStr]
            );

            console.log(`[attendanceRepo] Check-IN: ${name} at ${nowStr}`);
            return 'checkin';
        }

    } catch (err) {
        // ✅ Catch DB errors — return 'error' instead of crashing scan loop
        console.error(`[attendanceRepo] markAttendance error for ${empId}:`, err);
        return 'error';
    }
};