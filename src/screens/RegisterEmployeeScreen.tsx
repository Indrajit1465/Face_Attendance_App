import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { insertEmployee } from '../database/employeeRepo';

const RegisterEmployeeScreen = ({ route, navigation }: any) => {
    const embedding = route?.params?.embedding;

    const [empId, setEmpId] = useState('');
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    // ✅ Track mount state to prevent setState after navigation
    const isMounted = useRef(true);
    useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    // ─────────────────────────────────────────────
    // ✅ Embedding guard — catches null, undefined, AND empty array
    // ─────────────────────────────────────────────
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.error}>No face data found</Text>
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

    // ─────────────────────────────────────────────
    // Register handler
    // ─────────────────────────────────────────────
    const register = async () => {  // ✅ async

        // Input validation
        if (!empId.trim()) {
            Alert.alert('Invalid Input', 'Please enter an Employee ID.');
            return;
        }
        if (!name.trim()) {
            Alert.alert('Invalid Input', 'Please enter an Employee Name.');
            return;
        }

        // ✅ Pre-flight embedding sanity check before hitting DB
        if (embedding.some((v: any) => typeof v !== 'number' || !isFinite(v))) {
            Alert.alert(
                'Invalid Face Data',
                'The captured face data is corrupted. Please go back and recapture.'
            );
            return;
        }

        try {
            if (isMounted.current) setSaving(true);

            // ✅ await — correct async contract
            await insertEmployee(empId.trim(), name.trim(), embedding);

            Alert.alert(
                'Registered ✅',
                `${name.trim()} has been registered successfully.`,
                [{
                    text: 'OK',
                    onPress: () => navigation.navigate('Home'),
                }]
            );

        } catch (error: any) {
            // ✅ All three error cases handled specifically
            if (error?.message === 'EMPLOYEE_EXISTS') {
                Alert.alert(
                    'Duplicate Employee ID',
                    `Employee ID "${empId.trim()}" already exists. Please use a different ID.`
                );
            } else if (error?.message === 'INVALID_EMBEDDING') {
                Alert.alert(
                    'Invalid Face Data',
                    'The face template is invalid. Please go back and recapture the face.'
                );
            } else {
                console.error('[RegisterEmployeeScreen] DB error:', error);
                Alert.alert('Error', 'Failed to register employee. Please try again.');
            }
        } finally {
            // ✅ Only update state if still mounted
            if (isMounted.current) setSaving(false);
        }
    };

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Register Employee</Text>

            {/* Embedding preview badge */}
            <View style={styles.embeddingBadge}>
                <Text style={styles.embeddingBadgeText}>
                    ✅ Face data ready ({embedding.length}D embedding)
                </Text>
            </View>

            <TextInput
                placeholder="Employee ID  (e.g. EMP001)"
                placeholderTextColor="#999"
                value={empId}
                onChangeText={setEmpId}
                style={styles.input}
                autoCapitalize="characters"
                maxLength={20}              // ✅ prevent runaway input
                returnKeyType="next"
            />

            <TextInput
                placeholder="Employee Name  (e.g. John Smith)"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                style={styles.input}
                maxLength={60}              // ✅ prevent runaway input
                returnKeyType="done"
                onSubmitEditing={register}  // ✅ keyboard submit triggers register
            />

            <TouchableOpacity
                style={[styles.button, saving && { opacity: 0.6 }]}
                onPress={register}
                disabled={saving}
            >
                <Text style={styles.buttonText}>
                    {saving ? 'Saving…' : 'Save Employee'}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                disabled={saving}
            >
                <Text style={styles.backButtonText}>← Retake Face</Text>
            </TouchableOpacity>
        </View>
    );
};

// ─────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────
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
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },

    // Embedding badge
    embeddingBadge: {
        backgroundColor: '#052e16',
        borderWidth: 1,
        borderColor: '#4ade80',
        borderRadius: 8,
        padding: 10,
        marginBottom: 24,
        alignItems: 'center',
    },
    embeddingBadgeText: {
        color: '#4ade80',
        fontSize: 13,
    },

    // Inputs
    input: {
        backgroundColor: '#fff',
        marginBottom: 16,
        padding: 12,
        borderRadius: 6,
        fontSize: 15,
    },

    // Buttons
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
    backButton: {
        padding: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    backButtonText: {
        color: '#888',
        fontSize: 14,
    },

    // Error state
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