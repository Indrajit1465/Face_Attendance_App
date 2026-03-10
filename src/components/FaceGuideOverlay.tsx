import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
    /** Area of the largest detected face (0 if no face) */
    faceArea: number;
    /** Whether currently scanning for attendance */
    isScanning: boolean;
};

/**
 * Oval face positioning guide overlay for kiosk mode.
 * Shows distance feedback based on detected face area.
 */
const FaceGuideOverlay: React.FC<Props> = ({ faceArea, isScanning }) => {
    if (!isScanning) return null;

    // Distance feedback based on face bounding box area
    let guidanceText = 'Position your face in the oval';
    let guidanceColor = '#999';

    if (faceArea > 0) {
        if (faceArea < 25000) {
            guidanceText = '↑ Move closer';
            guidanceColor = '#eab308';
        } else if (faceArea > 200000) {
            guidanceText = '↓ Move back';
            guidanceColor = '#eab308';
        } else {
            guidanceText = '✓ Good position';
            guidanceColor = '#4ade80';
        }
    }

    return (
        <View style={styles.container} pointerEvents="none">
            {/* Oval guide */}
            <View style={styles.ovalGuide} />

            {/* Distance feedback */}
            <View style={styles.guidanceContainer}>
                <Text style={[styles.guidanceText, { color: guidanceColor }]}>
                    {guidanceText}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 5,
    },
    ovalGuide: {
        width: 220,
        height: 300,
        borderRadius: 110,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderStyle: 'dashed',
    },
    guidanceContainer: {
        position: 'absolute',
        top: '15%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    guidanceText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

export default FaceGuideOverlay;
