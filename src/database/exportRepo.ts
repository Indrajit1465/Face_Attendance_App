import { getDB } from './db';
import RNFS from 'react-native-fs';
import XLSX from 'xlsx';
import { PermissionsAndroid, Platform } from 'react-native';

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

/**
 * Format ISO date string to readable local format
 * "2026-02-27T12:00:00.000" → "27/02/2026 12:00"
 */
const formatDateTime = (iso: string | null): string => {
    if (!iso) return '—';  // ✅ em dash instead of "null"
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso; // fallback to raw if unparseable

        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');

        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
        return iso;
    }
};

/**
 * Format duration in seconds to "Xh Ym" string
 * 5400 → "1h 30m"
 */
const formatDuration = (seconds: number | null): string => {
    if (seconds == null || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

/**
 * Request storage permission on Android < 13
 * Android 13+ uses scoped storage — no permission needed for app directory
 */
const requestStoragePermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    // Android 13+ (API 33+): WRITE_EXTERNAL_STORAGE deprecated — use app directory
    if (Platform.Version >= 33) return true;

    try {
        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
                title: 'Storage Permission Required',
                message: 'The app needs storage access to export the attendance report.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
        return false;
    }
};

// ─────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────

export const exportAttendanceCSV = async (): Promise<string | null> => {
    try {
        // ✅ Permission check before attempting write
        const hasPermission = await requestStoragePermission();
        if (!hasPermission) {
            console.warn('[exportRepo] Storage permission denied');
            throw new Error('PERMISSION_DENIED');
        }

        const db = getDB();
        const result = db.execute(`
            SELECT emp_id, name, check_in, check_out, duration
            FROM attendance
            ORDER BY check_in DESC
        `);

        const rows = result.rows ?? { length: 0, item: () => null };

        // ✅ Empty data guard — don't write a blank file
        if (rows.length === 0) {
            throw new Error('NO_DATA');
        }

        const data: object[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows.item(i);
            if (!row) continue;

            data.push({
                'Employee ID': row.emp_id ?? '—',
                'Name': row.name ?? '—',
                'Check-In': formatDateTime(row.check_in),      // ✅ readable date
                'Check-Out': formatDateTime(row.check_out),     // ✅ "—" not "null"
                'Duration': formatDuration(row.duration),      // ✅ "1h 30m" not "1.50"
            });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // ✅ Set column widths for readable Excel output
        ws['!cols'] = [
            { wch: 16 },  // Employee ID
            { wch: 24 },  // Name
            { wch: 20 },  // Check-In
            { wch: 20 },  // Check-Out
            { wch: 12 },  // Duration
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

        // ✅ Android 13+: use app-scoped external dir (no permission needed)
        //    Android < 13:  use Downloads (permission already granted above)
        const exportDir = (Platform.OS === 'android' && Platform.Version >= 33)
            ? RNFS.ExternalDirectoryPath    // app-scoped, always writable
            : RNFS.DownloadDirectoryPath;   // public Downloads

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')          // safe filename — no colons
            .slice(0, 19);                  // "2026-02-27T12-00-00"

        const path = `${exportDir}/Attendance_${timestamp}.xlsx`;

        await RNFS.writeFile(path, wbout, 'base64');
        console.log('[exportRepo] Excel saved to:', path);

        return path;

    } catch (err: any) {
        // ✅ Re-throw specific errors so HomeScreen can show targeted messages
        if (err?.message === 'PERMISSION_DENIED') throw err;
        if (err?.message === 'NO_DATA') throw err;

        console.error('[exportRepo] Excel generation error:', err);
        return null;
    }
};