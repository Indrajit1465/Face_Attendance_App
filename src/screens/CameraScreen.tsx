import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';

import { detectFaces } from '../services/faceDetection';
import { cropFaceFromImage } from '../utils/faceCropper';
import { getEmbedding } from '../services/faceRecognition';
import { averageEmbedding } from '../utils/averageEmbedding';
import { processAttendance } from '../services/attendanceService';

const EMBEDDING_SAMPLES = 8;
const MIN_BOX_SIZE = 80; // Phase 4 distance gate

const CameraScreen = ({ route, navigation }: any) => {
    const { mode } = route.params;

    const cameraRef = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    const [hasPermission, setHasPermission] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
    }, []);

    // ---------------------------------
    // PHASE 4: Select best usable face
    // ---------------------------------
    const selectBestFace = (faces: any[]) => {
        const validFaces = faces.filter(
            f => f.width >= MIN_BOX_SIZE && f.height >= MIN_BOX_SIZE
        );

        if (validFaces.length === 0) return null;

        return validFaces.sort((a, b) => {
            // Prefer larger face first
            const areaDiff =
                (b.width * b.height) - (a.width * a.height);
            if (Math.abs(areaDiff) > 2000) return areaDiff;

            // If similar size, prefer higher confidence
            return b.confidence - a.confidence;
        })[0];
    };

    // -----------------------------
    // REGISTRATION (PHASE 4)
    // -----------------------------
    const registerFace = async () => {
        if (!cameraRef.current || processing) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (!faces || faces.length === 0) {
                Alert.alert(
                    'Face not detected',
                    'Please face the camera clearly'
                );
                return;
            }

            const bestFace = selectBestFace(faces);

            if (!bestFace) {
                Alert.alert(
                    'Face too far',
                    'Please move slightly closer to the camera'
                );
                return;
            }

            const croppedUri = await cropFaceFromImage(
                `file://${photo.path}`,
                bestFace
            );

            const embeddings: number[][] = [];

            for (let i = 0; i < EMBEDDING_SAMPLES; i++) {
                const emb = await getEmbedding(
                    croppedUri.replace('file://', '')
                );
                if (emb && emb.length === 192) {
                    embeddings.push(emb);
                }
            }

            if (embeddings.length < 2) {
                Alert.alert(
                    'Face unstable',
                    'Face detected but embedding unstable. Try again.'
                );
                return;
            }

            const finalEmbedding = averageEmbedding(embeddings);

            navigation.navigate('Register', {
                embedding: finalEmbedding,
            });

        } catch (err) {
            console.error('Registration error:', err);
            Alert.alert('Error', 'Face registration failed');
        } finally {
            setProcessing(false);
        }
    };

    // -----------------------------
    // ATTENDANCE (PHASE 4)
    // -----------------------------
    const markAttendance = async () => {
        if (!cameraRef.current || processing) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (!faces || faces.length === 0) {
                Alert.alert('No Face', 'Face not detected');
                return;
            }

            const bestFace = selectBestFace(faces);

            if (!bestFace) {
                Alert.alert(
                    'Face too far',
                    'Please move slightly closer to the camera'
                );
                return;
            }

            const croppedUri = await cropFaceFromImage(
                `file://${photo.path}`,
                bestFace
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
            Alert.alert('Error', 'Attendance failed');
        } finally {
            setProcessing(false);
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
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}
            />

            {mode === 'register' && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={registerFace}
                    disabled={processing}
                >
                    <Text style={styles.buttonText}>
                        {processing ? 'Processing…' : 'Register Face'}
                    </Text>
                </TouchableOpacity>
            )}

            {mode === 'attendance' && (
                <TouchableOpacity
                    style={styles.button}
                    onPress={markAttendance}
                    disabled={processing}
                >
                    <Text style={styles.buttonText}>
                        {processing ? 'Processing…' : 'Mark Attendance'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    button: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        backgroundColor: '#2563eb',
        paddingVertical: 14,
        paddingHorizontal: 26,
        borderRadius: 30,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CameraScreen;
