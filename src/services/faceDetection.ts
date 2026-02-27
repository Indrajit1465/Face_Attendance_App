import { NativeModules } from 'react-native';

const { FaceDetection } = NativeModules;

export type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
};

const isValidFaceBox = (face: any): face is FaceBox => {
    if (!face || typeof face !== 'object') return false;
    const { x, y, width, height, confidence } = face;
    if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) return false;
    if (width <= 0 || height <= 0) return false;
    if (x < 0 || y < 0) return false;
    if (!isFinite(confidence) || confidence < 0 || confidence > 1) return false;
    return true;
};

const normalizeImagePath = (path: string): string =>
    path.startsWith('file://') ? path.slice(7) : path;

export async function detectFaces(
    imagePath: string,
    confThreshold: number = 0.75   // ✅ default for attendance; pass 0.50 for registration
): Promise<FaceBox[]> {

    if (!imagePath || typeof imagePath !== 'string' || imagePath.trim() === '') {
        console.warn('[faceDetection] Empty imagePath');
        return [];
    }

    const normalizedPath = normalizeImagePath(imagePath);

    try {
        // ✅ Now passes both args — Java method accepts both
        const raw = await FaceDetection.detectFaces(normalizedPath, confThreshold);

        if (!raw || !Array.isArray(raw)) {
            console.warn('[faceDetection] Non-array response from native');
            return [];
        }

        const validFaces: FaceBox[] = [];
        for (const face of raw) {
            if (isValidFaceBox(face)) {
                validFaces.push({
                    x: face.x,
                    y: face.y,
                    width: face.width,
                    height: face.height,
                    confidence: face.confidence,
                });
            } else {
                console.warn('[faceDetection] Dropping invalid face box:', face);
            }
        }

        console.log(`[faceDetection] ${validFaces.length} valid face(s) `
            + `(threshold=${confThreshold}, raw=${raw.length})`);
        return validFaces;

    } catch (err) {
        console.error('[faceDetection] Native error:', err);
        return [];
    }
}