import { getDB } from './db';

export const markAttendance = (empId: string, name: string) => {
    const db = getDB();
    const now = new Date();
    const nowStr = now.toISOString();

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
        // Existing open session
        const row = rows.item(0);
        const checkInTime = new Date(row.check_in);

        // Calculate difference in minutes
        const diffMs = now.getTime() - checkInTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 5) {
            console.log(`[Attendance] Ignored: Too soon (${diffMins}m < 5m)`);
            return 'ignored';
        }

        // CLOSE session (Exit)
        const durationSeconds = Math.floor(diffMs / 1000);

        db.execute(
            `UPDATE attendance
       SET check_out = ?, duration = ?
       WHERE id = ?`,
            [nowStr, durationSeconds, row.id]
        );

        return 'checkout';
    } else {
        // START new session (Entry)
        db.execute(
            `INSERT INTO attendance (emp_id, name, check_in)
       VALUES (?, ?, ?)`,
            [empId, name, nowStr]
        );

        return 'checkin';
    }
};
