import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Vibration, Platform,
} from 'react-native';
import { isPinConfigured, setPin, verifyPin, isLockedOut } from '../services/adminPinService';

// ✅ Safe vibration helper — never throws, even without VIBRATE permission
const safeVibrate = (durationMs: number = 150) => {
    try {
        if (Platform.OS === 'android') {
            Vibration.vibrate(durationMs);
        }
    } catch (e) {
        // Silently ignore — vibration is optional feedback
        console.warn('Vibration not available');
    }
};

type PinEntryScreenProps = {
    route: any;
    navigation: any;
};

const PinEntryScreen = ({ route, navigation }: PinEntryScreenProps) => {
    const { target, targetParams } = route.params ?? {};

    const [pin, setLocalPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isSetup, setIsSetup] = useState(false);
    const [isConfirmStep, setIsConfirmStep] = useState(false);
    const [error, setError] = useState('');
    const [locked, setLocked] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const [attemptsLeft, setAttemptsLeft] = useState(5);

    const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const configured = isPinConfigured();
        setIsSetup(!configured);

        // Check initial lockout state
        const lockState = isLockedOut();
        if (lockState.locked) {
            setLocked(true);
            setLockoutSeconds(lockState.lockoutSeconds);
            startLockoutCountdown(lockState.lockoutSeconds);
        }

        return () => {
            if (lockoutTimer.current) clearInterval(lockoutTimer.current);
        };
    }, []);

    const startLockoutCountdown = useCallback((seconds: number) => {
        if (lockoutTimer.current) clearInterval(lockoutTimer.current);
        let remaining = seconds;
        setLockoutSeconds(remaining);
        setLocked(true);

        lockoutTimer.current = setInterval(() => {
            remaining--;
            setLockoutSeconds(remaining);
            if (remaining <= 0) {
                if (lockoutTimer.current) clearInterval(lockoutTimer.current);
                setLocked(false);
                setAttemptsLeft(5);
                setError('');
            }
        }, 1000);
    }, []);

    const handleDigitPress = (digit: string) => {
        if (locked) return;

        const current = isConfirmStep ? confirmPin : pin;
        if (current.length >= 4) return;

        const newPin = current + digit;

        if (isConfirmStep) {
            setConfirmPin(newPin);
            if (newPin.length === 4) handleConfirmComplete(newPin);
        } else {
            setLocalPin(newPin);
            if (newPin.length === 4) {
                if (isSetup) {
                    // Move to confirm step
                    setTimeout(() => {
                        setIsConfirmStep(true);
                        setError('');
                    }, 200);
                } else {
                    handleVerify(newPin);
                }
            }
        }
    };

    const handleBackspace = () => {
        if (locked) return;
        if (isConfirmStep) {
            setConfirmPin(prev => prev.slice(0, -1));
        } else {
            setLocalPin(prev => prev.slice(0, -1));
        }
        setError('');
    };

    const handleVerify = (enteredPin: string) => {
        const result = verifyPin(enteredPin);

        if (result.success) {
            // ✅ Navigate to target screen
            navigation.replace(target, targetParams ?? {});
        } else if (result.locked) {
            setError('Too many attempts');
            setLocalPin('');
            safeVibrate(300);
            startLockoutCountdown(result.lockoutSeconds);
        } else {
            setError(`Wrong PIN — ${result.remainingAttempts} attempt${result.remainingAttempts !== 1 ? 's' : ''} left`);
            setLocalPin('');
            setAttemptsLeft(result.remainingAttempts);
            safeVibrate(100);
        }
    };

    const handleConfirmComplete = (entered: string) => {
        if (entered !== pin) {
            setError('PINs do not match — try again');
            setConfirmPin('');
            setIsConfirmStep(false);
            setLocalPin('');
            safeVibrate(100);
            return;
        }

        const success = setPin(entered);
        if (success) {
            navigation.replace(target, targetParams ?? {});
        } else {
            setError('Failed to save PIN — try again');
            setConfirmPin('');
            setIsConfirmStep(false);
            setLocalPin('');
        }
    };

    const currentPin = isConfirmStep ? confirmPin : pin;

    const title = isSetup
        ? (isConfirmStep ? 'Confirm Admin PIN' : 'Create Admin PIN')
        : 'Enter Admin PIN';

    const subtitle = isSetup
        ? (isConfirmStep ? 'Re-enter your 4-digit PIN' : 'Set a 4-digit PIN to protect admin features')
        : 'Enter your 4-digit PIN to continue';

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
            </View>

            {/* PIN dots */}
            <View style={styles.dotsRow}>
                {[0, 1, 2, 3].map(i => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i < currentPin.length && styles.dotFilled,
                            error ? styles.dotError : null,
                        ]}
                    />
                ))}
            </View>

            {/* Error / Lockout message */}
            {locked ? (
                <View style={styles.lockoutBanner}>
                    <Text style={styles.lockoutText}>
                        🔒 Locked — try again in {lockoutSeconds}s
                    </Text>
                </View>
            ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
            ) : (
                <View style={styles.errorPlaceholder} />
            )}

            {/* Number pad */}
            <View style={styles.numpad}>
                {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']].map(
                    (row, ri) => (
                        <View key={ri} style={styles.numpadRow}>
                            {row.map((digit, ci) => {
                                if (digit === '') {
                                    return <View key={ci} style={styles.numpadEmpty} />;
                                }
                                if (digit === '⌫') {
                                    return (
                                        <TouchableOpacity
                                            key={ci}
                                            style={styles.numpadKey}
                                            onPress={handleBackspace}
                                            disabled={locked}
                                        >
                                            <Text style={[styles.numpadText, locked && styles.numpadDisabled]}>
                                                ⌫
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                }
                                return (
                                    <TouchableOpacity
                                        key={ci}
                                        style={styles.numpadKey}
                                        onPress={() => handleDigitPress(digit)}
                                        disabled={locked}
                                    >
                                        <Text style={[styles.numpadText, locked && styles.numpadDisabled]}>
                                            {digit}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )
                )}
            </View>

            {/* Cancel button */}
            <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    lockIcon: {
        fontSize: 40,
        marginBottom: 12,
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        color: '#999',
        fontSize: 14,
        textAlign: 'center',
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 20,
    },
    dot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#555',
        backgroundColor: 'transparent',
    },
    dotFilled: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    dotError: {
        borderColor: '#ef4444',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 13,
        marginBottom: 16,
        height: 20,
    },
    errorPlaceholder: {
        height: 36,
    },
    lockoutBanner: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 16,
    },
    lockoutText: {
        color: '#ef4444',
        fontSize: 14,
        fontWeight: '600',
    },
    numpad: {
        width: '100%',
        maxWidth: 280,
    },
    numpadRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    numpadKey: {
        width: 72,
        height: 56,
        borderRadius: 12,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
    },
    numpadEmpty: {
        width: 72,
        height: 56,
    },
    numpadText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '600',
    },
    numpadDisabled: {
        opacity: 0.3,
    },
    cancelButton: {
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 32,
    },
    cancelText: {
        color: '#999',
        fontSize: 15,
    },
});

export default PinEntryScreen;
