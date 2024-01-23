import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const __dirname = (meta: string) => dirname(fileURLToPath(meta));
export const getFile = (file: string, dirname: string) => resolve(__dirname(dirname), file);
export const getFilePathURL = (file: string, dirname: string) => pathToFileURL(resolve(__dirname(dirname), file)).href;