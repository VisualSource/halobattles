import { Component } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetClose, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const Faction: React.FC = () => {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <div tabIndex={-1} role="menuitem" className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-slate-100 focus:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-800 dark:focus:text-slate-50" data-radix-collection-item>
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
                <div className="grid gap-4 py-4">
                    <Select>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Faction" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
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
                                <SelectItem value="BANISHED">
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
                </div>
                <SheetFooter>
                    <SheetClose asChild>
                        <Button type="submit">Save changes</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet >
    );
}

export default Faction;