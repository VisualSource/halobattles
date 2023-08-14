import { User } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetClose, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { trpc } from '@/lib/network';

const Username: React.FC = () => {
    const setUsername = trpc.setUsername.useMutation();
    return (
        <Sheet>
            <SheetTrigger asChild>
                <div tabIndex={-1} role="menuitem" className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-slate-100 focus:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:focus:bg-slate-800 dark:focus:text-slate-50">
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
                <div className="grid gap-4 py-4">
                    <div className="flex flex-col gap-4">
                        <Label htmlFor="name">
                            Username
                        </Label>
                        <Input id="name" placeholder="Enter username" className="col-span-3" />
                    </div>
                </div>
                <SheetFooter>
                    <SheetClose asChild>
                        <Button type="submit" onClick={() => {
                            try {
                                setUsername.mutateAsync("Username");
                            } catch (error) {
                                console.error(error);
                            }
                        }}>Save changes</Button>
                    </SheetClose>
                </SheetFooter>
            </SheetContent>
        </Sheet >
    );
}

export default Username;