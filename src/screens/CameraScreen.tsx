import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';

const CameraScreen = ({ navigation, route }: any) => {
    const camera = useRef<Camera>(null);
    const devices = useCameraDevices();
    const device = devices.find(d => d.position === 'front');

    const [hasPermission, setHasPermission] = useState(false);

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            setHasPermission(status === 'granted');
        })();
    }, []);

    const capturePhoto = async () => {
        if (!camera.current) return;

        const photo = await camera.current.takePhoto({ flash: 'off' });

        const dirPath = `${RNFS.DocumentDirectoryPath}/faces`;
        await RNFS.mkdir(dirPath);

        const finalPath = `${dirPath}/face_${Date.now()}.jpg`;
        await RNFS.copyFile(photo.path, finalPath);

        const exists = await RNFS.exists(finalPath);
        if (!exists) return;

        const imageUri = `file://${finalPath}`;

        navigation.navigate('Preview', {
            imageUri,
            mode: route.params.mode,
        });
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

            <TouchableOpacity style={styles.captureBtn} onPress={capturePhoto} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    captureBtn: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#ffffff',
    },
});

export default CameraScreen;
