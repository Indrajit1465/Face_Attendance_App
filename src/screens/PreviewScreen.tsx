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
import { getEmbedding } from '../services/faceRecognition';
import { processAttendance } from '../services/attendanceService';

const PreviewScreen = ({ route, navigation }: any) => {
    const { imageUri, mode } = route.params;

    const [loading, setLoading] = useState(false);

    const handleContinue = async () => {
        try {
            setLoading(true);

            // 🔑 IMPORTANT: use FACE-ONLY image
            const rawPath = imageUri.replace('file://', '');

            // 1️⃣ Generate embedding
            const embedding = await getEmbedding(rawPath);

            if (!embedding || embedding.length === 0) {
                Alert.alert('Error', 'Failed to generate face embedding');
                return;
            }

            // 2️⃣ Decide based on mode
            if (mode === 'register') {
                // ➜ Go to register employee screen
                navigation.navigate('Register', {
                    embedding,
                });
            } else {
                // ➜ Attendance flow
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
            }
        } catch (error) {
            console.error('Preview error:', error);
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Face Preview</Text>

            <Image source={{ uri: imageUri }} style={styles.image} />

            <TouchableOpacity
                style={styles.button}
                onPress={handleContinue}
                disabled={loading}
            >
                <Text style={styles.buttonText}>
                    {loading
                        ? 'Processing...'
                        : mode === 'register'
                            ? 'Continue to Register'
                            : 'Mark Attendance'}
                </Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator size="large" color="#2563eb" />}
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
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default PreviewScreen;
