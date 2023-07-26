import { initTRPC } from '@trpc/server';
import type { HttpContext } from './context';

export const t = initTRPC.context<HttpContext>().create();