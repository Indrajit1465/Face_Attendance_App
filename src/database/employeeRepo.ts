import { getDB } from './db';

export type Employee = {
    emp_id: string;
    name: string;
    embedding: number[];
};

export const insertEmployee = (
    empId: string,
    name: string,
    embedding: number[]
): void => {
    const db = getDB();

    // Check if employee already exists
    const result = db.execute(
        `SELECT emp_id FROM employees WHERE emp_id = ?`,
        [empId]
    );

    const rows = result.rows ?? { length: 0, item: () => null };

    if (rows.length > 0) {
        throw new Error('EMPLOYEE_EXISTS');
    }

    db.execute(
        `INSERT INTO employees (emp_id, name, embedding)
     VALUES (?, ?, ?)`,
        [empId, name, JSON.stringify(embedding)]
    );
};

export const getAllEmployees = (): Employee[] => {
    const db = getDB();
    const result = db.execute(`SELECT * FROM employees`);

    const employees: Employee[] = [];

    if (!result.rows) {
        return employees;
    }

    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);

        employees.push({
            emp_id: row.emp_id,
            name: row.name,
            embedding: JSON.parse(row.embedding),
        });
    }

    return employees;
};
