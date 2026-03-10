import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initDB } from './src/database/db';

const App = () => {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    try {
      initDB();
      console.log('[DB] Initialized successfully');
      setDbReady(true);
    } catch (e: any) {
      console.error('[DB] Initialization failed:', e);
      setDbError(e?.message || 'Database initialization failed');
    }
  }, []);

  // ✅ Block app if DB fails — prevents silent data loss
  if (dbError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Database Error</Text>
        <Text style={styles.errorMessage}>
          Could not initialize the database. Please restart the app.
        </Text>
        {__DEV__ && (
          <Text style={styles.errorDetail}>{dbError}</Text>
        )}
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorMessage}>Loading…</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: {
    color: '#ef4444',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorMessage: {
    color: '#999',
    fontSize: 15,
    textAlign: 'center',
  },
  errorDetail: {
    color: '#666',
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
});

export default App;
