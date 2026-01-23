import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import { detectFaces } from '../services/faceDetection';
import { getEmbedding } from '../services/faceRecognition';
import { processAttendanceLive } from '../services/attendanceServiceLive';

const PROCESS_INTERVAL = 3000;
const COOLDOWN_TIME = 60000;

const CameraScreen = ({ route, navigation }: any) => {
    const { mode } = route.params;

    const camera = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    // ✅ ALL hooks MUST be here
    const [cameraActive, setCameraActive] = useState(true);
    const [popupText, setPopupText] = useState<string | null>(null);
    const [hasPermission, setHasPermission] = useState(false);

    const lastProcessedRef = useRef(0);
    const lastSeenRef = useRef<Record<string, number>>({});
    const isProcessingRef = useRef(false);
    const popupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // -------------------------
    // Camera Permission
    // -------------------------
    useEffect(() => {
        (async () => {
            const status = await Camera.getCameraPermissionStatus();
            if (status !== 'granted') {
                const newStatus = await Camera.requestCameraPermission();
                setHasPermission(newStatus === 'granted');
            } else {
                setHasPermission(true);
            }
        })();
    }, []);

    // =========================
    // LIVE ATTENDANCE MODE
    // =========================
    useEffect(() => {
        if (mode !== 'attendance' || !hasPermission) return;

        const interval = setInterval(async () => {
            if (isProcessingRef.current) return;

            const cam = camera.current;
            if (!cam) return;

            const now = Date.now();
            if (now - lastProcessedRef.current < PROCESS_INTERVAL) return;
            lastProcessedRef.current = now;

            isProcessingRef.current = true;

            try {
                // ⛔ Pause camera before taking photo
                setCameraActive(false);

                const photo = await cam.takePhoto({ flash: 'off' });

                const faces = await detectFaces(photo.path);
                console.log('[LIVE] Faces detected:', faces.length);

                if (!faces || faces.length === 0) return;

                const face = faces[0];
                console.log('[LIVE] Face object:', face);

                // ✅ Face size check (your detector returns width/height directly)
                if (face.width < 120 || face.height < 120) return;

                const embedding = await getEmbedding(photo.path);
                console.log('[LIVE] Embedding length:', embedding.length);

                const matched = processAttendanceLive(
                    embedding,
                    lastSeenRef.current,
                    COOLDOWN_TIME
                );

                if (matched.length > 0) {
                    const message =
                        matched.length === 1
                            ? `${matched[0]} attendance marked`
                            : `${matched.join(', ')} attendance marked`;

                    setPopupText(message);

                    if (popupTimeoutRef.current) {
                        clearTimeout(popupTimeoutRef.current);
                    }

                    popupTimeoutRef.current = setTimeout(() => {
                        setPopupText(null);
                    }, 5000);
                }
            } catch (e) {
                console.log('Live attendance error:', e);
            } finally {
                // ▶ Resume camera
                setCameraActive(true);
                isProcessingRef.current = false;
            }
        }, PROCESS_INTERVAL);

        return () => clearInterval(interval);
    }, [mode, hasPermission]);

    // =========================
    // REGISTRATION MODE
    // =========================
    const captureForRegistration = async () => {
        const cam = camera.current;
        if (!cam) return;

        const photo = await cam.takePhoto({ flash: 'off' });

        const dir = `${RNFS.DocumentDirectoryPath}/faces`;
        await RNFS.mkdir(dir);
        const finalPath = `${dir}/face_${Date.now()}.jpg`;
        await RNFS.copyFile(photo.path, finalPath);

        navigation.navigate('Preview', {
            imageUri: `file://${finalPath}`,
            mode: 'register',
        });
    };

    if (!device || !hasPermission) return null;

    return (
        <View style={styles.container}>
            <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={cameraActive}
                photo={true}
            />

            {mode === 'register' && (
                <TouchableOpacity
                    style={styles.captureBtn}
                    onPress={captureForRegistration}
                />
            )}

            {popupText && (
                <View style={styles.popup}>
                    <Text style={styles.popupText}>{popupText}</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    captureBtn: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#fff',
    },
    popup: {
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        backgroundColor: '#16a34a',
        padding: 16,
        borderRadius: 10,
    },
    popupText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default CameraScreen;
