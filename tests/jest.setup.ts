/* Jest setup: stub minimal browser globals needed by pdfjs-dist when running in Node */

(global as any).DOMMatrix ??= class {};
(global as any).ImageData ??= class {};
(global as any).Path2D ??= class {}; 