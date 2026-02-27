import { NativeModules } from 'react-native';
import { l2Normalize } from '../utils/normalizeEmbedding';

const { FaceRecognition } = NativeModules;

export const getEmbedding = async (imagePath: string): Promise<number[] | null> => {
    try {
        const raw = await FaceRecognition.getEmbedding(imagePath);

        // Guard: native module returned nothing
        if (!raw || !Array.isArray(raw) || raw.length === 0) {
            console.warn('[getEmbedding] Native module returned empty/null');
            return null;
        }

        // Convert from React Native's ReadableArray to plain number[]
        const embedding: number[] = Array.from(raw);

        // Re-validate normalization on JS side (defense in depth)
        const normalized = l2Normalize(embedding);
        if (!normalized) {
            console.warn('[getEmbedding] L2 normalization failed on JS side');
            return null;
        }

        return normalized;

    } catch (err) {
        console.warn('[getEmbedding] Native call failed:', err);
        return null;
    }
};