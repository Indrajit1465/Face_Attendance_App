import { NativeModules } from 'react-native';

const { FaceRecognition } = NativeModules;

export const getEmbedding = async (imagePath: string) => {
    return await FaceRecognition.getEmbedding(imagePath);
};
