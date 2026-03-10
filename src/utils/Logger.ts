/**
 * Production-safe logger.
 * - In __DEV__ mode: all levels log normally.
 * - In production: debug() is a no-op to prevent performance degradation
 *   and biometric metadata leakage via logcat.
 */

const isDev = __DEV__;

const Logger = {
    /** Debug-level — disabled in production builds */
    debug: isDev
        ? (tag: string, ...args: any[]) => console.log(`[${tag}]`, ...args)
        : (_tag: string, ..._args: any[]) => { },

    /** Info-level — always logs */
    info: (tag: string, ...args: any[]) => console.log(`[${tag}]`, ...args),

    /** Warning-level — always logs */
    warn: (tag: string, ...args: any[]) => console.warn(`[${tag}]`, ...args),

    /** Error-level — always logs */
    error: (tag: string, ...args: any[]) => console.error(`[${tag}]`, ...args),
};

export default Logger;
