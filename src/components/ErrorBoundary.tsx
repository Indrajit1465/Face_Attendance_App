import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * Catches React render crashes and shows a recovery screen
 * instead of a white screen on the kiosk.
 */
class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
    }

    handleRestart = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.icon}>⚠️</Text>
                    <Text style={styles.title}>Something went wrong</Text>
                    <Text style={styles.message}>
                        The app encountered an unexpected error.
                    </Text>
                    {__DEV__ && this.state.error && (
                        <Text style={styles.errorDetail}>
                            {this.state.error.message}
                        </Text>
                    )}
                    <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
                        <Text style={styles.buttonText}>Tap to Restart</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    icon: { fontSize: 48, marginBottom: 16 },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    message: {
        color: '#999',
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 8,
    },
    errorDetail: {
        color: '#ef4444',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 16,
    },
    button: {
        backgroundColor: '#2563eb',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 8,
        marginTop: 16,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default ErrorBoundary;
