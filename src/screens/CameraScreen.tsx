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
    const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
    const [viewDimensions, setViewDimensions] = useState({ width: 0, height: 0 });
    // Phase 9: Session State
    const [sessionAttendees, setSessionAttendees] = useState<Set<string>>(new Set());
    const [popupData, setPopupData] = useState<{ name: string, id: string } | null>(null);

    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 10 min limit
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
        setDetectedFaces([]); // Clear overlay
        setPopupData(null);
        setSessionAttendees(new Set());

        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);

        setProcessing(false);
    };

    const captureAndProcess = async () => {
        if (!isScanningRef.current) return;
        if (!cameraRef.current) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            // Phase 8.1: Square Transformation Logic
            let processedFaces: any[] = [];
            if (faces && faces.length > 0) {
                processedFaces = faces.map((f: any) => {
                    // 1. Convert to Square
                    const size = Math.max(f.width, f.height);
                    const paddedSize = size * 1.25; // 25% padding
                    const cx = f.x + f.width / 2;
                    const cy = f.y + f.height / 2;

                    // 2. Center and Clamp
                    let newX = cx - paddedSize / 2;
                    let newY = cy - paddedSize / 2;

                    // (Optional: Clamp to image bounds if needed, but view clipping handles it visually)

                    return {
                        ...f,
                        x: newX,
                        y: newY,
                        width: paddedSize,
                        height: paddedSize,
                        photoWidth: photo.width,
                        photoHeight: photo.height,
                        status: 'scanning' // default status
                    };
                });
                setDetectedFaces(processedFaces);
            } else {
                setDetectedFaces([]);
            }

            if (faces && faces.length > 0) {
                const bestFace = selectBestFace(faces);

                if (bestFace) {
                    try {
                        const croppedUri = await cropFaceFromImage(
                            `file://${photo.path}`,
                            bestFace
                        );

                        if (!croppedUri) throw new Error("Crop failed"); // Force catch

                        const embedding = await getEmbedding(
                            croppedUri.replace('file://', '')
                        );

                        const matched = processAttendance(embedding);

                        if (matched.length > 0) {
                            const user = matched[0]; // Now an object { name, id }
                            const userName = user.name;
                            const userId = user.id;

                            // Phase 9: Duplicate Check
                            if (sessionAttendees.has(userName)) {
                                console.log(`Duplicate skipped: ${userName}`);
                            } else {
                                console.log(`Attendance marked for: ${userName}`);

                                // Mark attendance
                                setSessionAttendees(prev => new Set(prev).add(userName));

                                // Show Popup (3.5s)
                                setPopupData({ name: userName, id: userId });
                                setTimeout(() => setPopupData(null), 3500);

                                // Green Box
                                setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));
                                setTimeout(() => setDetectedFaces([]), 3500);
                            }

                            // Continue scanning... (No stopScanning)
                        }
                    } catch (e) {
                        console.log('Silent fail: Crop/Embed error');
                    }
                }

            }
        } catch (err) {
            console.error('Scanning error:', err);
            setDetectedFaces([]);
        } finally {
            setProcessing(false);
        }

        if (isScanningRef.current) {
            scanTimerRef.current = setTimeout(captureAndProcess, 1000);
        }
    };

    const startScanning = () => {
        if (isScanningRef.current) return;

        setIsScanning(true);
        isScanningRef.current = true;
        setDetectedFaces([]); // Clear previous overlay
        setSessionAttendees(new Set()); // New session
        setPopupData(null);

        console.log('Capture cycle started (10 min session)');

        // Phase 9: 10 Minute Auto-Stop
        sessionTimerRef.current = setTimeout(() => {
            if (isScanningRef.current) {
                console.log('Session timeout (10 mins)');
                stopScanning();
                navigation.navigate('Home');
            }
        }, 10 * 60 * 1000); // 10 minutes

        captureAndProcess();
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
                onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    setViewDimensions({ width, height });
                }}
            />

            {/* Phase 9: Face Detection Overlay */}
            {detectedFaces.map((face, index) => {
                if (viewDimensions.width === 0 || !face.photoWidth) return null;

                // Scaling logic
                const scaleX = viewDimensions.width / face.photoWidth;
                const scaleY = viewDimensions.height / face.photoHeight;

                const isSuccess = face.status === 'success';

                // Phase 9.1: Hide overlay if not success (no yellow box)
                if (!isSuccess) return null;

                const borderColor = '#4ade80'; // Always green if visible

                // Phase 9.3: Fix Mirroring
                // If front camera, flip X coordinate
                const isFrontCam = device?.position === 'front';

                const scaledWidth = face.width * scaleX;
                const scaledHeight = face.height * scaleY;

                let leftPos = face.x * scaleX;
                if (isFrontCam) {
                    leftPos = viewDimensions.width - (leftPos + scaledWidth);
                }

                return (
                    <View
                        key={index}
                        style={{
                            position: 'absolute',
                            left: leftPos,
                            top: face.y * scaleY,
                            width: scaledWidth,
                            height: scaledHeight,
                            borderWidth: 4,
                            borderColor: borderColor,
                            zIndex: 10,
                            alignItems: 'center',
                        }}
                    >
                        {/* Confidence Label */}
                        {!isSuccess && (
                            <View style={{
                                position: 'absolute',
                                top: -25,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                paddingHorizontal: 6,
                                borderRadius: 4,
                            }}>
                                <Text style={{ color: '#fff', fontSize: 10 }}>
                                    {(face.confidence * 100).toFixed(0)}%
                                </Text>
                            </View>
                        )}
                    </View>
                );
            })}

            {/* Phase 9: Bottom Success Popup */}
            {popupData && (
                <View style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    padding: 20,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    borderTopWidth: 2,
                    borderTopColor: '#4ade80',
                    alignItems: 'center',
                    zIndex: 20,
                }}>
                    <Text style={{ color: '#4ade80', fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
                        Attendance Marked
                    </Text>
                    <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
                        {popupData.name}
                    </Text>
                    <Text style={{ color: '#ccc', fontSize: 14, marginTop: 5 }}>
                        {popupData.id}
                    </Text>
                </View>
            )}

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
