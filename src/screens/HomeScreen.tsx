import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { exportAttendanceCSV } from '../database/exportRepo';

const HomeScreen = ({ navigation }: any) => {

    // ✅ Loading state — prevents double-tap and gives user feedback
    const [exporting, setExporting] = useState(false);

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

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Face Attendance System</Text>

            {/* Register */}
            <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Camera', { mode: 'register' })}
            >
                <Text style={styles.buttonText}>Register Employee</Text>
            </TouchableOpacity>

            {/* Attendance */}
            <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Camera', { mode: 'attendance' })}
            >
                <Text style={styles.buttonText}>Mark Attendance</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.button, styles.logButton]}
                onPress={() => navigation.navigate('Attendance')}
            >
                <Text style={styles.buttonText}>View Attendance Log</Text>
            </TouchableOpacity>

            {/* Export */}
            <TouchableOpacity
                style={[styles.button, styles.exportButton, exporting && styles.disabledButton]}
                onPress={handleExport}
                disabled={exporting}   // ✅ prevents double-tap at OS level too
            >
                {exporting ? (
                    <View style={styles.exportingRow}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.buttonText, { marginLeft: 10 }]}>
                            Exporting…
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.buttonText}>Export Attendance (Excel)</Text>
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
        marginBottom: 40,
        fontWeight: 'bold',
    },
    logButton: {
        backgroundColor: '#7c3aed',  // purple — visually distinct from other actions
    },
    button: {
        backgroundColor: '#2563eb',
        padding: 16,
        borderRadius: 8,
        width: '70%',
        marginBottom: 20,
        alignItems: 'center',
    },
    exportButton: {
        backgroundColor: '#16a34a',
    },
    disabledButton: {
        opacity: 0.6,               // ✅ Visual feedback that button is disabled
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