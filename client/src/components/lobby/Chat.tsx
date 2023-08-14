import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from 'lucide-react';
import { cn } from "@/lib/utils";

const Chat: React.FC = () => {
    return (
        <section data-name="chat" className="flex flex-col col-span-1 col-start-2 row-start-3">
            <h1 className="font-bold p-1 text-lg">Chat</h1>
            <hr />
            <ScrollArea className="p-2">
                <ul className="flex-grow ml-4 space-y-4 px-2">
                    {Array.from({ length: 200 }).map((_, i) => (
                        <li key={i} className={cn({ "justify-end": i % 2 }, "flex")}>
                            <div className={cn({ "bg-slate-800": !(i % 2), "bg-slate-100 text-slate-900": (i % 2) }, "flex w-max max-w-[75%] flex-col gap-1 rounded-lg px-3 py-2 text-sm")}>
                                <span className="font-bold mr-0.5">Username:</span>
                                Some very long message
                            </div>
                        </li>
                    ))}
                </ul>
            </ScrollArea>
            <form className="flex gap-2" onSubmit={(ev) => {
                ev.preventDefault();
                (ev.target as HTMLFormElement).reset();
            }}>
                <Input placeholder="Enter a message" />
                <Button variant="default" size="icon" type="submit">
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </section>
    );
}

export default Chat;