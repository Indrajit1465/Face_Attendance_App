import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { initDB } from './src/database/db';

const App = () => {
  useEffect(() => {
    try {
      initDB();
      console.log('[DB] Initialized successfully');
    } catch (e) {
      console.error('[DB] Initialization failed:', e);
    }
  }, []);


  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
};

export default App;
