import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { exportAttendanceCSV } from '../database/exportRepo';

const HomeScreen = ({ navigation }: any) => {

    // ✅ Loading state — prevents double-tap and gives user feedback
    const [exporting, setExporting] = useState(false);

    // ✅ PIN-gated navigation — routes through PinEntry first
    const navigateWithPin = (target: string, targetParams: any = {}) => {
        navigation.navigate('PinEntry', { target, targetParams });
    };

    const handleExport = async () => {
        // ✅ Guard against re-entry while export is already running
        if (exporting) return;
        setExporting(true);

        try {
            const path = await exportAttendanceCSV();

            if (!path) {
                Alert.alert('Export Failed', 'Could not generate the Excel file. Please try again.');
                return;
            }

            // ✅ Show full path so user can locate file
            Alert.alert(
                'Export Successful ✅',
                `File saved to:\n\n${path}`,
                [{ text: 'OK' }]
            );

        } catch (error: any) {
            if (error?.message === 'PERMISSION_DENIED') {
                Alert.alert('Permission Required',
                    'Storage permission was denied. Please allow it in Settings to export reports.');
            } else if (error?.message === 'NO_DATA') {
                Alert.alert('No Data', 'There are no attendance records to export yet.');
            } else {
                Alert.alert('Export Failed', 'An error occurred while exporting attendance data.');
            }
        } finally {
            // ✅ Always re-enable button even if export threw
            setExporting(false);
        }
    };

    // ✅ PIN-gated export — verify first, then export
    const handlePinThenExport = () => {
        // Navigate to PinEntry, which on success goes to a callback
        // Since export is an action (not a screen), we navigate to Home with export flag
        navigateWithPin('Home', { autoExport: true });
    };

    // ✅ Check if we were redirected back after PIN success for export
    React.useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            const params = navigation.getState()?.routes?.find(
                (r: any) => r.name === 'Home'
            )?.params;
            if (params?.autoExport) {
                // Clear the flag and run export
                navigation.setParams({ autoExport: undefined });
                handleExport();
            }
        });
        return unsubscribe;
    }, [navigation]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Face Attendance System</Text>

            {/* Mark Attendance — NO PIN required (kiosk mode) */}
            <TouchableOpacity
                style={[styles.button, styles.scanButton]}
                onPress={() => navigation.navigate('Camera', { mode: 'attendance' })}
            >
                <Text style={styles.buttonText}>📷  Mark Attendance</Text>
            </TouchableOpacity>

            {/* ─── Admin Section ─── */}
            <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>🔒 Admin</Text>
                <View style={styles.dividerLine} />
            </View>

            {/* Register — PIN required */}
            <TouchableOpacity
                style={styles.button}
                onPress={() => navigateWithPin('Camera', { mode: 'register' })}
            >
                <Text style={styles.buttonText}>🔒  Register Employee</Text>
            </TouchableOpacity>

            {/* Attendance Log — PIN required */}
            <TouchableOpacity
                style={[styles.button, styles.logButton]}
                onPress={() => navigateWithPin('Attendance')}
            >
                <Text style={styles.buttonText}>🔒  View Attendance Log</Text>
            </TouchableOpacity>

            {/* Export — PIN required */}
            <TouchableOpacity
                style={[styles.button, styles.exportButton, exporting && styles.disabledButton]}
                onPress={handlePinThenExport}
                disabled={exporting}
            >
                {exporting ? (
                    <View style={styles.exportingRow}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.buttonText, { marginLeft: 10 }]}>
                            Exporting…
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.buttonText}>🔒  Export Attendance (Excel)</Text>
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    title: {
        color: '#fff',
        fontSize: 22,
        marginBottom: 32,
        fontWeight: 'bold',
    },
    scanButton: {
        backgroundColor: '#2563eb',
        marginBottom: 28,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '70%',
        marginBottom: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#333',
    },
    dividerText: {
        color: '#666',
        fontSize: 12,
        marginHorizontal: 12,
        fontWeight: '600',
    },
    logButton: {
        backgroundColor: '#7c3aed',
    },
    button: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        width: '70%',
        marginBottom: 14,
        alignItems: 'center',
    },
    exportButton: {
        backgroundColor: '#16a34a',
    },
    disabledButton: {
        opacity: 0.6,
    },
    exportingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default HomeScreen;