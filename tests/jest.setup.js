/* Jest setup: stub minimal browser globals needed by pdfjs-dist when running in Node */

global.DOMMatrix ||= class {};
global.ImageData ||= class {};
global.Path2D ||= class {};

// Enable debug output
process.env.DEBUG = '*';

// Detect --debug flag to refine future use if needed
const debugArg = process.argv.find((arg) => arg.startsWith('--debug'));
const debugEnabled = true;
const debugKeyword = debugArg?.includes('=') ? debugArg.split('=')[1] : '';

// Simple debug function
function debug(...args) {
  if (debugEnabled) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

// Expose globally
global.debug = debug;
global.debugEnabled = debugEnabled;
global.debugKeyword = debugKeyword; 