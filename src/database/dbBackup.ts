import RNFS from 'react-native-fs';
import Logger from '../utils/Logger';

// ✅ I4 FIX: SQLite database backup utility
// Backup path: <DocumentDir>/backup/attendance_backup_<YYYY-MM-DD>.db
// Retrievable via: adb pull /sdcard/Android/data/<packageName>/files/backup/

const DB_NAME = 'attendance.db';
const BACKUP_DIR = `${RNFS.DocumentDirectoryPath}/backup`;

/**
 * Creates a daily backup of the SQLite database if one doesn't already exist for today.
 * Call on app startup and after bulk employee imports.
 */
export const backupDatabase = async (): Promise<void> => {
    try {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const backupFileName = `attendance_backup_${today}.db`;
        const backupPath = `${BACKUP_DIR}/${backupFileName}`;

        // Create backup directory if needed
        const dirExists = await RNFS.exists(BACKUP_DIR);
        if (!dirExists) {
            await RNFS.mkdir(BACKUP_DIR);
        }

        // Skip if today's backup already exists
        if (await RNFS.exists(backupPath)) {
            Logger.debug('dbBackup', `Today's backup already exists: ${backupFileName}`);
            return;
        }

        // Find the database file
        // react-native-quick-sqlite stores DBs in the app's databases directory
        const dbDir = `${RNFS.DocumentDirectoryPath}/../databases`;
        const dbPath = `${dbDir}/${DB_NAME}`;

        if (!(await RNFS.exists(dbPath))) {
            Logger.warn('dbBackup', `Database not found at: ${dbPath}`);
            return;
        }

        await RNFS.copyFile(dbPath, backupPath);
        Logger.info('dbBackup', `✅ Backup created: ${backupFileName}`);

        // Clean up old backups (keep last 7 days)
        await pruneOldBackups(7);

    } catch (err) {
        Logger.error('dbBackup', 'Backup failed:', err);
    }
};

/**
 * Removes backup files older than `keepDays` days.
 */
const pruneOldBackups = async (keepDays: number): Promise<void> => {
    try {
        const files = await RNFS.readDir(BACKUP_DIR);
        const now = Date.now();
        const cutoffMs = keepDays * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (!file.name.startsWith('attendance_backup_')) continue;
            const fileAge = now - new Date(file.mtime || 0).getTime();
            if (fileAge > cutoffMs) {
                await RNFS.unlink(file.path);
                Logger.debug('dbBackup', `Pruned old backup: ${file.name}`);
            }
        }
    } catch {
        // Ignore prune errors — not critical
    }
};
