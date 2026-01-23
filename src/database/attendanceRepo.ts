import { getDB } from './db';

export const markAttendance = (empId: string, name: string) => {
    const db = getDB();
    const now = new Date().toISOString();

    const result = db.execute(
        `SELECT * FROM attendance
     WHERE emp_id = ?
     AND check_out IS NULL
     ORDER BY id DESC
     LIMIT 1`,
        [empId]
    );

    // ✅ TypeScript-safe rows handling
    const rows = result.rows ?? { length: 0, item: (_: number) => null };

    if (rows.length > 0) {
        // CLOSE existing session
        const row = rows.item(0);

        const checkIn = new Date(row.check_in);
        const checkOut = new Date(now);

        // ✅ duration in SECONDS (correct)
        const duration = Math.floor(
            (checkOut.getTime() - checkIn.getTime()) / 1000
        );

        db.execute(
            `UPDATE attendance
       SET check_out = ?, duration = ?
       WHERE id = ?`,
            [now, duration, row.id]
        );

        return 'checkout';
    } else {
        // START new session
        db.execute(
            `INSERT INTO attendance (emp_id, name, check_in)
       VALUES (?, ?, ?)`,
            [empId, name, now]
        );

        return 'checkin';
    }
};
