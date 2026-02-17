import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { exportAttendanceCSV } from '../database/exportRepo';
import Share from 'react-native-share';

const HomeScreen = ({ navigation }: any) => {

    const handleExport = async () => {
        try {
            const path = await exportAttendanceCSV();

            if (!path) {
                Alert.alert('Error', 'Failed to generate Excel file');
                return;
            }

            Alert.alert(
                'Success',
                `File saved to Downloads:\n\n${path.split('/').pop()}`
            );
        } catch (error) {
            console.error('Export failed:', error);
            Alert.alert('Error', 'Failed to export attendance data');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Face Attendance System</Text>

            <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Camera', { mode: 'register' })}
            >
                <Text style={styles.buttonText}>Register Employee</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate('Camera', { mode: 'attendance' })}
            >
                <Text style={styles.buttonText}>Mark Attendance</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.button, styles.exportButton]}
                onPress={handleExport}
            >
                <Text style={styles.buttonText}>Export Attendance (Excel)</Text>
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
    buttonText: {
        color: '#fff',
        fontSize: 16,
    },
});

export default HomeScreen;
