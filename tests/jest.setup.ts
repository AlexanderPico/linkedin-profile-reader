/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* Jest setup: stub minimal browser globals needed by pdfjs-dist when running in Node */

(global as any).DOMMatrix ??= class {};
(global as any).ImageData ??= class {};
(global as any).Path2D ??= class {}; 

// Enable debug output
process.env.DEBUG = '*';

// Debug helper function that can be controlled via command line arguments
// Usage: npm test -- --debug or npm test -- --debug=linkedin
const debugArg = process.argv.find(arg => arg.startsWith('--debug'));
const debugEnabled = true; // Always enable debug
const debugKeyword = debugArg?.includes('=') ? debugArg.split('=')[1] : '';

// Create a debug function that only logs when debug is enabled
const debug = (...args: any[]) => {
  console.log(...args);
};

// Make debug function available globally for tests
(global as any).debug = debug;
(global as any).debugEnabled = debugEnabled;
(global as any).debugKeyword = debugKeyword; 