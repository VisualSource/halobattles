import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const __dirname = (meta: string) => dirname(fileURLToPath(meta)); 