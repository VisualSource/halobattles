import { useForm } from 'react-hook-form';
import { Component } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { trpc } from '@/lib/network';
import type { Factions } from 'server/src/object/GameState';

const Faction: React.FC = () => {
    const form = useForm<{ faction: Factions | "unknown" }>({
        defaultValues: {
            faction: "unknown"
        }
    });
    const setFaction = trpc.setFaction.useMutation();
    const [isOpen, setIsOpen] = useState(false);

    const onSubmit = async (state: { faction: Factions | "unknown" }) => {
        try {
            if (state.faction === "unknown") {
                form.setError("faction", { message: "Current faction is not vaild" });
                return;
            }
            await setFaction.mutateAsync(state.faction);
            setIsOpen(false);
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={value => setIsOpen(value)}>
            <SheetTrigger asChild>
                <div tabIndex={-1} role="menuitem" className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-slate-100 hover:bg-slate-100 focus:text-slate-900 hover:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-800 dark:focus:text-slate-50 dark:hover:bg-slate-800 dark:hover:text-slate-50" data-radix-collection-item>
                    <Component className="mr-2 w-4 h-4" />
                    <span>Edit Faction</span>
                </div>
            </SheetTrigger>
            <SheetContent className="text-white">
                <SheetHeader>
                    <SheetTitle>Change Faction</SheetTitle>
                    <SheetDescription>
                        Select the faction you want to play as. This changes the units, buildings, and tech you have access to.
                    </SheetDescription>
                </SheetHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <FormField control={form.control} rules={{ required: "A faction is required." }} name="faction" render={({ field }) => (
                            <FormItem className="mb-2">
                                <FormLabel>Faction</FormLabel>
                                <FormControl>
                                    <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a faction" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="unknown" disabled>
                                                    <div className='flex gap-2 items-center'>
                                                        <Avatar>
                                                            <AvatarFallback>CN</AvatarFallback>
                                                            <AvatarImage src="/Basic_Elements_(128).jpg" />
                                                        </Avatar>
                                                        <div>
                                                            No Faction
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="UNSC">
                                                    <div className='flex gap-2 items-center'>
                                                        <Avatar>
                                                            <AvatarFallback>CN</AvatarFallback>
                                                            <AvatarImage src="/vite.svg" />
                                                        </Avatar>
                                                        <div>
                                                            UNSC
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="Banished">
                                                    <div className='flex gap-2 items-center'>
                                                        <Avatar>
                                                            <AvatarFallback>CN</AvatarFallback>
                                                            <AvatarImage src="/Basic_Elements_(128).jpg" />
                                                        </Avatar>
                                                        <div>
                                                            Banished
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
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

export default Faction;