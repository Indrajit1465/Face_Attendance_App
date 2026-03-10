import { getDB } from './db';
import { ClusterIndex, Centroid } from '../utils/embeddingCluster';
import Logger from '../utils/Logger';

// ─────────────────────────────────────────────────────
// Add to db.ts initDB():
// database.execute(`
//     CREATE TABLE IF NOT EXISTS cluster_index (
//         id        INTEGER PRIMARY KEY,
//         data      TEXT NOT NULL,
//         built_at  INTEGER NOT NULL
//     );
// `);
// ─────────────────────────────────────────────────────

export const saveClusterIndex = (index: ClusterIndex): void => {
    try {
        const db = getDB();
        const json = JSON.stringify(index);

        // ✅ Atomic upsert — wrapped in transaction to prevent index loss on crash
        db.execute('BEGIN TRANSACTION');
        db.execute(`DELETE FROM cluster_index`);
        db.execute(
            `INSERT INTO cluster_index (data, built_at) VALUES (?, ?)`,
            [json, index.builtAt]
        );
        db.execute('COMMIT');
        Logger.debug('clusterRepo', `Saved cluster index (${index.empCount} employees)`);
    } catch (err) {
        try { getDB().execute('ROLLBACK'); } catch { /* ignore rollback errors */ }
        Logger.error('clusterRepo', 'Failed to save cluster index:', err);
    }
};

export const loadClusterIndex = (): ClusterIndex | null => {
    try {
        const db = getDB();
        const result = db.execute(`SELECT data FROM cluster_index LIMIT 1`);

        if (!result.rows || result.rows.length === 0) return null;

        const row = result.rows.item(0);
        if (!row?.data) return null;

        const index: ClusterIndex = JSON.parse(row.data);
        Logger.debug('clusterRepo', `Loaded cluster index (${index.empCount} employees, ${index.centroids.length} clusters)`);
        return index;

    } catch (err) {
        Logger.error('clusterRepo', 'Failed to load cluster index:', err);
        return null;
    }
};