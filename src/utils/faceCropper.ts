import ImageEditor from '@react-native-community/image-editor';
import Logger from './Logger';

type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type ImageDimensions = {
    width: number;
    height: number;
};

// 🔧 Tunable constants
// NOTE: FaceDetectionModule.java already adds 20% padding to the YOLO box.
// This margin is only a small safety buffer on top of that.
const FACE_MARGIN = 0.10;            // ✅ was 0.35 — Java already handles main padding
const MIN_CROP_SIZE = 112;           // ✅ Must be at least as large as MobileFaceNet input

export const cropFaceFromImage = async (
    imageUri: string,
    face: FaceBox,
    imageDimensions: ImageDimensions  // ✅ NEW: needed for right/bottom edge clamping
): Promise<string | null> => {

    // 1. Perfect square from max dimension
    const sideLength = Math.max(face.width, face.height);

    // 2. Add safety padding
    const padding = sideLength * FACE_MARGIN;
    const paddedSide = sideLength + padding * 2;

    // 3. Minimum size guard
    if (paddedSide < MIN_CROP_SIZE) {
        Logger.debug('faceCropper', `Crop too small: ${paddedSide.toFixed(1)}px — minimum is ${MIN_CROP_SIZE}px`);
        return null;  // ✅ Reject small crops — don't send bad data downstream
    }

    // 4. Center of original YOLO box
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    // 5. Raw top-left before clamping
    const rawX = cx - paddedSide / 2;
    const rawY = cy - paddedSide / 2;

    // 6. ✅ Clamp top-left to image bounds
    const clampedX = Math.max(rawX, 0);
    const clampedY = Math.max(rawY, 0);

    // 7. ✅ Clamp bottom-right to image bounds
    //    Reduce crop size if it overflows — keeps crop valid even near edges
    const maxAllowedW = imageDimensions.width - clampedX;
    const maxAllowedH = imageDimensions.height - clampedY;
    const finalSize = Math.floor(Math.min(paddedSide, maxAllowedW, maxAllowedH));

    // 8. Final size guard after clamping
    if (finalSize < MIN_CROP_SIZE) {
        Logger.debug('faceCropper', `Post-clamp crop too small: ${finalSize}px`);
        return null;
    }

    Logger.debug('BIOMETRIC',
        `Crop → X:${clampedX.toFixed(1)} Y:${clampedY.toFixed(1)}` +
        ` Size:${finalSize}×${finalSize}` +
        ` (requested ${paddedSide.toFixed(1)}, clamped from raw ${rawX.toFixed(1)},${rawY.toFixed(1)})`
    );

    const result = await ImageEditor.cropImage(imageUri, {
        offset: { x: clampedX, y: clampedY },
        size: { width: finalSize, height: finalSize },  // ✅ Always within bounds
    });

    return result.uri;
};