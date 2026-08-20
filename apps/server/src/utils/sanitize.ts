import path from 'path';

/**
 * Sanitizes a file path to prevent directory traversal attacks.
 * It removes `../`, `..\\`, null bytes, and ensures the path is treated as relative.
 * 
 * @param filePath The raw path provided by the client
 * @returns The sanitized path
 */
export const sanitizeFilePath = (filePath: string): string => {
  // Remove null bytes
  let safePath = filePath.replace(/\0/g, '');

  // Resolve the path against a dummy root to normalize it
  // and prevent traversal above the root directory.
  // Using '/' ensures we can easily strip it off afterwards if we want purely relative.
  const normalized = path.normalize('/' + safePath);

  // If the normalized path somehow still ends up traversing (e.g. windows absolute path quirks),
  // path.join with '/' anchors it.
  
  // Remove leading slash to make it strictly relative to whatever project root we append it to.
  const relative = normalized.replace(/^[/\\]+/, '');

  return relative;
};
