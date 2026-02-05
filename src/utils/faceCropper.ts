import ImageEditor from '@react-native-community/image-editor';

type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

// 🔧 Tunable constants
const FACE_MARGIN = 0.35;   // 35% padding around face
const OUTPUT_SIZE = 112;    // MobileFaceNet input size

export const cropFaceFromImage = async (
    imageUri: string,
    face: FaceBox
): Promise<string> => {
    const padding = 0.35; // 35% margin

    const padW = face.width * padding;
    const padH = face.height * padding;

    const x = Math.max(face.x - padW, 0);
    const y = Math.max(face.y - padH, 0);
    const width = face.width + padW * 2;
    const height = face.height + padH * 2;

    const result = await ImageEditor.cropImage(imageUri, {
        offset: { x, y },
        size: { width, height },
        displaySize: { width: 160, height: 160 },
        resizeMode: 'cover', // ❗ NOT contain
    });

    return result.uri;
};
