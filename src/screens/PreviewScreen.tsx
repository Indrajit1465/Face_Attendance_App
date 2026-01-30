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

// 🔧 Multi-frame registration settings
const REQUIRED_SAMPLES = 8;
const SAMPLE_DELAY_MS = 700;

const PreviewScreen = ({ route, navigation }: any) => {
    const { imageUri, mode } = route.params;

    const [collecting, setCollecting] = useState(false);
    const [sampleCount, setSampleCount] = useState(0);

    // 🔒 Store multiple embeddings safely
    const embeddingsRef = useRef<number[][]>([]);

    // 🧮 Average embeddings utility
    const averageEmbedding = (embeddings: number[][]): number[] => {
        const length = embeddings[0].length;
        const avg = new Array(length).fill(0);

        for (const emb of embeddings) {
            for (let i = 0; i < length; i++) {
                avg[i] += emb[i];
            }
        }

        for (let i = 0; i < length; i++) {
            avg[i] /= embeddings.length;
        }

        return avg;
    };

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
                        Alert.alert('Error', 'Failed to capture face embedding');
                        setCollecting(false);
                        return;
                    }

                    embeddingsRef.current.push(embedding);
                    setSampleCount(i + 1);

                    // ⏱ Small delay between samples
                    if (i < REQUIRED_SAMPLES - 1) {
                        await new Promise<void>(resolve => {
                            setTimeout(() => resolve(), SAMPLE_DELAY_MS);
                        });
                    }
                }

                // 🧠 Create strong averaged embedding
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
                Alert.alert('Error', 'Failed to generate face embedding');
                return;
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
            Alert.alert('Error', 'Something went wrong');
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

            {/* 🔹 Progress UI (clean, text-based) */}
            {mode === 'register' && collecting && (
                <Text style={styles.progressText}>
                    Capturing face data… {sampleCount} / {REQUIRED_SAMPLES}
                </Text>
            )}

            <TouchableOpacity
                style={[
                    styles.button,
                    collecting && { opacity: 0.6 },
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
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default PreviewScreen;
