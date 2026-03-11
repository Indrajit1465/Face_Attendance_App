import { getDB } from './db';
import Logger from '../utils/Logger';

// ✅ Must match EMBEDDING_SIZE in FaceRecognitionModule.java
// Check logcat on app startup: "Model output shape: [1, 128]" or "[1, 192]"
const EXPECTED_EMBEDDING_SIZE = 192;

export type Employee = {
    emp_id: string;
    name: string;
    embedding: number[] | number[][];  // ✅ H3: supports single-vector or multi-template
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
const validateSingleEmbedding = (embedding: any, context: string): boolean => {
    if (!Array.isArray(embedding)) {
        Logger.warn('employeeRepo', `${context}: embedding is not an array`);
        return false;
    }

    if (embedding.length !== EXPECTED_EMBEDDING_SIZE) {
        Logger.warn('employeeRepo',
            `${context}: wrong embedding length ` +
            `(got ${embedding.length}, expected ${EXPECTED_EMBEDDING_SIZE})`
        );
        return false;
    }

    for (let i = 0; i < embedding.length; i++) {
        if (typeof embedding[i] !== 'number' || !isFinite(embedding[i])) {
            Logger.warn('employeeRepo',
                `${context}: non-finite value at index ${i}: ${embedding[i]}`
            );
            return false;
        }
    }

    // Check norm is non-zero (not a blank embedding)
    const norm = Math.sqrt(embedding.reduce((s: number, x: number) => s + x * x, 0));
    if (norm < 1e-6) {
        Logger.warn('employeeRepo', `${context}: near-zero norm embedding (${norm})`);
        return false;
    }

    return true;
};

/**
 * ✅ H3 FIX: Validates both single-vector (number[]) and multi-template (number[][]).
 * Multi-template: validates each inner embedding independently.
 */
const validateEmbedding = (embedding: any, context: string): boolean => {
    if (!Array.isArray(embedding) || embedding.length === 0) {
        Logger.warn('employeeRepo', `${context}: embedding is not an array or is empty`);
        return false;
    }

    // Multi-template: array of arrays
    if (Array.isArray(embedding[0])) {
        for (let i = 0; i < embedding.length; i++) {
            if (!validateSingleEmbedding(embedding[i], `${context}[${i}]`)) {
                return false;
            }
        }
        Logger.debug('employeeRepo', `${context}: validated multi-template with ${embedding.length} embeddings`);
        return true;
    }

    // Single-vector
    return validateSingleEmbedding(embedding, context);
};

// ─────────────────────────────────────────────────────
// Insert Employee
// ─────────────────────────────────────────────────────

export const insertEmployee = (
    empId: string,
    name: string,
    embedding: number[] | number[][]  // ✅ H3: accepts single-vector or multi-template
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

    const serialized = JSON.stringify(embedding);
    db.execute(
        `INSERT INTO employees (emp_id, name, embedding) VALUES (?, ?, ?)`,
        [empId, name, serialized]
    );

    const isMulti = Array.isArray(embedding[0]);
    const embCount = isMulti ? (embedding as number[][]).length : 1;
    Logger.info('employeeRepo',
        `Registered employee: ${name} (${empId}), ` +
        `templates: ${embCount}, isMulti: ${isMulti}, ` +
        `serialized size: ${serialized.length} bytes`);
};

// ─────────────────────────────────────────────────────
// Get All Employees
// ─────────────────────────────────────────────────────

export const getAllEmployees = async (): Promise<Employee[]> => {
    // ✅ async — consistent with attendanceService.ts await call
    // ✅ M1 FIX: Explicit column list instead of SELECT *
    const db = getDB();
    const result = db.execute(`SELECT emp_id, name, embedding FROM employees`);

    const employees: Employee[] = [];

    if (!result.rows) {
        return employees;
    }

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);

        // ✅ Guard: skip rows with missing data
        if (!row || !row.emp_id || !row.name || !row.embedding) {
            Logger.warn('employeeRepo', `Skipping row ${i}: missing required fields`);
            continue;
        }

        // ✅ Guard: safe JSON parse
        let parsed: any;
        try {
            parsed = JSON.parse(row.embedding);
        } catch (e) {
            Logger.warn('employeeRepo', `Failed to parse embedding for ${row.name}: ${e}`);
            continue; // ✅ Skip corrupted row — don't crash the whole list
        }

        // ✅ Guard: validate parsed embedding before using it
        if (!validateEmbedding(parsed, `getAllEmployees → ${row.name}`)) {
            Logger.warn('employeeRepo', `Skipping ${row.name}: invalid embedding in DB`);
            continue;
        }

        employees.push({
            emp_id: row.emp_id,
            name: row.name,
            embedding: parsed as number[],
        });
    }

    Logger.debug('employeeRepo', `Loaded ${employees.length} valid employees from DB`);
    return employees;
};

// ─────────────────────────────────────────────────────
// Delete Employee (utility)
// ─────────────────────────────────────────────────────

export const deleteEmployee = (empId: string): void => {
    const db = getDB();
    db.execute(`DELETE FROM employees WHERE emp_id = ?`, [empId]);
    Logger.debug('employeeRepo', `Deleted employee: ${empId}`);
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