import type { appRouter } from './appRouter';
export type { default as Location } from './object/Location';

export type UUID = `${string}-${string}-${string}-${string}`;

export type AppRouter = typeof appRouter;