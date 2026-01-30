import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import { detectFaces } from '../services/faceDetection';
import { cropFaceFromImage } from '../utils/faceCropper';
import { getEmbedding } from '../services/faceRecognition';
import { processAttendance } from '../services/attendanceService';

const TOTAL_FRAMES = 8;        // ✅ number of frames for registration
const FRAME_INTERVAL = 700;    // ms between frames

const CameraScreen = ({ navigation, route }: any) => {
    const { mode } = route.params;

    const camera = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    const [hasPermission, setHasPermission] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [progress, setProgress] = useState(0);

    // ---------------------------
    // Camera permission
    // ---------------------------
    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
    }, []);

    // ---------------------------
    // REGISTRATION: Multi-frame capture
    // ---------------------------
    const registerFace = async () => {
        if (!camera.current || capturing) return;

        setCapturing(true);
        setProgress(0);

        const embeddings: number[][] = [];

        try {
            for (let i = 0; i < TOTAL_FRAMES; i++) {
                const photo = await camera.current.takePhoto({ flash: 'off' });
                const imageUri = `file://${photo.path}`;

                const faces = await detectFaces(photo.path);
                if (!faces || faces.length === 0) continue;

                const face = faces[0];

                // 🟢 crop only face
                const croppedUri = await cropFaceFromImage(imageUri, face);

                const embedding = await getEmbedding(
                    croppedUri.replace('file://', '')
                );

                if (embedding && embedding.length > 0) {
                    embeddings.push(embedding);
                }

                setProgress(i + 1);
                await new Promise<void>(resolve => {
                    setTimeout(() => resolve(), FRAME_INTERVAL);
                });
            }

            if (embeddings.length < 3) {
                Alert.alert(
                    'Registration Failed',
                    'Face not captured clearly. Please try again.'
                );
                setCapturing(false);
                return;
            }

            // ✅ Average embeddings
            const avgEmbedding = averageEmbeddings(embeddings);

            navigation.navigate('Register', {
                embedding: avgEmbedding,
            });
        } catch (err) {
            console.error('Registration error:', err);
            Alert.alert('Error', 'Failed to register face');
        } finally {
            setCapturing(false);
        }
    };

    // ---------------------------
    // ATTENDANCE: Single capture
    // ---------------------------
    const markAttendance = async () => {
        if (!camera.current || capturing) return;

        setCapturing(true);

        try {
            const photo = await camera.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (!faces || faces.length === 0) {
                Alert.alert('No Face', 'Face not detected');
                return;
            }

            const face = faces[0];
            const croppedUri = await cropFaceFromImage(
                `file://${photo.path}`,
                face
            );

            const embedding = await getEmbedding(
                croppedUri.replace('file://', '')
            );

            const matched = processAttendance(embedding);

            if (matched.length === 0) {
                Alert.alert('Unknown Face', 'Face not recognized');
            } else {
                Alert.alert(
                    'Attendance',
                    `${matched.join(', ')} attendance marked`
                );
                navigation.navigate('Home');
            }
        } catch (err) {
            console.error('Attendance error:', err);
            Alert.alert('Error', 'Failed to mark attendance');
        } finally {
            setCapturing(false);
        }
    };

    if (!device || !hasPermission) {
        return (
            <View style={styles.center}>
                <Text>Camera not ready</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}
            />

            {/* Registration UI */}
            {mode === 'register' && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={registerFace}
                    disabled={capturing}
                >
                    <Text style={styles.buttonText}>
                        {capturing
                            ? `Capturing ${progress}/${TOTAL_FRAMES}`
                            : 'Register Face'}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Attendance UI */}
            {mode === 'attendance' && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={markAttendance}
                    disabled={capturing}
                >
                    <Text style={styles.buttonText}>
                        {capturing ? 'Processing...' : 'Mark Attendance'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

// ---------------------------
// Utils
// ---------------------------
const averageEmbeddings = (list: number[][]): number[] => {
    const length = list[0].length;
    const avg = new Array(length).fill(0);

    list.forEach(vec => {
        for (let i = 0; i < length; i++) {
            avg[i] += vec[i];
        }
    });

    return avg.map(v => v / list.length);
};

// ---------------------------
const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    button: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        backgroundColor: '#2563eb',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 30,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CameraScreen;
