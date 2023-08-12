import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Chat: React.FC = () => {
    return (
        <section data-name="chat" className="flex flex-col col-start-2 col-end-2 bg-green-600">
            <h1 className="font-bold p-1 text-lg">Chat</h1>
            <hr />
            <ScrollArea>
                <ul className="flex-grow ml-4">
                    {Array.from({ length: 200 }).map((_, i) => (
                        <li key={i} className="p-1">
                            <span className="font-bold mr-1">Username:</span>
                            Message
                        </li>
                    ))}
                </ul>
            </ScrollArea>
            <form className="flex" onSubmit={(ev) => {
                ev.preventDefault();
            }}>
                <Input />
                <Button type="submit">Send</Button>
            </form>
        </section>
    );
}

export default Chat;