import { gameRouter } from './routers/game.js';
import { uiRouter } from './routers/ui.js';
import { t } from './trpc.js';

export const appRouter = t.mergeRouters(gameRouter, uiRouter);