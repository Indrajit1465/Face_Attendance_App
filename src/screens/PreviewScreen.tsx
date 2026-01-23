import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { detectFaces } from '../services/faceDetection';
import { getEmbedding } from '../services/faceRecognition';
import { processAttendance } from '../services/attendanceService';

const PreviewScreen = ({ route, navigation }: any) => {
    const { imageUri, mode } = route.params;

    const [loading, setLoading] = useState(false);
    const [faces, setFaces] = useState<any[]>([]);

    // -----------------------------
    // Phase 3: Face Detection
    // -----------------------------
    const runFaceDetection = async () => {
        try {
            setLoading(true);

            const rawPath = imageUri.replace('file://', '');
            const result = await detectFaces(rawPath);

            setFaces(result);
            console.log('Detected faces:', result);
        } catch (error) {
            console.error('Face detection failed:', error);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------
    // Phase 4 + Phase 5 logic
    // -----------------------------
    const runFaceRecognition = async () => {
        try {
            setLoading(true);

            const rawImagePath = imageUri.replace('file://', '');
            const embedding = await getEmbedding(rawImagePath);

            console.log('Embedding length:', embedding.length);

            if (mode === 'register') {
                navigation.navigate('Register', { embedding });
                return;
            }

            if (mode === 'attendance') {
                const names = processAttendance(embedding);

                if (names.length === 0) {
                    Alert.alert('Attendance', 'Unknown face');
                } else {
                    const message =
                        names.length === 1
                            ? `${names[0]} attendance marked`
                            : `${names.join(', ')} attendance marked`;

                    Alert.alert('Attendance', message);
                }

                navigation.navigate('Home');
            }
        } catch (error) {
            console.error('Face recognition failed:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Captured Image</Text>

            <Image source={{ uri: imageUri }} style={styles.image} />

            {/* Face Detection */}
            <TouchableOpacity
                style={styles.button}
                onPress={runFaceDetection}
                disabled={loading}
            >
                <Text style={styles.buttonText}>
                    {loading ? 'Detecting Faces...' : 'Run Face Detection'}
                </Text>
            </TouchableOpacity>

            {faces.length > 0 && (
                <Text style={styles.result}>
                    Faces detected: {faces.length}
                </Text>
            )}

            {/* Face Recognition */}
            {faces.length > 0 && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={runFaceRecognition}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? 'Processing...' : 'Continue'}
                    </Text>
                </TouchableOpacity>
            )}

            {loading && <ActivityIndicator size="large" color="#2563eb" />}

            <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>Retake Photo</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        padding: 16,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 12,
    },
    image: {
        flex: 1,
        width: '100%',
        borderRadius: 8,
        backgroundColor: '#111',
    },
    button: {
        marginTop: 16,
        backgroundColor: '#2563eb',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    secondaryButton: {
        backgroundColor: '#444',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
    },
    result: {
        marginTop: 12,
        color: '#00ff99',
        textAlign: 'center',
        fontSize: 16,
    },
});

export default PreviewScreen;
