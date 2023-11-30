import moveGroup from './lib/procedures/moveGroup.js';
import { t, subscription } from './lib/context.js';
import getMap from './lib/procedures/getMap.js';

export const router = t.router({
    getMap,
    moveGroup,
    /*addPlayer: procedure.input(z.object({
        color: z.number(),
        name: z.string().min(1),
        team: z.nativeEnum(Team)
    })).mutation(global.AddPlayer),
    removePlayer: procedure.input(z.object({
        uuid: z.string().uuid()
    })).mutation(global.RemovePlayer),
    updatePlayer: procedure.input(z.object({
        uuid: z.string().uuid(),
        props: z.object({
            team: z.nativeEnum(Team).optional(),
            name: z.string().min(1).optional(),
            color: z.number().optional()
        })
    })).mutation(global.UpdatePlayer),
    startGame: procedure.mutation(global.StartGame),
    endGame: procedure.mutation(global.EndGame),

    getMap: procedure.query(global.GetMap),
    dropGroup: procedure.input(z.object({
        id: z.string().uuid()
    })).mutation(global.DropGroup),
    moveGroup: procedure.input(z.object({
        to: z.string().uuid(),
        from: z.string().uuid()
    })).mutation(global.MoveGroup),
    dropUnit: procedure.mutation(global.DropUnit),
    moveUnit: procedure.mutation(global.MoveUnit),*/

    /*buy: procedure.input(z.object({
        id: z.number(),
        amount: z.number()
    })).mutation(global.Buy),
    sell: procedure.input(z.object({
        id: z.number(),
        amount: z.number()
    })).mutation(global.Sell),*/

    onMoveGroup: subscription("moveGroup"),
    onStartGame: subscription("startGame"),
    onEndGame: subscription("endGame"),
    onAddPlayer: subscription("addPlayer"),
    onRemovePlayer: subscription("removePlayer"),
    onUpdatePlayer: subscription("updatePlayer"),
});