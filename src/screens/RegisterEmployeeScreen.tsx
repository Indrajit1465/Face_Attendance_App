import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { insertEmployee } from '../database/employeeRepo';

const RegisterEmployeeScreen = ({ route, navigation }: any) => {
    const embedding = route?.params?.embedding;

    const [empId, setEmpId] = useState('');
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    // 🔒 Guard: embedding must exist
    if (!embedding) {
        return (
            <View style={styles.container}>
                <Text style={styles.error}>
                    No face data found
                </Text>
                <Text style={styles.errorSub}>
                    Please capture a face before registration.
                </Text>

                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Home')}
                >
                    <Text style={styles.buttonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const register = () => {
        if (!empId.trim() || !name.trim()) {
            Alert.alert(
                'Invalid Input',
                'Please enter both Employee ID and Name'
            );
            return;
        }

        try {
            setSaving(true);

            insertEmployee(
                empId.trim(),
                name.trim(),
                embedding
            );

            Alert.alert('Success', 'Employee registered successfully');
            navigation.navigate('Home');
        } catch (error: any) {
            if (error.message === 'EMPLOYEE_EXISTS') {
                Alert.alert(
                    'Duplicate Employee ID',
                    'This Employee ID already exists. Please use a different one.'
                );
            } else {
                Alert.alert('Error', 'Failed to register employee');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Register Employee</Text>

            <TextInput
                placeholder="Employee ID"
                placeholderTextColor="#999"
                value={empId}
                onChangeText={setEmpId}
                style={styles.input}
                autoCapitalize="characters"
            />

            <TextInput
                placeholder="Employee Name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                style={styles.input}
            />

            <TouchableOpacity
                style={[
                    styles.button,
                    saving && { opacity: 0.6 },
                ]}
                onPress={register}
                disabled={saving}
            >
                <Text style={styles.buttonText}>
                    {saving ? 'Saving...' : 'Save'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        padding: 20,
        justifyContent: 'center',
    },
    title: {
        color: '#fff',
        fontSize: 20,
        marginBottom: 20,
        textAlign: 'center',
    },
    input: {
        backgroundColor: '#fff',
        marginBottom: 16,
        padding: 12,
        borderRadius: 6,
    },
    button: {
        backgroundColor: '#2563eb',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    error: {
        color: '#ff5555',
        fontSize: 18,
        textAlign: 'center',
    },
    errorSub: {
        color: '#aaa',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
});

export default RegisterEmployeeScreen;
