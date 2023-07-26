import { gameRouter } from './routers/game';
import { uiRouter } from './routers/ui';
import { t } from './trpc';

export const appRouter = t.mergeRouters(gameRouter, uiRouter);