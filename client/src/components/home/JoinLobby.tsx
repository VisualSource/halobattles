import { useForm } from 'react-hook-form';
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormField, FormControl, FormLabel, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/network';
import { toast } from 'react-toastify';

const JoinLobby: React.FC = () => {
    const navigate = useNavigate();
    const join = trpc.joinLobby.useMutation();
    const form = useForm({
        defaultValues: {
            username: ""
        }
    });

    const onSubmit = async (state: { username: string; }) => {
        try {
            const isHost = await join.mutateAsync({ username: state.username });
            navigate("/lobby", { state: { isHost } });
        } catch (error) {
            toast.error((error as Error)?.message);
            //console.error(error);
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button size="lg">Start</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] text-white">
                <DialogHeader>
                    <DialogTitle>Join Lobby</DialogTitle>
                    <DialogDescription>
                        Enter a username to join the lobby.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <FormField rules={{ min: { message: "Username must be more then 3 chars.", value: 3 }, max: { message: "Username must be less then 20 chars.", value: 20 }, }} control={form.control} name="username" render={({ field }) => (
                            <FormItem className="mb-4">
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <Input autoComplete='off' placeholder="username" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <DialogFooter>
                            <Button disabled={form.formState.isSubmitting} type="submit">
                                Join
                            </Button>
                        </DialogFooter>
                    </form>
                    <FormMessage />
                </Form>
            </DialogContent>
        </Dialog >
    );
}

export default JoinLobby;