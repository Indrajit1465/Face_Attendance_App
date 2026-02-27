import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import CameraScreen from '../screens/CameraScreen';
import PreviewScreen from '../screens/PreviewScreen';
import RegisterEmployeeScreen from '../screens/RegisterEmployeeScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: true,
                headerStyle: { backgroundColor: '#000' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
                // ✅ Prevent swipe-back mid-scan on Camera screen (handled per-screen below)
                gestureEnabled: true,
            }}
        >
            {/* Home */}
            <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    title: 'Face Attendance',
                    headerShown: true,
                }}
            />

            {/* Attendance Log — ✅ now accessible with correct title */}
            <Stack.Screen
                name="Attendance"
                component={AttendanceScreen}
                options={{
                    title: 'Attendance Log',
                    headerShown: true,
                }}
            />

            {/* Camera — ✅ header hidden: full-screen camera, no Y-axis offset */}
            <Stack.Screen
                name="Camera"
                component={CameraScreen}
                options={{
                    headerShown: false,   // ✅ full-screen — no header offset
                    gestureEnabled: false,   // ✅ prevent accidental swipe-back during scan
                    animation: 'fade',  // ✅ smoother transition into camera
                }}
            />

            {/* Preview — ✅ header hidden: full-screen image */}
            <Stack.Screen
                name="Preview"
                component={PreviewScreen}
                options={{
                    title: 'Preview',
                    headerShown: false,      // ✅ full-screen image preview
                }}
            />

            {/* Register Employee */}
            <Stack.Screen
                name="Register"
                component={RegisterEmployeeScreen}
                options={{
                    title: 'Register Employee',
                    headerShown: true,
                    headerBackTitle: 'Back',
                }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;