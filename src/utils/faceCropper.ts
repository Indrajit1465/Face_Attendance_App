import ImageEditor from '@react-native-community/image-editor';

type FaceBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export const cropFaceFromImage = async (
    imageUri: string,
    face: FaceBox
): Promise<string> => {
    const result = await ImageEditor.cropImage(imageUri, {
        offset: {
            x: Math.max(face.x, 0),
            y: Math.max(face.y, 0),
        },
        size: {
            width: face.width,
            height: face.height,
        },
        displaySize: {
            width: 160,
            height: 160,
        },
        resizeMode: 'contain',
    });

    // ✅ RETURN ONLY THE URI
    return result.uri;
};
