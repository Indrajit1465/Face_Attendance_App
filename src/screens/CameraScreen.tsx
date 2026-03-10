import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';

import { detectFaces } from '../services/faceDetection';
import { cropFaceFromImage } from '../utils/faceCropper';
import { getEmbedding } from '../services/faceRecognition';
import { averageEmbedding } from '../utils/averageEmbedding';
import { processMultiAttendance, invalidateEmployeeCache } from '../services/attendanceService';
import { markAttendance } from '../database/attendanceRepo';
import { cosineSimilarity } from '../utils/cosineSimilarity';
import FaceGuideOverlay from '../components/FaceGuideOverlay';
import Logger from '../utils/Logger';

const EXPECTED_EMBEDDING_SIZE = 192;
const MIN_BOX_SIZE = 120;
const MIN_BOX_SIZE_REG = 80;   // softer for registration

// ✅ Scan timing constants
const SCAN_INTERVAL_FAST = 100;  // ms — when face already confirmed (stay responsive)
const SCAN_INTERVAL_NORMAL = 300;  // ms — normal scanning
const SCAN_INTERVAL_SLOW = 600;  // ms — after match confirmed (cooldown)
const MIN_SCAN_INTERVAL = 50;    // ✅ Floor — prevents tight-loop CPU starvation

const SESSION_TIMEOUT_MS = 10 * 60 * 1000;          // 10 minutes
const SESSION_WARNING_MS = SESSION_TIMEOUT_MS - 30000; // Warning at 9:30

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
    const [sessionWarning, setSessionWarning] = useState(false);

    const recentScans = useRef<Map<string, number>>(new Map());
    const [popupData, setPopupData] = useState<{
        name: string; id: string;
        type?: 'success' | 'warning' | 'error';
        message?: string;
    } | null>(null);

    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const recognitionBuffer = useRef<Array<'unknown' | { name: string; id: string }>>([]);
    const lastRecognizedUser = useRef<string | null>(null);
    const lastRecognizedTime = useRef<number>(0);
    const nullStreak = useRef<number>(0);
    const noFaceStreak = useRef<number>(0);
    const isScanningRef = useRef(false);
    const isMountedRef = useRef(true);

    // ✅ Track processing time to adapt scan interval dynamically
    const lastProcessingMs = useRef<number>(300);

    const UNKNOWN_STREAK_THRESHOLD = 7;
    const PROTECTION_WINDOW = 10000;
    const NO_FACE_CLEAR_THRESHOLD = 3;

    useEffect(() => {
        isMountedRef.current = true;
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
        return () => { isMountedRef.current = false; };
    }, []);

    useEffect(() => {
        return () => { stopScanning(); };
    }, []);

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    const selectBestFace = (faces: any[], minSize: number = MIN_BOX_SIZE) => {
        const valid = faces.filter(f => f.width >= minSize && f.height >= minSize);
        if (valid.length === 0) return null;
        return valid.sort((a, b) => {
            const areaDiff = (b.width * b.height) - (a.width * a.height);
            return areaDiff !== 0 ? areaDiff : b.confidence - a.confidence;
        })[0];
    };

    // ✅ Single popup timer — prevents races from multiple setTimeout calls
    const showPopup = (data: typeof popupData, durationMs: number = 3000) => {
        if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
        setPopupData(data);
        popupTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setPopupData(null);
        }, durationMs);
    };

    // ✅ Temp file cleanup — prevents GB-scale disk bloat during scanning sessions
    const cleanupTempFile = async (path: string) => {
        try {
            const cleanPath = path.replace('file://', '');
            if (await RNFS.exists(cleanPath)) {
                await RNFS.unlink(cleanPath);
            }
        } catch {
            // Silently ignore cleanup errors — not critical
        }
    };

    // ─────────────────────────────────────────────
    // REGISTRATION FLOW
    // ─────────────────────────────────────────────

    const registerFace = async () => {
        if (processing || !cameraRef.current) return;
        setProcessing(true);

        const REQUIRED_SAMPLES = 8;
        const MIN_VALID_SAMPLES = 5;
        const MIN_PAIRWISE_SIM = 0.82;
        const DELAY_BETWEEN = 700;

        try {
            const embeddings: number[][] = [];

            for (let i = 0; i < REQUIRED_SAMPLES; i++) {
                const photo = await cameraRef.current.takePhoto({
                    flash: 'off',
                    qualityPrioritization: 'speed',
                    skipMetadata: true,
                } as any);
                const photoUri = normalizePhotoPath(photo.path);

                const faces = await detectFaces(photoUri, 0.50);
                const bestFace = selectBestFace(faces || [], MIN_BOX_SIZE_REG);

                if (!bestFace) {
                    await cleanupTempFile(photoUri);
                    continue;
                }

                const croppedUri = await cropFaceFromImage(
                    photoUri, bestFace,
                    { width: photo.width, height: photo.height }
                );

                // ✅ Cleanup the original photo immediately
                await cleanupTempFile(photoUri);

                if (!croppedUri) continue;

                const emb = await getEmbedding(croppedUri.replace('file://', ''));

                // ✅ Cleanup the cropped face image
                await cleanupTempFile(croppedUri);

                if (emb && emb.length === EXPECTED_EMBEDDING_SIZE) {
                    embeddings.push(emb);
                }

                if (i < REQUIRED_SAMPLES - 1) {
                    await new Promise<void>(resolve => setTimeout(resolve, DELAY_BETWEEN));
                }
            }

            if (embeddings.length < MIN_VALID_SAMPLES) {
                Alert.alert('Registration Failed', `Only ${embeddings.length}/${MIN_VALID_SAMPLES} valid samples. Try better lighting.`);
                return;
            }

            let stabilitySum = 0, pairs = 0;
            for (let i = 0; i < embeddings.length; i++) {
                for (let j = i + 1; j < embeddings.length; j++) {
                    const sim = cosineSimilarity(embeddings[i], embeddings[j]);
                    if (sim === null) {
                        Alert.alert('Error', 'Invalid embedding in registration.');
                        return;
                    }
                    stabilitySum += sim;
                    pairs++;
                }
            }

            const avgStability = pairs > 0 ? stabilitySum / pairs : 0;
            Logger.debug('CameraScreen', `Registration stability: ${avgStability.toFixed(4)}`);

            if (avgStability < MIN_PAIRWISE_SIM) {
                Alert.alert('Unstable Registration', `Consistency too low (${avgStability.toFixed(2)}). Keep face steady.`);
                return;
            }

            const finalEmb = averageEmbedding(embeddings);
            if (!finalEmb) {
                Alert.alert('Error', 'Could not compute face template.');
                return;
            }

            navigation.navigate('Register', { embedding: finalEmb });

        } catch (err: any) {
            Logger.error('CameraScreen', 'Registration error:', err);
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
        noFaceStreak.current = 0;
        setDetectedFaces([]);
        setPopupData(null);
        setSessionWarning(false);
        recentScans.current.clear();
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
        if (sessionWarningTimerRef.current) clearTimeout(sessionWarningTimerRef.current);
        if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
        setProcessing(false);
    };

    const scheduleNextScan = (intervalMs: number) => {
        if (!isScanningRef.current || !isMountedRef.current) return;
        // ✅ Floor at MIN_SCAN_INTERVAL to prevent tight-loop CPU starvation
        const safeInterval = Math.max(MIN_SCAN_INTERVAL, intervalMs);
        scanTimerRef.current = setTimeout(captureAndProcess, safeInterval);
    };

    const captureAndProcess = async () => {
        if (!isScanningRef.current || !cameraRef.current || !isMountedRef.current) return;

        const frameStart = Date.now();
        let photoUri: string | null = null;

        try {
            // ─────────────────────────────────────
            // Step 1: Capture photo
            // ─────────────────────────────────────
            const photo = await cameraRef.current.takePhoto({
                flash: 'off',
                qualityPrioritization: 'speed',
                skipMetadata: true,
            } as any);
            photoUri = normalizePhotoPath(photo.path);

            // ─────────────────────────────────────
            // Step 2: Detect faces
            // ─────────────────────────────────────
            const faces = await detectFaces(photoUri, 0.75);

            if (!faces || faces.length === 0) {
                setDetectedFaces([]);

                // ✅ Track consecutive no-face frames — clear stale buffer
                noFaceStreak.current++;
                if (noFaceStreak.current >= NO_FACE_CLEAR_THRESHOLD) {
                    if (recognitionBuffer.current.length > 0) {
                        Logger.debug('CameraScreen', `No face for ${noFaceStreak.current} frames — clearing buffer`);
                        recognitionBuffer.current = [];
                        nullStreak.current = 0;
                    }
                }

                scheduleNextScan(SCAN_INTERVAL_NORMAL);
                return;
            }

            // ✅ Face detected — reset no-face streak
            noFaceStreak.current = 0;

            // ─────────────────────────────────────
            // Step 3: Single-face kiosk mode
            // ✅ Only process the LARGEST face to prevent voting buffer corruption
            // ─────────────────────────────────────
            if (faces.length > 1) {
                showPopup({
                    name: '', id: '',
                    type: 'warning',
                    message: 'Please step up one at a time',
                }, 2000);
            }

            // ✅ Always use just the single best face
            const bestFace = selectBestFace(faces, MIN_BOX_SIZE);
            if (!bestFace) {
                setDetectedFaces([]);
                scheduleNextScan(SCAN_INTERVAL_NORMAL);
                return;
            }

            // ─────────────────────────────────────
            // Step 4: UI bounding boxes (non-blocking)
            // ─────────────────────────────────────
            const size = Math.max(bestFace.width, bestFace.height);
            const paddedSize = size * 1.25;
            const processedFace = {
                ...bestFace,
                x: bestFace.x + bestFace.width / 2 - paddedSize / 2,
                y: bestFace.y + bestFace.height / 2 - paddedSize / 2,
                width: paddedSize,
                height: paddedSize,
                photoWidth: photo.width,
                photoHeight: photo.height,
                status: 'scanning',
            };
            setDetectedFaces([processedFace]);

            // ─────────────────────────────────────
            // Step 5: Crop + Embed single face
            // ─────────────────────────────────────
            const croppedUri = await cropFaceFromImage(
                photoUri, bestFace,
                { width: photo.width, height: photo.height }
            );
            if (!croppedUri) {
                scheduleNextScan(SCAN_INTERVAL_NORMAL);
                return;
            }

            const embedding = await getEmbedding(croppedUri.replace('file://', ''));

            // ✅ Cleanup cropped face image
            await cleanupTempFile(croppedUri);

            if (!embedding || embedding.length !== EXPECTED_EMBEDDING_SIZE) {
                recognitionBuffer.current.push('unknown');
                scheduleNextScan(SCAN_INTERVAL_NORMAL);
                return;
            }

            // ─────────────────────────────────────
            // Step 6: Match against employees
            // ─────────────────────────────────────
            const matches = await processMultiAttendance([embedding]);

            if (matches.length > 0) {
                recognitionBuffer.current.push(matches[0]);
            } else {
                recognitionBuffer.current.push('unknown');
            }

            if (recognitionBuffer.current.length > 5) recognitionBuffer.current.shift();

            // ─────────────────────────────────────
            // Step 7: Evaluate buffer (3-of-5 voting)
            // ─────────────────────────────────────
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

                    if (finalStatus === 'error') {
                        Logger.warn('CameraScreen', `DB error for ${name}`);
                        showPopup({ name, id, type: 'warning', message: 'Attendance error — please try again' });

                    } else if (finalStatus === 'ignored') {
                        showPopup({ name, id, type: 'warning', message: 'Attendance already marked' });
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));

                    } else {
                        const isExit = finalStatus === 'checkout';
                        showPopup({
                            name, id,
                            type: 'success',
                            message: isExit ? 'Exit Marked' : 'Attendance Marked',
                        });
                        setDetectedFaces(prev => prev.map(f => ({ ...f, status: 'success' })));
                    }
                }

                recognitionBuffer.current = [];

                // ✅ After confirmed match — slow down briefly (cooldown)
                lastProcessingMs.current = Date.now() - frameStart;
                scheduleNextScan(SCAN_INTERVAL_SLOW);
                return;

            } else {
                // ✅ Only increment nullStreak outside protection window
                if (!inProtectionWindow) {
                    const lastFrameUnknown = buf.length > 0 && buf[buf.length - 1] === 'unknown';
                    if (lastFrameUnknown) nullStreak.current++;
                } else {
                    nullStreak.current = 0;
                }

                if (!inProtectionWindow && nullStreak.current >= UNKNOWN_STREAK_THRESHOLD) {
                    showPopup({ name: 'Unknown', id: 'Not Registered', type: 'error' }, 2000);
                    recognitionBuffer.current = [];
                    nullStreak.current = 0;
                } else {
                    Logger.debug('CameraScreen', `Hysteresis — nullStreak: ${nullStreak.current}, inWindow: ${inProtectionWindow}`);
                }
            }

        } catch (err) {
            Logger.error('CameraScreen', 'Scanning error:', err);
            setDetectedFaces([]);
        } finally {
            // ✅ ALWAYS cleanup the temp photo file after processing
            if (photoUri) {
                await cleanupTempFile(photoUri);
            }
        }

        // ─────────────────────────────────────
        // ✅ Adaptive interval — based on actual processing time
        // ─────────────────────────────────────
        const elapsed = Date.now() - frameStart;
        lastProcessingMs.current = elapsed;

        let nextInterval: number;
        if (elapsed < 150) nextInterval = SCAN_INTERVAL_FAST;
        else if (elapsed < 400) nextInterval = SCAN_INTERVAL_NORMAL;
        else nextInterval = MIN_SCAN_INTERVAL;  // ✅ was 0 — now uses floor to prevent tight loop

        Logger.debug('CameraScreen', `Frame took ${elapsed}ms → next scan in ${nextInterval}ms`);
        scheduleNextScan(nextInterval);
    };

    const startScanning = () => {
        if (isScanningRef.current) return;
        isScanningRef.current = true;
        recognitionBuffer.current = [];
        lastRecognizedUser.current = null;
        lastRecognizedTime.current = 0;
        nullStreak.current = 0;
        noFaceStreak.current = 0;
        setDetectedFaces([]);
        setPopupData(null);
        setSessionWarning(false);
        recentScans.current.clear();

        // ✅ Warm up the index before scanning starts
        invalidateEmployeeCache();

        // ✅ Session timeout — navigate to Home after 10 minutes
        sessionTimerRef.current = setTimeout(() => {
            if (isScanningRef.current) {
                stopScanning();
                navigation.navigate('Home');
            }
        }, SESSION_TIMEOUT_MS);

        // ✅ Session warning — show banner 30 seconds before timeout
        sessionWarningTimerRef.current = setTimeout(() => {
            if (isScanningRef.current && isMountedRef.current) {
                setSessionWarning(true);
            }
        }, SESSION_WARNING_MS);

        captureAndProcess();
    };

    useEffect(() => {
        if (mode === 'attendance') {
            const timer = setTimeout(() => startScanning(), 500);
            return () => clearTimeout(timer);
        }
    }, [mode]);

    if (!device || !hasPermission) {
        return <View style={styles.center}><Text>Camera not ready</Text></View>;
    }

    // ✅ Compute face area for the guide overlay
    const largestFaceArea = detectedFaces.length > 0
        ? detectedFaces[0].width * detectedFaces[0].height
        : 0;

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

            {/* ✅ Face positioning guide for kiosk UX */}
            <FaceGuideOverlay
                faceArea={largestFaceArea}
                isScanning={mode === 'attendance' && isScanningRef.current}
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
                        left: leftPos,
                        top: face.y * scaleY,
                        width: scaledW,
                        height: scaledH,
                        borderWidth: 4,
                        borderColor: isSuccess ? '#4ade80' : 'yellow',
                        zIndex: 10,
                        alignItems: 'center',
                    }}>
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
                    borderTopColor: popupData.type === 'success' ? '#4ade80'
                        : popupData.type === 'warning' ? '#eab308' : '#ef4444',
                    alignItems: 'center',
                    zIndex: 20,
                }}>
                    <Text style={{
                        color: popupData.type === 'success' ? '#4ade80'
                            : popupData.type === 'warning' ? '#eab308' : '#ef4444',
                        fontSize: 18,
                        fontWeight: 'bold',
                        marginBottom: 5,
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

            {/* ✅ Session timeout warning banner */}
            {sessionWarning && (
                <View style={styles.warningBanner}>
                    <Text style={styles.warningText}>
                        ⏱ Session ending soon — returning to Home in 30 seconds
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

            {mode === 'attendance' && !sessionWarning && (
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
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        backgroundColor: '#2563eb',
        paddingVertical: 14,
        paddingHorizontal: 26,
        borderRadius: 30,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    warningBanner: {
        position: 'absolute',
        top: 40,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(234, 179, 8, 0.9)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        zIndex: 30,
    },
    warningText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default CameraScreen;