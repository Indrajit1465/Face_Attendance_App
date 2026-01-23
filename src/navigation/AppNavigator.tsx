import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
import PreviewScreen from '../screens/PreviewScreen';
import RegisterEmployeeScreen from '../screens/RegisterEmployeeScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    return (
        <Stack.Navigator>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Register" component={RegisterEmployeeScreen} />

            <Stack.Screen
                name="Camera"
                component={CameraScreen}
                options={{ headerShown: false }}
            />

            <Stack.Screen
                name="Preview"
                component={PreviewScreen}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;
