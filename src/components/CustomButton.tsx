import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

const CustomButton = ({ title, onPress }: any) => {
    return (
        <TouchableOpacity style={styles.button} onPress={onPress}>
            <Text style={styles.text}>{title}</Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#2563eb',
        padding: 12,
        borderRadius: 8,
        marginVertical: 10,
        width: 200,
        alignItems: 'center'
    },
    text: {
        color: '#fff',
        fontSize: 16
    }
});

export default CustomButton;
