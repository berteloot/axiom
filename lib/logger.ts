/**
 * Logger utility for consistent logging across the application
 * In production, only errors are logged
 */

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = {
  error: (message: string, ...args: unknown[]) => {
    // Always log errors
    console.error(message, ...args);
  },

  warn: (message: string, ...args: unknown[]) => {
    // Log warnings in development only
    if (isDevelopment) {
      console.warn(message, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    // Log info in development only
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    // Log debug in development only
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};