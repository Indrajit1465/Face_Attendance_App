import ImageEditor from '@react-native-community/image-editor';

type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

// 🔧 Tunable constants
const FACE_MARGIN = 0.35;   // 35% padding around face

export const cropFaceFromImage = async (
    imageUri: string,
    face: FaceBox
): Promise<string> => {
    // 1. Calculate a perfect square from the bounding box (take the max dimension)
    const sideLength = Math.max(face.width, face.height);

    // 2. Add safe padding to the square
    const padding = sideLength * FACE_MARGIN;
    const paddedSide = sideLength + padding * 2;

    // 3. Keep the crop perfectly centered over the original bounding box 
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    // 4. Calculate final top-left offset
    const x = Math.max(cx - paddedSide / 2, 0);
    const y = Math.max(cy - paddedSide / 2, 0);

    console.log(`[BIOMETRIC AUDIT] Cropping square at X:${x.toFixed(1)} Y:${y.toFixed(1)} Size:${paddedSide.toFixed(1)}`);

    const result = await ImageEditor.cropImage(imageUri, {
        offset: { x, y },
        size: { width: paddedSide, height: paddedSide }, // Perfect square source
    });

    return result.uri;
};
