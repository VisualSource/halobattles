import { initTRPC } from '@trpc/server';
import type { HttpContext } from './context.js';

export const t = initTRPC.context<HttpContext>().create();