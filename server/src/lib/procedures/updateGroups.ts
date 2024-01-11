import { z } from 'zod';
import { procedure } from '../context.js';

const group = z.array(z.object({
    count: z.coerce.number(),
    id: z.string().uuid()
})).optional();

const schema = z.object({
    node: z.string().uuid(),
    group_1: group,
    group_2: group,
    group_3: group,
});

export type UpdateGroupSchema = z.infer<typeof schema>;

const updateGroup = procedure.input(schema).mutation(({ ctx, input }) => {



});

export default updateGroup;