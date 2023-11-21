import { fileURLToPath } from 'node:url';
import { dirname } from "node:path";


const __getFilename = (root?: string) => fileURLToPath(root ?? import.meta.url);
export const __getDirname = (root?: string) => dirname(__getFilename(root));

export const __dirname = __getDirname();
export const __filename = __getFilename();