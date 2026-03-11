import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import Logger from '../utils/Logger';

let db: QuickSQLiteConnection | null = null;

export const getDB = (): QuickSQLiteConnection => {
  if (!db) {
    db = open({ name: 'attendance.db' });
  }
  return db;
};

export const initDB = (): QuickSQLiteConnection => {
  const database = getDB();

  // ✅ Enable foreign key enforcement (SQLite disables it by default)
  database.execute(`PRAGMA foreign_keys = ON;`);

  // ✅ Enable WAL mode — faster writes, safer concurrent reads
  database.execute(`PRAGMA journal_mode = WAL;`);

  // ─────────────────────────────────────────
  // Employees table
  // ─────────────────────────────────────────
  database.execute(`
        CREATE TABLE IF NOT EXISTS employees (
            emp_id    TEXT PRIMARY KEY NOT NULL,  -- ✅ emp_id IS the PK, no redundant id
            name      TEXT            NOT NULL,   -- ✅ NOT NULL enforced
            embedding TEXT            NOT NULL    -- ✅ NOT NULL — prevents null template storage
        );
    `);

  // ✅ Index for fast name-based lookups (useful for admin/search screens)
  database.execute(`
        CREATE INDEX IF NOT EXISTS idx_employees_name
        ON employees (name);
    `);

  // In initDB(), add after attendance table:
  database.execute(`
    CREATE TABLE IF NOT EXISTS cluster_index (
        id       INTEGER PRIMARY KEY,
        data     TEXT    NOT NULL,
        built_at INTEGER NOT NULL
    );
`);

  // ─────────────────────────────────────────
  // Attendance table (session-based)
  // ─────────────────────────────────────────
  database.execute(`
        CREATE TABLE IF NOT EXISTS attendance (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_id    TEXT    NOT NULL,                          -- ✅ NOT NULL
            name      TEXT    NOT NULL,                          -- ✅ NOT NULL
            check_in  TEXT    NOT NULL,                          -- ✅ NOT NULL — always set on insert
            check_out TEXT,                                      -- nullable: NULL until checkout
            duration  INTEGER NOT NULL DEFAULT 0,                -- ✅ default 0, set on checkout

            -- ✅ Foreign key: attendance must reference a real employee
            FOREIGN KEY (emp_id) REFERENCES employees (emp_id)
                ON DELETE CASCADE                                -- ✅ clean up attendance if employee deleted
        );
    `);

  // ✅ Index for fast per-employee attendance lookups (used in markAttendance)
  database.execute(`
        CREATE INDEX IF NOT EXISTS idx_attendance_emp_id
        ON attendance (emp_id);
    `);

  // ✅ Index for date-range queries (used in Excel export)
  database.execute(`
        CREATE INDEX IF NOT EXISTS idx_attendance_check_in
        ON attendance (check_in);
    `);

  // ─────────────────────────────────────────
  // Admin config (PIN storage)
  // ─────────────────────────────────────────
  database.execute(`
        CREATE TABLE IF NOT EXISTS admin_config (
            key   TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
    `);

  // ─────────────────────────────────────────
  // ✅ M2 FIX: Model version migration
  // Add model_version column if it doesn't exist (safe for existing DBs)
  // ─────────────────────────────────────────
  try {
    database.execute(`ALTER TABLE employees ADD COLUMN model_version TEXT NOT NULL DEFAULT 'v1'`);
    Logger.debug('DB', 'Added model_version column to employees table');
  } catch {
    // Column already exists — ignore
  }

  // ✅ M2: Version consistency check
  try {
    const versionResult = database.execute(`SELECT DISTINCT model_version FROM employees`);
    if (versionResult.rows && versionResult.rows.length > 1) {
      Logger.warn('DB', '⚠️ Mixed embedding versions detected — recognition accuracy may be degraded. Re-register affected employees.');
    }
  } catch {
    // Table might be empty — ignore
  }

  Logger.info('DB', 'Schema initialized ✅');
  return database;
};

// ─────────────────────────────────────────
// Utility: close DB (call on app unmount if needed)
// ─────────────────────────────────────────
export const closeDB = (): void => {
  if (db) {
    db.close();
    db = null;
    Logger.debug('DB', 'Connection closed');
  }
};