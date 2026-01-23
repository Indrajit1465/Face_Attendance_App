import { getDB } from './db';
import RNFS from 'react-native-fs';

export const exportAttendanceCSV = async (): Promise<string> => {
    const db = getDB();

    const result = db.execute(`
    SELECT emp_id, name, check_in, check_out, duration
    FROM attendance
    ORDER BY check_in DESC
  `);

    const rows = result.rows ?? { length: 0, item: () => null };

    let csv = 'Employee ID,Name,Check-In,Check-Out,Duration (hours)\n';

    for (let i = 0; i < rows.length; i++) {
        const row = rows.item(i);

        const hours =
            row?.duration != null
                ? (row.duration / 3600).toFixed(2)
                : '';

        csv += `${row.emp_id},${row.name ?? ''},${row.check_in ?? ''},${row.check_out ?? ''},${hours}\n`;
    }

    const path = `${RNFS.DocumentDirectoryPath}/attendance.csv`;

    await RNFS.writeFile(path, csv, 'utf8');

    // ✅ CRITICAL
    return path;
};
