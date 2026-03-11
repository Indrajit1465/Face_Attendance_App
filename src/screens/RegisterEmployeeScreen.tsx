import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput,
    TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { insertEmployee } from '../database/employeeRepo';
import { invalidateEmployeeCache } from '../services/attendanceService';

const RegisterEmployeeScreen = ({ route, navigation }: any) => {
    const embedding = route?.params?.embedding;

    const [empId, setEmpId] = useState('');
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [empIdError, setEmpIdError] = useState('');
    const [nameError, setNameError] = useState('');

    const isMounted = useRef(true);
    useEffect(() => { return () => { isMounted.current = false; }; }, []);

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.error}>No face data found</Text>
                <Text style={styles.errorSub}>Please capture a face before registration.</Text>
                <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Home')}>
                    <Text style={styles.buttonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ✅ H3: Detect multi-template vs single-vector for display
    const isMultiTemplate = Array.isArray(embedding[0]);
    const templateCount = isMultiTemplate ? embedding.length : 1;
    const embDimension = isMultiTemplate ? embedding[0].length : embedding.length;

    // ─────────────────────────────────────────────
    // Input handlers with real-time validation
    // ─────────────────────────────────────────────

    const handleEmpIdChange = (text: string) => {
        // ✅ Only allow digits 0–9
        const cleaned = text.replace(/[^0-9]/g, '');
        setEmpId(cleaned);
        if (cleaned.length === 0) {
            setEmpIdError('Employee ID is required');
        } else if (cleaned.length < 2) {
            setEmpIdError('ID must be at least 2 digits');
        } else {
            setEmpIdError('');
        }
    };

    const handleNameChange = (text: string) => {
        // ✅ Only allow letters, spaces, hyphens, apostrophes (for names like O'Brien)
        const cleaned = text.replace(/[^a-zA-Z\s\-']/g, '');
        setName(cleaned);
        if (cleaned.trim().length === 0) {
            setNameError('Name is required');
        } else if (cleaned.trim().length < 2) {
            setNameError('Name must be at least 2 characters');
        } else {
            setNameError('');
        }
    };

    // ─────────────────────────────────────────────
    // Register
    // ─────────────────────────────────────────────

    const register = async () => {
        // ✅ Final validation before submit
        let valid = true;

        if (!empId || empId.trim().length < 2) {
            setEmpIdError('Please enter a valid numeric Employee ID');
            valid = false;
        }

        if (!/^\d+$/.test(empId)) {
            setEmpIdError('Employee ID must contain numbers only');
            valid = false;
        }

        if (!name || name.trim().length < 2) {
            setNameError('Please enter a valid name');
            valid = false;
        }

        if (!/^[a-zA-Z\s\-']+$/.test(name.trim())) {
            setNameError('Name must contain letters only');
            valid = false;
        }

        if (!valid) return;

        // ✅ H3 FIX: Validate embedding — supports both single-vector and multi-template
        const isMultiTemplate = Array.isArray(embedding[0]);
        const embeddingsToCheck: number[][] = isMultiTemplate ? embedding : [embedding];
        const hasInvalid = embeddingsToCheck.some((emb: number[]) =>
            !Array.isArray(emb) || emb.some((v: number) => typeof v !== 'number' || !isFinite(v))
        );
        if (hasInvalid) {
            Alert.alert('Invalid Face Data', 'Please go back and recapture the face.');
            return;
        }

        try {
            if (isMounted.current) setSaving(true);

            await insertEmployee(empId.trim(), name.trim(), embedding);

            // ✅ Invalidate cache so new employee is recognized immediately
            invalidateEmployeeCache();

            Alert.alert(
                'Registered ✅',
                `${name.trim()} (ID: ${empId.trim()}) registered successfully.`,
                [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
            );

        } catch (error: any) {
            if (error?.message === 'EMPLOYEE_EXISTS') {
                setEmpIdError(`ID "${empId.trim()}" already exists — use a different number`);
            } else if (error?.message === 'INVALID_EMBEDDING') {
                Alert.alert('Invalid Face Data',
                    'The face template is invalid. Please go back and recapture.');
            } else {
                console.error('[RegisterEmployeeScreen] DB error:', error);
                Alert.alert('Error', 'Failed to register employee. Please try again.');
            }
        } finally {
            if (isMounted.current) setSaving(false);
        }
    };

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Register Employee</Text>

            {/* Face data badge */}
            <View style={styles.embeddingBadge}>
                <Text style={styles.embeddingBadgeText}>
                    ✅ Face data ready ({templateCount} template{templateCount > 1 ? 's' : ''}, {embDimension}D)
                </Text>
            </View>

            {/* Employee ID — numbers only */}
            <Text style={styles.label}>Employee ID</Text>
            <TextInput
                placeholder="e.g. 1001"
                placeholderTextColor="#999"
                value={empId}
                onChangeText={handleEmpIdChange}
                style={[styles.input, empIdError ? styles.inputError : null]}
                keyboardType="numeric"          // ✅ numeric keyboard
                maxLength={10}
                returnKeyType="next"
            />
            {empIdError ? (
                <Text style={styles.fieldError}>{empIdError}</Text>
            ) : (
                <Text style={styles.fieldHint}>Numbers only (e.g. 1001, 2045)</Text>
            )}

            {/* Name — letters only */}
            <Text style={styles.label}>Employee Name</Text>
            <TextInput
                placeholder="e.g. John Smith"
                placeholderTextColor="#999"
                value={name}
                onChangeText={handleNameChange}
                style={[styles.input, nameError ? styles.inputError : null]}
                keyboardType="default"          // ✅ regular keyboard
                autoCapitalize="words"          // ✅ capitalize each word
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={register}
            />
            {nameError ? (
                <Text style={styles.fieldError}>{nameError}</Text>
            ) : (
                <Text style={styles.fieldHint}>Letters only (e.g. John Smith)</Text>
            )}

            {/* Save button */}
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

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: '#000',
        padding: 20, justifyContent: 'center',
    },
    title: {
        color: '#fff', fontSize: 20, fontWeight: 'bold',
        marginBottom: 20, textAlign: 'center',
    },
    embeddingBadge: {
        backgroundColor: '#052e16', borderWidth: 1,
        borderColor: '#4ade80', borderRadius: 8,
        padding: 10, marginBottom: 24, alignItems: 'center',
    },
    embeddingBadgeText: { color: '#4ade80', fontSize: 13 },

    label: {
        color: '#ccc', fontSize: 13,
        marginBottom: 4, marginLeft: 2,
    },
    input: {
        backgroundColor: '#fff', marginBottom: 4,
        padding: 12, borderRadius: 6, fontSize: 15,
        borderWidth: 2, borderColor: 'transparent',
    },
    inputError: {
        borderColor: '#ef4444',  // ✅ red border on error
    },
    fieldError: {
        color: '#ef4444', fontSize: 12,
        marginBottom: 12, marginLeft: 2,
    },
    fieldHint: {
        color: '#666', fontSize: 11,
        marginBottom: 12, marginLeft: 2,
    },

    button: {
        backgroundColor: '#2563eb', padding: 14,
        borderRadius: 8, alignItems: 'center', marginTop: 10,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    backButton: { padding: 12, alignItems: 'center', marginTop: 8 },
    backButtonText: { color: '#888', fontSize: 14 },

    error: { color: '#ff5555', fontSize: 18, textAlign: 'center' },
    errorSub: {
        color: '#aaa', fontSize: 14, textAlign: 'center',
        marginTop: 8, marginBottom: 20,
    },
});

export default RegisterEmployeeScreen;