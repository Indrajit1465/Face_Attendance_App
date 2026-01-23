import { NativeModules } from 'react-native';

const { FaceDetection } = NativeModules;

export const detectFaces = async (imagePath: string) => {
    return await FaceDetection.detectFaces(imagePath);
};
