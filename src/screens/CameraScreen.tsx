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
import { processMultiAttendance } from '../services/attendanceService'; // Updated to multi-attendance
import { markAttendance } from '../database/attendanceRepo';
import { cosineSimilarity } from '../utils/cosineSimilarity'; // Phase 14: Registration Cohesion
const MIN_BOX_SIZE = 100; // Phase 14: Increased stability gate

const CameraScreen = ({ route, navigation }: any) => {
    const { mode } = route.params;

    const cameraRef = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    const [hasPermission, setHasPermission] = useState(false);
    const [processing, setProcessing] = useState(false);

    const [detectedFaces, setDetectedFaces] = useState<any[]>([]);
    const [viewDimensions, setViewDimensions] = useState({ width: 0, height: 0 });

    const recentScans = useRef<Map<string, number>>(new Map());
    const [popupData, setPopupData] = useState<{ name: string; id: string; type?: 'success' | 'warning' | 'error'; message?: string } | null>(null);

    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Phase 12.3: Recognition State Machine
    const recognitionBuffer = useRef<Array<'unknown' | { name: string, id: string }>>([]);
    const lastRecognizedUser = useRef<string | null>(null);
    const lastRecognizedTime = useRef<number>(0);
    const nullStreak = useRef<number>(0);
    const UNKNOWN_STREAK_THRESHOLD = 5;
    const PROTECTION_WINDOW = 6000; // 6 seconds hysteresis
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
            const areaDiff = (b.width * b.height) - (a.width * a.height);
            if (Math.abs(areaDiff) > 2000) return areaDiff;
            return b.confidence - a.confidence;
        })[0];
    };

    const registerFace = async () => {
        if (!cameraRef.current || processing) return;
        setProcessing(true);
        try {
            // Phase 13.3: Multi-angle registration prompt
            Alert.alert(
                'Registration Started',
                'Please look straight, then slightly turn your head left and right while we capture 5 frames.',
                [{ text: 'Start' }]
            );

            // Wait a brief moment for user to read before snapping begins
            await new Promise(resolve => setTimeout(() => resolve(true), 1500));

            const embeddings: number[][] = [];
            let attempts = 0;
            const MAX_ATTEMPTS = 15; // Give them some leeway if frames are blurry
            const TARGET_SAMPLES = 5;

            while (embeddings.length < TARGET_SAMPLES && attempts < MAX_ATTEMPTS) {
                attempts++;
                const photo = await cameraRef.current.takePhoto({ flash: 'off' });
                const faces = await detectFaces(photo.path);

                if (!faces || faces.length === 0) continue;

                const bestFace = selectBestFace(faces);
                if (!bestFace) continue;

                // Phase 13.4 & 14.6: Quality Guard - Reject tiny faces dynamically
                if (bestFace.width < MIN_BOX_SIZE || bestFace.height < MIN_BOX_SIZE) {
                    console.log(`Frame rejected: Face too small (${bestFace.width}x${bestFace.height})`);
                    continue;
                }

                const croppedUri = await cropFaceFromImage(`file://${photo.path}`, bestFace);
                const emb = await getEmbedding(croppedUri.replace('file://', ''));

                if (emb && emb.length === 192) {
                    embeddings.push(emb);
                    // Optional: Visual feedback or vibration could go here to indicate a successful frame
                    console.log(`Captured frame ${embeddings.length}/${TARGET_SAMPLES}`);
                }

                // Small delay between frames to capture actual variation/movement
                await new Promise(resolve => setTimeout(() => resolve(true), 300));
            }

            if (embeddings.length < TARGET_SAMPLES) {
                Alert.alert('Registration Failed', 'Could not capture enough high-quality frames. Please try again in good lighting.');
                return;
            }

            // Phase 14.4: Registration Quality - Intra-person similarity
            let stabilitySum = 0;
            let pairs = 0;
            for (let i = 0; i < embeddings.length; i++) {
                for (let j = i + 1; j < embeddings.length; j++) {
                    stabilitySum += cosineSimilarity(embeddings[i], embeddings[j]);
                    pairs++;
                }
            }
            const avgStability = stabilitySum / pairs;
            console.log(`[BIOMETRIC AUDIT] Registration Intra-Person Similarity: ${avgStability.toFixed(4)}`);

            if (avgStability < 0.75) {
                Alert.alert('Registration Unstable', 'Too much variance during capture (blur or poor lighting). Please try again.');
                return;
            }

            const finalEmbedding = averageEmbedding(embeddings);
            navigation.navigate('Register', { embedding: finalEmbedding });
        } catch (err) {
            console.error('Registration error:', err);
            Alert.alert('Error', 'Face registration failed');
        } finally {
            setProcessing(false);
        }
    };

    const stopScanning = () => {
        isScanningRef.current = false;
        setDetectedFaces([]);
        setPopupData(null);
        recentScans.current.clear();
        recognitionBuffer.current = [];
        lastRecognizedUser.current = null;
        lastRecognizedTime.current = 0;
        nullStreak.current = 0;
        nullStreak.current = 0;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
        setProcessing(false);
    };

    const captureAndProcess = async () => {
        if (!isScanningRef.current || !cameraRef.current) return;

        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const faces = await detectFaces(photo.path);

            if (!faces || faces.length === 0) {
                // Phase 12.4: Immediate overlay clearing & faster retry
                setDetectedFaces([]);
                setProcessing(false);
                if (isScanningRef.current) scanTimerRef.current = setTimeout(captureAndProcess, 500);
                return;
            }

            // 1. Prepare UI Bounding Boxes
            const processedFaces = faces.map((f: any) => {
                const size = Math.max(f.width, f.height);
                const paddedSize = size * 1.25;
                return {
                    ...f,
                    x: f.x + f.width / 2 - paddedSize / 2,
                    y: f.y + f.height / 2 - paddedSize / 2,
                    width: paddedSize,
                    height: paddedSize,
                    photoWidth: photo.width,
                    photoHeight: photo.height,
                    status: 'scanning'
                };
            });
            setDetectedFaces(processedFaces);

            // 2. Multi-Face Processing Loop
            const detectedEmbeddings: number[][] = [];

            // We limit to top 4 faces to prevent performance lag on the main thread
            const facesToProcess = faces.slice(0, 4);

            for (const face of facesToProcess) {
                try {
                    const croppedUri = await cropFaceFromImage(`file://${photo.path}`, face);
                    if (croppedUri) {
                        const emb = await getEmbedding(croppedUri.replace('file://', ''));
                        if (emb && emb.length === 192) {
                            detectedEmbeddings.push(emb);
                        }
                    }
                } catch (e) {
                    console.log('Individual crop/embed error', e);
                }
            }

            // 3. Match Embeddings against DB
            const matches = processMultiAttendance(detectedEmbeddings);

            if (matches.length > 0) {
                const user = matches[matches.length - 1];
                recognitionBuffer.current.push(user);
            } else {
                recognitionBuffer.current.push('unknown');
            }

            // Keep buffer at max 5
            if (recognitionBuffer.current.length > 5) {
                recognitionBuffer.current.shift();
            }

            // --- Phase 12.3: Evaluation Logic ---
            const buf = recognitionBuffer.current;

            // Count recent matches
            const userCounts = new Map<string, { id: string, count: number }>();

            buf.forEach(item => {
                if (item !== 'unknown') {
                    const existing = userCounts.get(item.name);
                    userCounts.set(item.name, { id: item.id, count: (existing?.count || 0) + 1 });
                }
            });

            // Find best matching user (if any have >= 3 votes)
            let confirmedUser: { name: string, id: string } | null = null;
            for (const [name, data] of userCounts.entries()) {
                if (data.count >= 3) {
                    confirmedUser = { name, id: data.id };
                    break;
                }
            }

            const now = Date.now();
            const inProtectionWindow = (now - lastRecognizedTime.current) < PROTECTION_WINDOW;

            if (confirmedUser) {
                // CASE A: Confirmed Match
                lastRecognizedUser.current = confirmedUser.name;
                lastRecognizedTime.current = now;
                nullStreak.current = 0; // Reset streak on confirmed identity

                const { name, id } = confirmedUser;

                // Phase 12.4: Success UI Lock Window
                // Do not re-evaluate attendance or UI if we are in the 2/3s lock
                const lastScanTime = recentScans.current.get(name) || 0;

                if (now - lastScanTime > 2000) {
                    recentScans.current.set(name, now);

                    // Defer DB call until we have a confirmed match
                    const finalStatus = markAttendance(id, name);

                    if (finalStatus === 'ignored') {
                        console.log(`Repo Ignored (Too soon): ${name}`);

                        // Phase 12.1: Show "Already Marked" warning popup
                        setPopupData({
                            name: name,
                            id: id,
                            type: 'warning',
                            message: 'Attendance already marked'
                        });
                        setTimeout(() => setPopupData(null), 2000);

                        // Keep box green to confirm recognition
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));

                    } else {
                        console.log(`Action: ${finalStatus} for ${name}`);

                        const isExit = finalStatus === 'checkout';

                        // Show Popup (3s lock duration)
                        setPopupData({
                            name: name,
                            id: id,
                            type: 'success',
                            message: isExit ? 'Exit Marked' : 'Attendance Marked'
                        });
                        setTimeout(() => setPopupData(null), 2000);

                        // Green Box
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));
                    }
                }

                // Clear buffer to require a completely fresh 3/5 votes for the NEXT person
                recognitionBuffer.current = [];

            } else {
                // Determine if we should count this frame as 'unknown'
                const lastFrameUnknown = buf.length > 0 && buf[buf.length - 1] === 'unknown';
                if (lastFrameUnknown) {
                    nullStreak.current++;
                }

                if (!inProtectionWindow && nullStreak.current >= UNKNOWN_STREAK_THRESHOLD) {
                    // CASE C: True Unknown Person
                    console.log(`True Unknown confirmed - ${nullStreak.current} consecutive nulls outside protection window.`);
                    setPopupData({ name: 'Unknown', id: 'Not Registered', type: 'error' });

                    setTimeout(() => {
                        setPopupData(prev => prev?.type === 'error' ? null : prev);
                    }, 2000);

                    // Clear buffer and reset streak so it doesn't instantly re-trigger on next frame
                    recognitionBuffer.current = [];
                    nullStreak.current = 0;
                } else {
                    // CASE B: Identity Persistence (Hysteresis) or Unstable
                    // Inside protection window, or building up to the null streak threshold
                    console.log(`Frame ignored (State: Protected or Hysteresis active) - nullStreak: ${nullStreak.current}`);
                }
            }
        } catch (err) {
            console.error('Scanning error:', err);
            setDetectedFaces([]);
        } finally {
            setProcessing(false);
        }

        if (isScanningRef.current) {
            // Phase 12.4: Faster detection loop
            scanTimerRef.current = setTimeout(captureAndProcess, 500);
        }
    };

    const startScanning = () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        setDetectedFaces([]);
        setPopupData(null);
        recentScans.current.clear();
        recognitionBuffer.current = [];
        lastRecognizedUser.current = null;
        lastRecognizedTime.current = 0;
        sessionTimerRef.current = setTimeout(() => {
            if (isScanningRef.current) {
                stopScanning();
                navigation.navigate('Home');
            }
        }, 10 * 60 * 1000);
        captureAndProcess();
    };

    // Start scanning effect separated for specific trigger mode checks.
    useEffect(() => {
        if (mode === 'attendance') {
            const timer = setTimeout(() => {
                startScanning();
            }, 500);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

            {detectedFaces.map((face, index) => {
                if (viewDimensions.width === 0 || !face.photoWidth) return null;
                const scaleX = viewDimensions.width / face.photoWidth;
                const scaleY = viewDimensions.height / face.photoHeight;
                const isSuccess = face.status === 'success';
                const borderColor = isSuccess ? '#4ade80' : 'yellow';
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
                    borderTopColor: popupData.type === 'success' ? '#4ade80' : popupData.type === 'warning' ? '#eab308' : '#ef4444', // Green, Yellow, or Red
                    alignItems: 'center',
                    zIndex: 20,
                }}>
                    <Text style={{
                        color: popupData.type === 'success' ? '#4ade80' : popupData.type === 'warning' ? '#eab308' : '#ef4444',
                        fontSize: 18,
                        fontWeight: 'bold',
                        marginBottom: 5
                    }}>
                        {popupData.message || (popupData.type === 'error' ? 'Not Registered' : 'Attendance')}
                    </Text>
                    {(popupData.type === 'success' || popupData.type === 'warning') && (
                        <>
                            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
                                {popupData.name}
                            </Text>
                            <Text style={{ color: '#ccc', fontSize: 14, marginTop: 5 }}>
                                {popupData.id}
                            </Text>
                        </>
                    )}
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