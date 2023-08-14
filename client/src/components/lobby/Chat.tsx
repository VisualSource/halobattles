import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from 'lucide-react';
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/network";
import type { UUID } from 'server';
import { user } from '@/lib/user';

const Chat: React.FC = () => {
    const messageContainer = useRef<HTMLUListElement>(null);
    const [messages, setMessages] = useState<{ msg: string; username: string; id: UUID; }[]>([]);
    const setMap = trpc.sendMsg.useMutation();
    trpc.onMsg.useSubscription(undefined, {
        onData(data) {
            setMessages((current) => [...current, data]);
        },
        onError(err) {
            console.error(err);
        },
    });

    useEffect(() => {
        messageContainer.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, [messages]);

    return (
        <section data-name="chat" className="flex flex-col col-span-1 col-start-2 row-start-3">
            <h1 className="font-bold p-1 text-lg">Chat</h1>
            <hr />
            <ScrollArea className="p-2">
                <ul ref={messageContainer} className="flex-grow ml-4 space-y-4 px-2">
                    {messages.map((value, i) => (
                        <li id={`message-idx-${i}`} key={i} className={cn({ "justify-end": value.id === user.id }, "flex")}>
                            <div className={cn({ "bg-slate-800": value.id !== user.id, "bg-slate-100 text-slate-900": user.id === value.id }, "flex w-max max-w-[75%] flex-col gap-1 rounded-lg px-3 py-2 text-sm")}>
                                <span className="font-bold mr-0.5">{value.username}:</span>
                                {value.msg}
                            </div>
                        </li>
                    ))}
                </ul>
            </ScrollArea>
            <form className="flex gap-2" onSubmit={(ev) => {
                ev.preventDefault();
                try {
                    const data = new FormData(ev.target as HTMLFormElement);
                    const message = data.get("input")?.toString();
                    if (!message || message.length < 0 || message.length > 255) return;
                    setMap.mutateAsync(message);
                    (ev.target as HTMLFormElement).reset();
                } catch (error) {
                    console.error(error);
                }
            }}>
                <Input autoComplete="off" placeholder="Enter a message" name="input" />
                <Button variant="default" size="icon" type="submit">
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </section>
    );
}

export default Chat;