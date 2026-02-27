import { getDB } from './db';

// ✅ Must match EMBEDDING_SIZE in FaceRecognitionModule.java
// Check logcat on app startup: "Model output shape: [1, 128]" or "[1, 192]"
const EXPECTED_EMBEDDING_SIZE = 192;

export type Employee = {
    emp_id: string;
    name: string;
    embedding: number[];
};

// ─────────────────────────────────────────────────────
// Validation Helper
// ─────────────────────────────────────────────────────

/**
 * Validates that a parsed embedding is:
 * - A non-empty number array
 * - Correct length
 * - All values are finite (no NaN, Infinity)
 * - Has non-zero norm (not a blank/bad frame)
 */
const validateEmbedding = (embedding: any, context: string): boolean => {
    if (!Array.isArray(embedding)) {
        console.warn(`[employeeRepo] ${context}: embedding is not an array`);
        return false;
    }

    if (embedding.length !== EXPECTED_EMBEDDING_SIZE) {
        console.warn(
            `[employeeRepo] ${context}: wrong embedding length ` +
            `(got ${embedding.length}, expected ${EXPECTED_EMBEDDING_SIZE})`
        );
        return false;
    }

    for (let i = 0; i < embedding.length; i++) {
        if (typeof embedding[i] !== 'number' || !isFinite(embedding[i])) {
            console.warn(
                `[employeeRepo] ${context}: non-finite value at index ${i}: ${embedding[i]}`
            );
            return false;
        }
    }

    // Check norm is non-zero (not a blank embedding)
    const norm = Math.sqrt(embedding.reduce((s: number, x: number) => s + x * x, 0));
    if (norm < 1e-6) {
        console.warn(`[employeeRepo] ${context}: near-zero norm embedding (${norm})`);
        return false;
    }

    return true;
};

// ─────────────────────────────────────────────────────
// Insert Employee
// ─────────────────────────────────────────────────────

export const insertEmployee = (
    empId: string,
    name: string,
    embedding: number[]
): void => {
    // ✅ Validate embedding BEFORE storing — prevent poisoned templates
    if (!validateEmbedding(embedding, `insertEmployee(${name})`)) {
        throw new Error('INVALID_EMBEDDING');
    }

    const db = getDB();

    const result = db.execute(
        `SELECT emp_id FROM employees WHERE emp_id = ?`,
        [empId]
    );

    const rows = result.rows ?? { length: 0, item: () => null };
    if (rows.length > 0) {
        throw new Error('EMPLOYEE_EXISTS');
    }

    db.execute(
        `INSERT INTO employees (emp_id, name, embedding) VALUES (?, ?, ?)`,
        [empId, name, JSON.stringify(embedding)]
    );

    console.log(`[employeeRepo] Registered employee: ${name} (${empId}), embedding size: ${embedding.length}`);
};

// ─────────────────────────────────────────────────────
// Get All Employees
// ─────────────────────────────────────────────────────

export const getAllEmployees = async (): Promise<Employee[]> => {
    // ✅ async — consistent with attendanceService.ts await call
    const db = getDB();
    const result = db.execute(`SELECT * FROM employees`);

    const employees: Employee[] = [];

    if (!result.rows) {
        return employees;
    }

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);

        // ✅ Guard: skip rows with missing data
        if (!row || !row.emp_id || !row.name || !row.embedding) {
            console.warn(`[employeeRepo] Skipping row ${i}: missing required fields`);
            continue;
        }

        // ✅ Guard: safe JSON parse
        let parsed: any;
        try {
            parsed = JSON.parse(row.embedding);
        } catch (e) {
            console.warn(`[employeeRepo] Failed to parse embedding for ${row.name}: ${e}`);
            continue; // ✅ Skip corrupted row — don't crash the whole list
        }

        // ✅ Guard: validate parsed embedding before using it
        if (!validateEmbedding(parsed, `getAllEmployees → ${row.name}`)) {
            console.warn(`[employeeRepo] Skipping ${row.name}: invalid embedding in DB`);
            continue;
        }

        employees.push({
            emp_id: row.emp_id,
            name: row.name,
            embedding: parsed as number[],
        });
    }

    console.log(`[employeeRepo] Loaded ${employees.length} valid employees from DB`);
    return employees;
};

// ─────────────────────────────────────────────────────
// Delete Employee (utility)
// ─────────────────────────────────────────────────────

export const deleteEmployee = (empId: string): void => {
    const db = getDB();
    db.execute(`DELETE FROM employees WHERE emp_id = ?`, [empId]);
    console.log(`[employeeRepo] Deleted employee: ${empId}`);
};

// ─────────────────────────────────────────────────────
// Get Single Employee (utility — useful for debug)
// ─────────────────────────────────────────────────────

export const getEmployeeById = (empId: string): Employee | null => {
    const db = getDB();
    const result = db.execute(
        `SELECT * FROM employees WHERE emp_id = ?`,
        [empId]
    );

    if (!result.rows || result.rows.length === 0) return null;

    const row = result.rows.item(0);

    let parsed: any;
    try {
        parsed = JSON.parse(row.embedding);
    } catch {
        return null;
    }

    if (!validateEmbedding(parsed, `getEmployeeById(${empId})`)) return null;

    return {
        emp_id: row.emp_id,
        name: row.name,
        embedding: parsed as number[],
    };
};