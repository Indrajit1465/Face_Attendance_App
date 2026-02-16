import { NativeModules } from 'react-native';

const { FaceDetection } = NativeModules;

export type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
};

export async function detectFaces(imagePath: string): Promise<FaceBox[]> {
    return await FaceDetection.detectFaces(imagePath);
}
