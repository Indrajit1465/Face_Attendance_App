import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { getEmbedding } from '../services/faceRecognition';
import { processAttendance } from '../services/attendanceService';
import { averageEmbedding } from '../utils/averageEmbedding';

// 🔧 Multi-frame registration settings
const REQUIRED_SAMPLES = 8;
const SAMPLE_DELAY_MS = 700;
const MIN_VALID_SAMPLES = 5; // 🔑 critical

// 🧮 embedding norm utility
const embeddingNorm = (v: number[]) =>
    Math.sqrt(v.reduce((s, x) => s + x * x, 0));

const PreviewScreen = ({ route, navigation }: any) => {
    const { imageUri, mode } = route.params;

    const [collecting, setCollecting] = useState(false);
    const [sampleCount, setSampleCount] = useState(0);

    // 🔒 Store embeddings safely
    const embeddingsRef = useRef<number[][]>([]);

    const handleContinue = async () => {
        try {
            const rawPath = imageUri.replace('file://', '');

            // ======================
            // REGISTRATION MODE
            // ======================
            if (mode === 'register') {
                if (collecting) return;

                setCollecting(true);
                embeddingsRef.current = [];
                setSampleCount(0);

                for (let i = 0; i < REQUIRED_SAMPLES; i++) {
                    const embedding = await getEmbedding(rawPath);

                    if (!embedding || embedding.length === 0) {
                        continue;
                    }

                    // 🔑 QUALITY CHECK
                    const norm = embeddingNorm(embedding);

                    // Accept only stable embeddings
                    if (norm < 0.85 || norm > 1.15) {
                        console.warn('[Register] Discarding weak embedding');
                        continue;
                    }

                    embeddingsRef.current.push(embedding);
                    setSampleCount(embeddingsRef.current.length);

                    // ⏱ Delay between samples
                    if (i < REQUIRED_SAMPLES - 1) {
                        await new Promise<void>(resolve =>
                            setTimeout(resolve, SAMPLE_DELAY_MS)
                        );
                    }
                }

                // ❌ Not enough good samples
                if (embeddingsRef.current.length < MIN_VALID_SAMPLES) {
                    setCollecting(false);
                    Alert.alert(
                        'Registration Failed',
                        'Face data was unstable. Please try again with better lighting and face visible.'
                    );
                    return;
                }

                // 🧠 Strong averaged embedding
                const finalEmbedding = averageEmbedding(
                    embeddingsRef.current
                );

                setCollecting(false);

                navigation.navigate('Register', {
                    embedding: finalEmbedding,
                });

                return;
            }

            // ======================
            // ATTENDANCE MODE
            // ======================
            const embedding = await getEmbedding(rawPath);

            if (!embedding || embedding.length === 0) {
                throw new Error('Embedding generation failed');
            }

            const matched = processAttendance(embedding);

            if (matched.length === 0) {
                Alert.alert('Unknown Face', 'Face not recognized');
            } else {
                Alert.alert(
                    'Attendance',
                    `${matched.join(', ')} attendance marked`
                );
            }

            navigation.navigate('Home');
        } catch (error) {
            console.error('Preview error:', error);
            Alert.alert('Error', 'Failed to process face');
            setCollecting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>
                {mode === 'register'
                    ? 'Register Face'
                    : 'Mark Attendance'}
            </Text>

            <Image source={{ uri: imageUri }} style={styles.image} />

            {/* 🔹 Progress UI */}
            {mode === 'register' && collecting && (
                <Text style={styles.progressText}>
                    Capturing face data… {sampleCount} valid samples
                </Text>
            )}

            <TouchableOpacity
                style={[
                    styles.button,
                    collecting && styles.disabled,
                ]}
                onPress={handleContinue}
                disabled={collecting}
            >
                <Text style={styles.buttonText}>
                    {mode === 'register'
                        ? collecting
                            ? 'Hold Still…'
                            : 'Start Face Capture'
                        : 'Mark Attendance'}
                </Text>
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
    progressText: {
        color: '#00ff99',
        textAlign: 'center',
        marginTop: 12,
        fontSize: 14,
    },
    button: {
        marginTop: 16,
        backgroundColor: '#2563eb',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    disabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default PreviewScreen;
