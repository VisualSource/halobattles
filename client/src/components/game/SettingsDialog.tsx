import { Settings, Moon, Sun, Computer } from 'lucide-react';
import { useTheme } from "../theme-provider";
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { TypographyH4 } from '../ui/typograph';

const SettingsDialog: React.FC = () => {
    const { theme, setTheme } = useTheme();
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon">
                    <Settings className="h-6 w-6" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] dark:text-white">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col justify-center items-center py-4">
                    <TypographyH4 className="mb-2">Set Theme</TypographyH4>
                    <div className='flex gap-2'>
                        <Button size="icon" onClick={() => setTheme("system")} variant={theme === "system" ? "default" : "outline"}>
                            <Computer className="h-4 w-4" />
                        </Button>
                        <Button size="icon" onClick={() => setTheme("light")} variant={theme === "light" ? "default" : "outline"}>
                            <Sun className="h-4 w-4" />
                        </Button>
                        <Button size="icon" onClick={() => setTheme("dark")} variant={theme === "dark" ? "default" : "outline"}>
                            <Moon className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="destructive">Exit Game</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default SettingsDialog;