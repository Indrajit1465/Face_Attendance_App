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
const MIN_BOX_SIZE = 80;

const CameraScreen = ({ route, navigation }: any) => {
    const { mode } = route.params;

    const cameraRef = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    const [hasPermission, setHasPermission] = useState(false);
    const [processing, setProcessing] = useState(false);

    const [isScanning, setIsScanning] = useState(false);
    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isScanningRef = useRef(false);

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
    }, []);

    useEffect(() => {
        return () => {
            stopScanning();
        };
    }, []);

    const selectBestFace = (faces: any[]) => {
        const validFaces = faces.filter(
            f => f.width >= MIN_BOX_SIZE && f.height >= MIN_BOX_SIZE
        );

        if (validFaces.length === 0) return null;

        return validFaces.sort((a, b) => {
            const areaDiff =
                (b.width * b.height) - (a.width * a.height);
            if (Math.abs(areaDiff) > 2000) return areaDiff;

            return b.confidence - a.confidence;
        })[0];
    };

    // -----------------------------
    // REGISTRATION
    // -----------------------------
    const registerFace = async () => {
        if (!cameraRef.current || processing) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (!faces || faces.length === 0) {
                Alert.alert('Face not detected', 'Please face the camera clearly');
                return;
            }

            const bestFace = selectBestFace(faces);

            if (!bestFace) {
                Alert.alert('Face too far', 'Please move closer to the camera');
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
                Alert.alert('Face unstable', 'Try again');
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
    // LIVE ATTENDANCE
    // -----------------------------
    const stopScanning = () => {
        setIsScanning(false);
        isScanningRef.current = false;

        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);

        setProcessing(false);
    };

    const startScanning = () => {
        if (isScanningRef.current) return;

        setIsScanning(true);
        isScanningRef.current = true;

        safetyTimerRef.current = setTimeout(() => {
            if (isScanningRef.current) {
                Alert.alert('Timeout', 'No face matched in 15 seconds.');
                stopScanning();
            }
        }, 15000);

        captureAndProcess();
    };

    const captureAndProcess = async () => {
        if (!isScanningRef.current) return;
        if (!cameraRef.current) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (faces && faces.length > 0) {
                const bestFace = selectBestFace(faces);

                if (bestFace) {
                    const croppedUri = await cropFaceFromImage(
                        `file://${photo.path}`,
                        bestFace
                    );

                    const embedding = await getEmbedding(
                        croppedUri.replace('file://', '')
                    );

                    const matched = processAttendance(embedding);

                    if (matched.length > 0) {
                        Alert.alert(
                            'Attendance',
                            `${matched.join(', ')} attendance marked`
                        );
                        stopScanning();
                        navigation.navigate('Home');
                        return;
                    }
                }
            }

        } catch (err) {
            console.error('Scanning error:', err);
        } finally {
            setProcessing(false);
        }

        if (isScanningRef.current) {
            scanTimerRef.current = setTimeout(captureAndProcess, 1500);
        }
    };

    useEffect(() => {
        if (mode === 'attendance') {
            const timer = setTimeout(() => {
                startScanning();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [mode]);

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
                <View style={{ position: 'absolute', bottom: 40, alignSelf: 'center', alignItems: 'center' }}>
                    <Text style={{ color: 'white', marginBottom: 10, fontSize: 16, fontWeight: 'bold' }}>
                        Scanning...
                    </Text>
                </View>
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
