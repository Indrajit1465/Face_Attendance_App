import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDB } from '../database/db';

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type AttendanceRecord = {
    id: number;
    emp_id: string;
    name: string;
    check_in: string;
    check_out: string | null;
    duration: number | null;
};

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

const formatDateTime = (iso: string | null): string => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}  ${hh}:${min}`;
    } catch {
        return iso;
    }
};

const formatDuration = (seconds: number | null): string => {
    if (seconds == null || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
};

const getStatusColor = (record: AttendanceRecord): string => {
    if (!record.check_out) return '#facc15';  // yellow  — still checked in
    return '#4ade80';                          // green   — completed session
};

const getStatusLabel = (record: AttendanceRecord): string => {
    if (!record.check_out) return 'IN';
    return 'OUT';
};

// ─────────────────────────────────────────────────────
// Row Component
// ─────────────────────────────────────────────────────
const AttendanceRow = ({ item }: { item: AttendanceRecord }) => {
    const statusColor = getStatusColor(item);
    const statusLabel = getStatusLabel(item);

    return (
        <View style={styles.row}>
            {/* Status Badge */}
            <View style={[styles.badge, { backgroundColor: statusColor }]}>
                <Text style={styles.badgeText}>{statusLabel}</Text>
            </View>

            {/* Info */}
            <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowId}>{item.emp_id}</Text>
            </View>

            {/* Times */}
            <View style={styles.rowTimes}>
                <Text style={styles.timeText}>▲ {formatDateTime(item.check_in)}</Text>
                <Text style={styles.timeText}>▼ {formatDateTime(item.check_out)}</Text>
                {item.check_out && (
                    <Text style={styles.durationText}>
                        ⏱ {formatDuration(item.duration)}
                    </Text>
                )}
            </View>
        </View>
    );
};

// ─────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────
const AttendanceScreen = ({ navigation }: any) => {

    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [totalToday, setTotalToday] = useState(0);
    const [activeNow, setActiveNow] = useState(0);

    const loadRecords = useCallback(async () => {
        try {
            const db = getDB();
            const result = db.execute(`
                SELECT id, emp_id, name, check_in, check_out, duration
                FROM attendance
                ORDER BY check_in DESC
                LIMIT 100
            `);

            const rows = result.rows ?? { length: 0, item: () => null };
            const list: AttendanceRecord[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows.item(i);
                if (!row) continue;
                list.push({
                    id: row.id,
                    emp_id: row.emp_id,
                    name: row.name,
                    check_in: row.check_in,
                    check_out: row.check_out ?? null,
                    duration: row.duration ?? null,
                });
            }

            // ── Stats ──────────────────────────────
            const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
            const todayRecords = list.filter(r => r.check_in.startsWith(todayStr));
            const active = list.filter(r => !r.check_out).length;

            setRecords(list);
            setTotalToday(todayRecords.length);
            setActiveNow(active);

        } catch (err) {
            console.error('[AttendanceScreen] Load error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // ✅ Reload every time this screen comes into focus
    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            loadRecords();
        }, [loadRecords])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadRecords();
    };

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color="#2563eb" size="large" />
                <Text style={styles.loadingText}>Loading records…</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>

            {/* Header */}
            <Text style={styles.title}>Attendance Log</Text>

            {/* Stats Bar */}
            <View style={styles.statsRow}>
                <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{totalToday}</Text>
                    <Text style={styles.statLabel}>Today</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: '#4ade80' }]}>
                        {activeNow}
                    </Text>
                    <Text style={styles.statLabel}>Currently In</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{records.length}</Text>
                    <Text style={styles.statLabel}>Total (Last 100)</Text>
                </View>
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#facc15' }]} />
                    <Text style={styles.legendText}>Checked In</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
                    <Text style={styles.legendText}>Completed</Text>
                </View>
            </View>

            {/* List */}
            {records.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No attendance records yet.</Text>
                    <Text style={styles.emptySubText}>
                        Records will appear here after attendance is marked.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={records}
                    keyExtractor={item => `${item.id}`}
                    renderItem={({ item }) => <AttendanceRow item={item} />}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#2563eb"
                        />
                    }
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            )}
        </View>
    );
};

// ─────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    title: {
        color: '#fff', fontSize: 20, fontWeight: 'bold',
        textAlign: 'center', marginBottom: 16,
    },

    // Stats
    statsRow: {
        flexDirection: 'row', justifyContent: 'space-around',
        backgroundColor: '#1a1a1a', marginHorizontal: 16,
        borderRadius: 12, padding: 16, marginBottom: 12,
    },
    statBox: { alignItems: 'center', flex: 1 },
    statNumber: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
    statLabel: { color: '#888', fontSize: 11, marginTop: 4 },
    statDivider: { width: 1, backgroundColor: '#333' },

    // Legend
    legendRow: {
        flexDirection: 'row', justifyContent: 'center',
        gap: 24, marginBottom: 12,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: '#888', fontSize: 12 },

    // Row
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#111',
    },
    badge: {
        width: 36, height: 36, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 12,
    },
    badgeText: { fontSize: 10, fontWeight: 'bold', color: '#000' },
    rowInfo: { flex: 1 },
    rowName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    rowId: { color: '#888', fontSize: 12, marginTop: 2 },
    rowTimes: { alignItems: 'flex-end' },
    timeText: { color: '#aaa', fontSize: 11 },
    durationText: { color: '#4ade80', fontSize: 11, marginTop: 2 },

    separator: { height: 1, backgroundColor: '#1f1f1f' },

    // Empty / Loading
    loadingText: { color: '#888', marginTop: 12 },
    emptyText: { color: '#fff', fontSize: 16 },
    emptySubText: { color: '#666', fontSize: 13, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 },
});

export default AttendanceScreen;