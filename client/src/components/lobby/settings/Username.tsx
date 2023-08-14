import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { User } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { trpc } from '@/lib/network';

const Username: React.FC = () => {
    const form = useForm<{ username: string; }>({
        defaultValues: {
            username: ""
        }
    })
    const [isOpen, setIsOpen] = useState(false);
    const setUsername = trpc.setUsername.useMutation();

    const onSubmit = async (state: { username: string; }) => {
        try {
            await setUsername.mutateAsync(state.username);
            setIsOpen(false);
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={(value) => setIsOpen(value)}>
            <SheetTrigger asChild>
                <div tabIndex={-1} role="menuitem" className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-slate-100 focus:text-slate-900 hover:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-800 dark:focus:text-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-50">
                    <User className='mr-2 h-4 w-4' />
                    <span>Edit Name</span>
                </div>
            </SheetTrigger>
            <SheetContent className="text-white">
                <SheetHeader>
                    <SheetTitle>Edit Username</SheetTitle>
                    <SheetDescription>
                        Change the player that is used ingame.
                    </SheetDescription>
                </SheetHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <FormField control={form.control} rules={{ minLength: { message: "Username must be more the 3 chars.", value: 3 }, maxLength: { message: "Usernamer must be less then 20", value: 20 } }} name="username" render={({ field }) => (
                            <FormItem className="mb-2">
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <Input autoComplete='off' placeholder='shadcn' {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <SheetFooter>
                            <Button type="submit" disabled={form.formState.isSubmitting || form.formState.isLoading}>Save changes</Button>
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet >
    );
}

export default Username;