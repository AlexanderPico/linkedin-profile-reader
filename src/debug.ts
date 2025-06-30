// Debug helper module for controlling console output
// This module provides a debug function that can be controlled via command line arguments

import debugModule from 'debug';

const debugLog = debugModule('linkedin-pdf:parser');

// Check if debug is enabled via command line arguments
const debugArg = process.argv.find(arg => arg.startsWith('--debug'));
const debugEnabled = debugArg !== undefined;
const debugKeyword = debugArg?.includes('=') ? debugArg.split('=')[1] : '';

/**
 * Debug logging function that only outputs when debug is enabled
 * Usage: debugConsole('Some debug message', variable1, variable2);
 * 
 * To enable debug output, run with:
 * - npm test -- --debug (enables all debug output)
 * - npm test -- --debug=linkedin (enables debug output with 'linkedin' keyword)
 */
export const debugConsole = (...args: any[]): void => {
  if (debugEnabled) {
    console.log(...args);
  }
};

/**
 * Check if debug is currently enabled
 */
export const isDebugEnabled = (): boolean => debugEnabled;

/**
 * Get the current debug keyword if specified
 */
export const getDebugKeyword = (): string => debugKeyword;

/**
 * Debug function that only outputs if a specific keyword matches
 * Usage: debugIf('linkedin', 'LinkedIn-specific debug message');
 */
export const debugIf = (keyword: string, ...args: any[]): void => {
  if (debugEnabled && (debugKeyword === '' || debugKeyword === keyword)) {
    console.log(...args);
  }
};

export function setDebug(enabled: boolean) {
  if (enabled) {
    debugModule.enable('linkedin-pdf:*');
  }
}

// Export the debug function directly
export default function(msg: string, ...args: any[]) {
  debugLog(msg, ...args);
} 