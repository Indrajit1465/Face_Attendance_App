import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Image,
    TouchableOpacity, Alert,
} from 'react-native';
import { getEmbedding } from '../services/faceRecognition';
import { averageEmbedding } from '../utils/averageEmbedding';
import { cosineSimilarity } from '../utils/cosineSimilarity';

// ─────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────
const REQUIRED_SAMPLES = 8;
const MIN_VALID_SAMPLES = 5;
const SAMPLE_DELAY_MS = 700;
const MIN_PAIRWISE_SIM = 0.82;  // ✅ consistent with SIMILARITY_THRESHOLD

// ─────────────────────────────────────────────────────
// Path helper — consistent with rest of pipeline
// ─────────────────────────────────────────────────────
const stripFilePrefix = (uri: string): string =>
    uri.startsWith('file://') ? uri.slice(7) : uri;

const PreviewScreen = ({ route, navigation }: any) => {
    const { imageUri, mode } = route.params;

    const [collecting, setCollecting] = useState(false);
    const [sampleCount, setSampleCount] = useState(0);
    const embeddingsRef = useRef<number[][]>([]);

    const handleContinue = async () => {
        try {
            const rawPath = stripFilePrefix(imageUri);  // ✅ safe strip

            // ══════════════════════════════════════════
            // REGISTRATION MODE
            // ══════════════════════════════════════════
            if (mode === 'register') {
                if (collecting) return;

                setCollecting(true);
                embeddingsRef.current = [];
                setSampleCount(0);

                // ⚠️ IMPORTANT: This screen receives a STATIC image URI.
                // Calling getEmbedding() on the same image N times produces
                // identical embeddings every time (model is deterministic).
                //
                // ✅ For real multi-sample registration, use CameraScreen.tsx
                //    in 'register' mode — it captures live frames.
                //
                // This screen is only valid for single-shot registration
                // (one image → one embedding). The loop below is kept for
                // backward compatibility but effectively captures 1 unique embedding.

                for (let i = 0; i < REQUIRED_SAMPLES; i++) {
                    const embedding = await getEmbedding(rawPath);

                    // ✅ Null-safe — getEmbedding now returns number[] | null
                    if (!embedding || embedding.length === 0) {
                        console.warn('[PreviewScreen] getEmbedding returned null — skipping');
                        continue;
                    }

                    // ✅ Remove norm check — Java already normalizes.
                    //    Use pairwise similarity instead (added below after loop).
                    embeddingsRef.current.push(embedding);
                    setSampleCount(embeddingsRef.current.length);

                    if (i < REQUIRED_SAMPLES - 1) {
                        await new Promise<void>(resolve =>
                            setTimeout(resolve, SAMPLE_DELAY_MS)
                        );
                    }
                }

                // ✅ Not enough valid embeddings
                if (embeddingsRef.current.length < MIN_VALID_SAMPLES) {
                    setCollecting(false);
                    Alert.alert(
                        'Registration Failed',
                        'Not enough valid face samples. Please try again in better lighting.'
                    );
                    return;
                }

                // ✅ Pairwise consistency check (replaces useless norm check)
                let stabilitySum = 0;
                let pairs = 0;

                for (let i = 0; i < embeddingsRef.current.length; i++) {
                    for (let j = i + 1; j < embeddingsRef.current.length; j++) {
                        const sim = cosineSimilarity(
                            embeddingsRef.current[i],
                            embeddingsRef.current[j]
                        );

                        if (sim === null) {
                            setCollecting(false);
                            Alert.alert('Registration Failed',
                                'Invalid embedding detected. Please try again.');
                            return;
                        }

                        stabilitySum += sim;
                        pairs++;
                    }
                }

                const avgStability = pairs > 0 ? stabilitySum / pairs : 0;
                console.log(`[PreviewScreen] Pairwise similarity: ${avgStability.toFixed(4)}`);

                if (avgStability < MIN_PAIRWISE_SIM) {
                    setCollecting(false);
                    Alert.alert(
                        'Registration Unstable',
                        `Face consistency too low (${avgStability.toFixed(2)}). ` +
                        'Please ensure good lighting and keep your face steady.'
                    );
                    return;
                }

                // ✅ Null-safe averageEmbedding call
                const finalEmbedding = averageEmbedding(embeddingsRef.current);

                if (!finalEmbedding) {
                    setCollecting(false);
                    Alert.alert(
                        'Registration Failed',
                        'Could not compute a stable face template. Please try again.'
                    );
                    return;
                }

                setCollecting(false);
                navigation.navigate('Register', { embedding: finalEmbedding });
                return;
            }

            // ══════════════════════════════════════════
            // ATTENDANCE MODE
            // ══════════════════════════════════════════
            // ⚠️ Single-frame attendance from a static image is unreliable.
            //    This mode is kept for backward compat but the recommended
            //    path is CameraScreen.tsx in 'attendance' mode which uses
            //    the 3-of-5 rolling buffer + SIMILARITY_THRESHOLD = 0.82.
            //
            // ✅ Redirecting to CameraScreen attendance mode is strongly recommended.
            Alert.alert(
                'Use Live Camera',
                'For accurate attendance marking, please use the live camera mode from the Home screen.',
                [
                    {
                        text: 'Go to Home',
                        onPress: () => navigation.navigate('Home'),
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                ]
            );

        } catch (error) {
            console.error('[PreviewScreen] Error:', error);
            Alert.alert('Error', 'Failed to process face');
            setCollecting(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>
                {mode === 'register' ? 'Register Face' : 'Mark Attendance'}
            </Text>

            <Image source={{ uri: imageUri }} style={styles.image} />

            {mode === 'register' && collecting && (
                <Text style={styles.progressText}>
                    Capturing face data… {sampleCount} / {REQUIRED_SAMPLES} samples
                </Text>
            )}

            {/* ✅ Warning banner — remind user this is a static image path */}
            {mode === 'register' && !collecting && (
                <Text style={styles.warningText}>
                    ⚠️ For best results, use live camera registration from Home screen
                </Text>
            )}

            <TouchableOpacity
                style={[styles.button, collecting && styles.disabled]}
                onPress={handleContinue}
                disabled={collecting}
            >
                <Text style={styles.buttonText}>
                    {mode === 'register'
                        ? collecting ? 'Hold Still…' : 'Start Face Capture'
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
        fontWeight: 'bold',
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
    warningText: {
        color: '#eab308',
        textAlign: 'center',
        marginTop: 8,
        fontSize: 12,
        paddingHorizontal: 16,
    },
    button: {
        marginTop: 16,
        backgroundColor: '#2563eb',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    disabled: { opacity: 0.6 },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default PreviewScreen;