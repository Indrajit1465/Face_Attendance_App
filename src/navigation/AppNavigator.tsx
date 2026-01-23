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
        <Stack.Navigator screenOptions={{ headerShown: true }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Register" component={RegisterEmployeeScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Preview" component={PreviewScreen} />
            <Stack.Screen name="Attendance" component={AttendanceScreen} />
        </Stack.Navigator>
    );
};

export default AppNavigator;
