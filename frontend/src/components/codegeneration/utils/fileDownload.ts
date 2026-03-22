/**
 * Utility functions for file downloads
 */

import JSZip from 'jszip';
import { CodeGenerationResult } from '../../../models/types';

/**
 * Download a single file to the user's computer
 * @param content The content of the file
 * @param filename The name of the file to download
 */
export const downloadFile = (content: string, filename: string): void => {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

/**
 * Download all generated files as a zip archive
 * @param files Array of generated code files
 * @param zipFilename Optional name for the zip file (default: 'generated-artifacts.zip')
 */
export const downloadAllFilesAsZip = async (
  files: CodeGenerationResult[],
  zipFilename: string = 'generated-artifacts.zip'
): Promise<void> => {
  if (!files || files.length === 0) return;
  
  const zip = new JSZip();
  files.forEach((file) => {
    zip.file(file.filename || 'file.txt', file.content || '');
  });
  
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
