import { fileURLToPath } from 'node:url';
import { dirname } from "node:path";


const __getFilename = () => fileURLToPath(import.meta.url);
const __getDirname = () => dirname(__getFilename());

export const __dirname = __getDirname();
export const __filename = __getFilename();