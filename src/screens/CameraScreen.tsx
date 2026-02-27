import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';

import { detectFaces } from '../services/faceDetection';
import { cropFaceFromImage } from '../utils/faceCropper';
import { getEmbedding } from '../services/faceRecognition';
import { averageEmbedding } from '../utils/averageEmbedding';
import { processMultiAttendance } from '../services/attendanceService';
import { markAttendance } from '../database/attendanceRepo';
import { cosineSimilarity } from '../utils/cosineSimilarity';

const EXPECTED_EMBEDDING_SIZE = 192;
const MIN_BOX_SIZE = 120;

// ✅ Safe file:// prefix normalization — prevents double-prefix on some RN versions
const normalizePhotoPath = (path: string): string =>
    path.startsWith('file://') ? path : `file://${path}`;

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
    const [popupData, setPopupData] = useState<{
        name: string; id: string;
        type?: 'success' | 'warning' | 'error';
        message?: string;
    } | null>(null);

    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const recognitionBuffer = useRef<Array<'unknown' | { name: string; id: string }>>([]);
    const lastRecognizedUser = useRef<string | null>(null);
    const lastRecognizedTime = useRef<number>(0);
    const nullStreak = useRef<number>(0);
    const isScanningRef = useRef(false);

    const UNKNOWN_STREAK_THRESHOLD = 5;
    const PROTECTION_WINDOW = 6000;

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
    }, []);

    useEffect(() => {
        return () => { stopScanning(); };
    }, []);

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    // ✅ Replace existing selectBestFace with this version:
    const selectBestFace = (faces: any[], minSize: number = MIN_BOX_SIZE) => {
        const valid = faces.filter(f => f.width >= minSize && f.height >= minSize);
        if (valid.length === 0) return null;
        return valid.sort((a, b) => {
            const areaDiff = (b.width * b.height) - (a.width * a.height);
            if (Math.abs(areaDiff) > 2000) return areaDiff;
            return b.confidence - a.confidence;
        })[0];
    };

    // ─────────────────────────────────────────────
    // REGISTRATION FLOW
    // ─────────────────────────────────────────────

    const registerFace = async () => {
        if (!cameraRef.current || processing) return;
        setProcessing(true);

        try {
            Alert.alert(
                'Registration Started',
                'Look straight ahead, then slightly turn left and right while we capture frames.',
                [{ text: 'Start' }]
            );
            await new Promise(resolve => setTimeout(() => resolve(undefined), 1500));

            const embeddings: number[][] = [];
            let attempts = 0;
            const MAX_ATTEMPTS = 15;
            const TARGET_SAMPLES = 5;

            // ✅ Single loop — debug logs are INSIDE, not after
            while (embeddings.length < TARGET_SAMPLES && attempts < MAX_ATTEMPTS) {
                attempts++;
                console.log(`\n[REG DEBUG] ── Attempt ${attempts}/${MAX_ATTEMPTS} ──`);

                // ── Step 1: Take photo ───────────────────────────────
                const photo = await cameraRef.current.takePhoto({ flash: 'off' });
                const photoUri = normalizePhotoPath(photo.path);
                console.log(`[REG DEBUG] Photo size: ${photo.width}×${photo.height}`);
                console.log(`[REG DEBUG] Photo URI: ${photoUri}`);

                // ── Step 2: Detect faces ─────────────────────────────
                const faces = await detectFaces(photoUri, 0.50); // ✅ softer threshold for registration
                console.log(`[REG DEBUG] Faces detected: ${faces?.length ?? 0}`);

                if (!faces || faces.length === 0) {
                    console.log(`[REG DEBUG] ❌ REJECTED at Step 2: No faces detected`);
                    continue;
                }

                // Log all detected faces
                faces.forEach((f: any, i: number) => {
                    console.log(`[REG DEBUG]   Face[${i}]: ${f.width.toFixed(0)}×${f.height.toFixed(0)} conf=${(f.confidence * 100).toFixed(1)}%`);
                });

                // ── Step 3: Select best face ─────────────────────────
                const bestFace = selectBestFace(faces, 80); // ✅ softer MIN_BOX_SIZE for registration
                console.log(`[REG DEBUG] Best face selected: ${JSON.stringify(bestFace)}`);

                if (!bestFace) {
                    console.log(`[REG DEBUG] ❌ REJECTED at Step 3: selectBestFace returned null (all faces < 80px)`);
                    continue;
                }

                // ── Step 4: Crop face ────────────────────────────────
                const croppedUri = await cropFaceFromImage(
                    photoUri,
                    bestFace,
                    { width: photo.width, height: photo.height }
                );
                console.log(`[REG DEBUG] Crop result: ${croppedUri ?? 'NULL'}`);

                if (!croppedUri) {
                    console.log(`[REG DEBUG] ❌ REJECTED at Step 4: cropFaceFromImage returned null`);
                    continue;
                }

                // ── Step 5: Get embedding ────────────────────────────
                const emb = await getEmbedding(croppedUri.replace('file://', ''));
                console.log(`[REG DEBUG] Embedding: length=${emb?.length ?? 'null'}, expected=${EXPECTED_EMBEDDING_SIZE}`);

                if (!emb) {
                    console.log(`[REG DEBUG] ❌ REJECTED at Step 5: getEmbedding returned null`);
                    continue;
                }

                if (emb.length !== EXPECTED_EMBEDDING_SIZE) {
                    console.log(`[REG DEBUG] ❌ REJECTED at Step 5: Wrong size ${emb.length} ≠ ${EXPECTED_EMBEDDING_SIZE}`);
                    console.log(`[REG DEBUG] 👉 FIX: Change EXPECTED_EMBEDDING_SIZE to ${emb.length}`);
                    continue;
                }

                // ── Step 6: Accepted ─────────────────────────────────
                embeddings.push(emb);
                console.log(`[REG DEBUG] ✅ ACCEPTED: ${embeddings.length}/${TARGET_SAMPLES} embeddings collected`);

                await new Promise(resolve => setTimeout(() => resolve(undefined), 300));
            }

            // ── Final summary ────────────────────────────────────────
            console.log(`\n[REG DEBUG] ════ LOOP COMPLETE ════`);
            console.log(`[REG DEBUG] Collected: ${embeddings.length}/${TARGET_SAMPLES}`);
            console.log(`[REG DEBUG] Attempts used: ${attempts}/${MAX_ATTEMPTS}`);

            if (embeddings.length < TARGET_SAMPLES) {
                console.log(`[REG DEBUG] ❌ FAILED: Not enough embeddings`);
                console.log(`[REG DEBUG] Check logs above for which Step keeps firing ❌`);
                Alert.alert(
                    'Registration Failed',
                    'Could not capture enough high-quality frames. Please try again in good lighting.'
                );
                return;
            }

            // ── Pairwise stability check ─────────────────────────────
            console.log(`\n[REG DEBUG] Running pairwise stability check...`);
            let stabilitySum = 0;
            let pairs = 0;

            for (let i = 0; i < embeddings.length; i++) {
                for (let j = i + 1; j < embeddings.length; j++) {
                    const sim = cosineSimilarity(embeddings[i], embeddings[j]);

                    if (sim === null) {
                        console.log(`[REG DEBUG] ❌ FAILED: null similarity between frames ${i} and ${j}`);
                        Alert.alert('Registration Failed', 'An invalid frame was detected. Please try again.');
                        return;
                    }

                    console.log(`[REG DEBUG] Pair (${i},${j}) similarity: ${sim.toFixed(4)}`);
                    stabilitySum += sim;
                    pairs++;
                }
            }

            const avgStability = stabilitySum / pairs;
            console.log(`[REG DEBUG] Avg pairwise similarity: ${avgStability.toFixed(4)}`);
            console.log(`[REG DEBUG] Stability threshold: 0.75`);

            if (avgStability < 0.75) {  // ✅ Lowered from 0.82 → 0.75 for multi-angle enrollment
                console.log(`[REG DEBUG] ❌ FAILED: Stability too low (${avgStability.toFixed(4)} < 0.75)`);
                Alert.alert(
                    'Registration Unstable',
                    `Frame consistency too low (${avgStability.toFixed(2)}). ` +
                    'Please ensure good lighting and keep your face steady.'
                );
                return;
            }

            console.log(`[REG DEBUG] ✅ Stability check passed`);

            // ── Average embedding ────────────────────────────────────
            const finalEmbedding = averageEmbedding(embeddings);

            if (!finalEmbedding) {
                console.log(`[REG DEBUG] ❌ FAILED: averageEmbedding returned null`);
                Alert.alert('Registration Failed',
                    'Could not compute a stable face template. Please try again in better lighting.');
                return;
            }

            console.log(`[REG DEBUG] ✅ Final embedding computed (${finalEmbedding.length}D) — navigating to Register`);
            navigation.navigate('Register', { embedding: finalEmbedding });

        } catch (err) {
            console.error('[Registration] Error:', err);
            Alert.alert('Error', 'Face registration failed');
        } finally {
            setProcessing(false);
        }
    };

    // ─────────────────────────────────────────────
    // SCANNING FLOW
    // ─────────────────────────────────────────────

    const stopScanning = () => {
        isScanningRef.current = false;
        recognitionBuffer.current = [];
        lastRecognizedUser.current = null;
        lastRecognizedTime.current = 0;
        nullStreak.current = 0;
        setDetectedFaces([]);
        setPopupData(null);
        recentScans.current.clear();
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
        setProcessing(false);
    };

    const captureAndProcess = async () => {
        if (!isScanningRef.current || !cameraRef.current) return;
        setProcessing(true);

        try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            const photoUri = normalizePhotoPath(photo.path); // ✅ safe prefix

            const faces = await detectFaces(photoUri);       // ✅ was detectFaces(photo.path)

            if (!faces || faces.length === 0) {
                setDetectedFaces([]);
                setProcessing(false);
                if (isScanningRef.current) scanTimerRef.current = setTimeout(captureAndProcess, 500);
                return;
            }

            // UI bounding boxes
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
                    status: 'scanning',
                };
            });
            setDetectedFaces(processedFaces);

            // Embed top 4 faces
            const detectedEmbeddings: number[][] = [];
            const facesToProcess = faces.slice(0, 4);

            for (const face of facesToProcess) {
                try {
                    const croppedUri = await cropFaceFromImage(
                        photoUri,                                 // ✅ was `file://${photo.path}`
                        face,
                        { width: photo.width, height: photo.height }
                    );

                    if (!croppedUri) continue;

                    const emb = await getEmbedding(croppedUri.replace('file://', ''));

                    if (emb && emb.length === EXPECTED_EMBEDDING_SIZE) {
                        detectedEmbeddings.push(emb);
                    }
                } catch (e) {
                    console.log('[captureAndProcess] Crop/embed error:', e);
                }
            }

            const matches = await processMultiAttendance(detectedEmbeddings);

            if (matches.length > 0) {
                recognitionBuffer.current.push(matches[0]); // ✅ largest/best face
            } else {
                recognitionBuffer.current.push('unknown');
            }

            if (recognitionBuffer.current.length > 5) recognitionBuffer.current.shift();

            const buf = recognitionBuffer.current;
            const userCounts = new Map<string, { id: string; count: number }>();

            buf.forEach(item => {
                if (item !== 'unknown') {
                    const existing = userCounts.get(item.name);
                    userCounts.set(item.name, {
                        id: item.id,
                        count: (existing?.count || 0) + 1,
                    });
                }
            });

            let confirmedUser: { name: string; id: string } | null = null;
            for (const [name, data] of userCounts.entries()) {
                if (data.count >= 3) {
                    confirmedUser = { name, id: data.id };
                    break;
                }
            }

            const now = Date.now();
            const inProtectionWindow = (now - lastRecognizedTime.current) < PROTECTION_WINDOW;

            if (confirmedUser) {
                lastRecognizedUser.current = confirmedUser.name;
                lastRecognizedTime.current = now;
                nullStreak.current = 0;

                const { name, id } = confirmedUser;
                const lastScanTime = recentScans.current.get(name) || 0;

                if (now - lastScanTime > 2000) {
                    recentScans.current.set(name, now);

                    const finalStatus = await markAttendance(id, name);

                    // ✅ All 4 cases correctly distinguished
                    if (finalStatus === 'error') {
                        console.warn(`[CameraScreen] Attendance DB error for ${name}`);
                        setPopupData({ name, id, type: 'warning', message: 'Attendance error — please try again' });
                        setTimeout(() => setPopupData(null), 2000);
                        // ✅ No green box on error — recognition succeeded but DB failed

                    } else if (finalStatus === 'ignored') {
                        console.log(`[CameraScreen] Attendance ignored (too soon) for ${name}`);
                        setPopupData({ name, id, type: 'warning', message: 'Attendance already marked' });
                        setTimeout(() => setPopupData(null), 2000);
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));

                    } else {
                        const isExit = finalStatus === 'checkout';
                        setPopupData({
                            name, id,
                            type: 'success',
                            message: isExit ? 'Exit Marked' : 'Attendance Marked',
                        });
                        setTimeout(() => setPopupData(null), 2000);
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));
                    }
                }

                recognitionBuffer.current = [];

            } else {
                const lastFrameUnknown = buf.length > 0 && buf[buf.length - 1] === 'unknown';
                if (lastFrameUnknown) nullStreak.current++;

                if (!inProtectionWindow && nullStreak.current >= UNKNOWN_STREAK_THRESHOLD) {
                    setPopupData({ name: 'Unknown', id: 'Not Registered', type: 'error' });
                    setTimeout(() => {
                        setPopupData(prev => prev?.type === 'error' ? null : prev);
                    }, 2000);
                    recognitionBuffer.current = [];
                    nullStreak.current = 0;
                } else {
                    console.log(`[CameraScreen] Hysteresis active — nullStreak: ${nullStreak.current}`);
                }
            }

        } catch (err) {
            console.error('[CameraScreen] Scanning error:', err);
            setDetectedFaces([]);
        } finally {
            setProcessing(false);
        }

        if (isScanningRef.current) {
            scanTimerRef.current = setTimeout(captureAndProcess, 500);
        }
    };

    const startScanning = () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        recognitionBuffer.current = [];
        lastRecognizedUser.current = null;
        lastRecognizedTime.current = 0;
        nullStreak.current = 0;
        setDetectedFaces([]);
        setPopupData(null);
        recentScans.current.clear();

        sessionTimerRef.current = setTimeout(() => {
            if (isScanningRef.current) {
                stopScanning();
                navigation.navigate('Home');
            }
        }, 10 * 60 * 1000);

        captureAndProcess();
    };

    useEffect(() => {
        if (mode === 'attendance') {
            const timer = setTimeout(() => startScanning(), 500);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    if (!device || !hasPermission) {
        return <View style={styles.center}><Text>Camera not ready</Text></View>;
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
                const isFrontCam = device?.position === 'front';
                const scaledW = face.width * scaleX;
                const scaledH = face.height * scaleY;
                let leftPos = face.x * scaleX;
                if (isFrontCam) leftPos = viewDimensions.width - (leftPos + scaledW);

                return (
                    <View key={index} style={{
                        position: 'absolute',
                        left: leftPos, top: face.y * scaleY,
                        width: scaledW, height: scaledH,
                        borderWidth: 4,
                        borderColor: isSuccess ? '#4ade80' : 'yellow',
                        zIndex: 10, alignItems: 'center',
                    }}>
                        {!isSuccess && (
                            <View style={{
                                position: 'absolute', top: -25,
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                paddingHorizontal: 6, borderRadius: 4,
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
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    padding: 20,
                    borderTopLeftRadius: 20, borderTopRightRadius: 20,
                    borderTopWidth: 2,
                    borderTopColor: popupData.type === 'success' ? '#4ade80'
                        : popupData.type === 'warning' ? '#eab308' : '#ef4444',
                    alignItems: 'center', zIndex: 20,
                }}>
                    <Text style={{
                        color: popupData.type === 'success' ? '#4ade80'
                            : popupData.type === 'warning' ? '#eab308' : '#ef4444',
                        fontSize: 18, fontWeight: 'bold', marginBottom: 5,
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
                <TouchableOpacity style={styles.button} onPress={registerFace} disabled={processing}>
                    <Text style={styles.buttonText}>
                        {processing ? 'Processing…' : 'Register Face'}
                    </Text>
                </TouchableOpacity>
            )}

            {mode === 'attendance' && (
                <View style={{ position: 'absolute', bottom: 40, alignSelf: 'center' }}>
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                        Scanning...
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    button: {
        position: 'absolute', bottom: 40, alignSelf: 'center',
        backgroundColor: '#2563eb',
        paddingVertical: 14, paddingHorizontal: 26,
        borderRadius: 30,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default CameraScreen;