import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';

let db: QuickSQLiteConnection | null = null;

export const getDB = (): QuickSQLiteConnection => {
    if (!db) {
        db = open({
            name: 'attendance.db',
        });
    }
    return db;
};

export const initDB = (): QuickSQLiteConnection => {
    const database = getDB();

    // Employees table
    database.execute(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id TEXT UNIQUE,
      name TEXT,
      embedding TEXT
    );
  `);

    // Attendance table (SESSION-BASED)
    database.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id TEXT,
      name TEXT,
      check_in TEXT,
      check_out TEXT,
      duration INTEGER
    );
  `);

    return database;
};
