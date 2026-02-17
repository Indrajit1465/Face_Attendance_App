import { getDB } from './db';
import RNFS from 'react-native-fs';
import XLSX from 'xlsx';

export const exportAttendanceCSV = async (): Promise<string | null> => {
    try {
        const db = getDB();
        const result = db.execute(`
            SELECT emp_id, name, check_in, check_out, duration
            FROM attendance
            ORDER BY check_in DESC
        `);

        const rows = result.rows ?? { length: 0, item: () => null };
        const data = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            const hours = row?.duration != null ? (row.duration / 3600).toFixed(2) : '';

            data.push({
                "Employee ID": row.emp_id,
                "Name": row.name,
                "Check-In": row.check_in,
                "Check-Out": row.check_out,
                "Duration (Hrs)": hours
            });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Attendance");

        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

        // Save to Downloads folder
        const path = `${RNFS.DownloadDirectoryPath}/Attendance_Report_${new Date().getTime()}.xlsx`;

        await RNFS.writeFile(path, wbout, 'base64');
        console.log('Excel saved to:', path);

        return path;
    } catch (err) {
        console.error('Excel Generation Error:', err);
        return null;
    }
};
