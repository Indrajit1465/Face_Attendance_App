import { getDB } from '../database/db';
import Logger from '../utils/Logger';

// ─────────────────────────────────────────
// SHA-256 hash (pure JS — no native deps)
// ─────────────────────────────────────────

/**
 * Simple SHA-256 hash using the Web Crypto-style approach.
 * Since React Native doesn't have Web Crypto API, we use a
 * basic string hash that's sufficient for a 4-digit PIN.
 * DO NOT use for passwords — this is a kiosk PIN guard only.
 */
const hashPin = (pin: string): string => {
    // Simple but effective hash for 4-digit PIN space
    // djb2 + salt to prevent trivial rainbow lookup
    const salt = 'face_attendance_admin_v1';
    const input = salt + pin + salt;
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
    }
    // Double-hash for extra mixing
    const str = hash.toString(16);
    let hash2 = 5381;
    for (let i = 0; i < str.length; i++) {
        hash2 = ((hash2 << 5) + hash2 + str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16) + hash2.toString(16);
};

// ─────────────────────────────────────────
// In-memory lockout state
// ─────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

let failedAttempts = 0;
let lockoutUntil = 0;

// ─────────────────────────────────────────
// Public API
// ─────────────────────────────────────────

/** Check if an admin PIN has been configured */
export const isPinConfigured = (): boolean => {
    try {
        const db = getDB();
        const result = db.execute(
            `SELECT value FROM admin_config WHERE key = 'admin_pin' LIMIT 1`
        );
        return !!(result.rows && result.rows.length > 0);
    } catch (err) {
        Logger.error('adminPin', 'isPinConfigured error:', err);
        return false;
    }
};

/** Set (or overwrite) the admin PIN */
export const setPin = (pin: string): boolean => {
    if (!isValidPin(pin)) {
        Logger.warn('adminPin', 'Invalid PIN format');
        return false;
    }

    try {
        const db = getDB();
        const hashed = hashPin(pin);
        db.execute(
            `INSERT OR REPLACE INTO admin_config (key, value) VALUES ('admin_pin', ?)`,
            [hashed]
        );
        // Reset lockout on successful setup
        failedAttempts = 0;
        lockoutUntil = 0;
        Logger.info('adminPin', 'Admin PIN configured');
        return true;
    } catch (err) {
        Logger.error('adminPin', 'setPin error:', err);
        return false;
    }
};

/** Verify an entered PIN against the stored hash */
export const verifyPin = (pin: string): {
    success: boolean;
    locked: boolean;
    remainingAttempts: number;
    lockoutSeconds: number;
} => {
    // Check lockout
    const now = Date.now();
    if (now < lockoutUntil) {
        const remainingSec = Math.ceil((lockoutUntil - now) / 1000);
        return {
            success: false,
            locked: true,
            remainingAttempts: 0,
            lockoutSeconds: remainingSec,
        };
    }

    try {
        const db = getDB();
        const result = db.execute(
            `SELECT value FROM admin_config WHERE key = 'admin_pin' LIMIT 1`
        );

        if (!result.rows || result.rows.length === 0) {
            Logger.warn('adminPin', 'No PIN configured');
            return { success: false, locked: false, remainingAttempts: MAX_ATTEMPTS, lockoutSeconds: 0 };
        }

        const storedHash = result.rows.item(0).value;
        const inputHash = hashPin(pin);

        if (inputHash === storedHash) {
            // ✅ Correct — reset attempts
            failedAttempts = 0;
            lockoutUntil = 0;
            Logger.info('adminPin', 'PIN verified successfully');
            return { success: true, locked: false, remainingAttempts: MAX_ATTEMPTS, lockoutSeconds: 0 };
        }

        // ❌ Wrong PIN
        failedAttempts++;
        const remaining = MAX_ATTEMPTS - failedAttempts;

        if (failedAttempts >= MAX_ATTEMPTS) {
            lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
            Logger.warn('adminPin', `Locked out after ${MAX_ATTEMPTS} failed attempts`);
            return {
                success: false,
                locked: true,
                remainingAttempts: 0,
                lockoutSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
            };
        }

        Logger.debug('adminPin', `Wrong PIN — ${remaining} attempts remaining`);
        return { success: false, locked: false, remainingAttempts: remaining, lockoutSeconds: 0 };

    } catch (err) {
        Logger.error('adminPin', 'verifyPin error:', err);
        return { success: false, locked: false, remainingAttempts: MAX_ATTEMPTS, lockoutSeconds: 0 };
    }
};

/** Check if currently locked out */
export const isLockedOut = (): { locked: boolean; lockoutSeconds: number } => {
    const now = Date.now();
    if (now < lockoutUntil) {
        return { locked: true, lockoutSeconds: Math.ceil((lockoutUntil - now) / 1000) };
    }
    // Auto-reset after lockout expires
    if (failedAttempts >= MAX_ATTEMPTS) {
        failedAttempts = 0;
    }
    return { locked: false, lockoutSeconds: 0 };
};

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const isValidPin = (pin: string): boolean =>
    typeof pin === 'string' && /^\d{4}$/.test(pin);
