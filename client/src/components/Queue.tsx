import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useQueue, { useActiveQueueItem } from "../hooks/useQueue";
import QueueEngine from "../lib/QueueEngine";
import { ScrollArea } from './ui/scroll-area';

const QueueItem: React.FC<{ queueId: string; nodeId: string, idx: number, name: string; time: number; icon: string; }> = ({ queueId, nodeId, idx, name, time, icon }) => {
    return (
        <li className="p-2 flex gap-2 items-center">
            <img className="aspect-square h-12 rounded-sm" src={icon} alt="unit-icon" />
            <div className="flex flex-col">
                <span className="text-ellipsis overflow-hidden whitespace-nowrap font-bold">{name}</span>
                <span className="text-gray-500">{time}s</span>
            </div>
            <div className="ml-auto flex gap-1">
                <Button variant="default" size="icon" onClick={() => QueueEngine.swap(nodeId, queueId, idx + 1, idx)}>
                    <ChevronDown className="h-3 w-3" />
                </Button>
                <Button variant="default" size="icon" onClick={() => QueueEngine.swap(nodeId, queueId, idx, idx - 1)}>
                    <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="destructive" size="icon" onClick={() => QueueEngine.deqeueue(nodeId, queueId, idx)}>
                    <X className="h-3 w-3" />
                </Button>
            </div>
        </li>
    );
}

const Queue: React.FC<{ queueId: string; nodeId: string; }> = ({ nodeId, queueId }) => {
    const item = useActiveQueueItem(nodeId, queueId);
    const queue = useQueue(nodeId, queueId);

    return (
        <section className="grid grid-rows-5 overflow-hidden">
            {item ? (
                <div className='p-2 row-span-1 mt-2 flex'>
                    <img className="aspect-square h-24 rounded-md" src={item.objData.icon} alt="unit-icon" />
                    <div className="py-4 px-2 w-full">
                        <h1 className="text-4xl mb-2">{item.objData.name}</h1>
                        <div className="w-full rounded-sm bg-gray-900 relative h-4">
                            <div className="bg-blue-600 text-xs font-medium text-blue-100 text-center leading-none rounded-sm h-full" style={{ width: `${100 - ((item.time / item.objData.duration) * 100)}%` }}>
                                <span className="absolute text-center w-full left-0.5 h-full">{item.time}s</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center w-9">
                        <Button variant="destructive" size="icon" onClick={() => QueueEngine.removeCurrent(nodeId, queueId)} type="button" className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center bg-red-600 hover:bg-red-700 hover:border-red-400 focus:ring-red-800">
                            <X className="w-[15px] h-[15px]" />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className='flex row-span-1 my-2'>
                    <div className="aspect-square h-24 rounded-md border border-gray-600 ml-2"></div>
                    <div className="py-4 px-2 w-full">
                        <h1 className="text-4xl mb-2">Empty</h1>
                        <div className="w-full rounded-sm bg-gray-900 relative h-4"></div>
                    </div>
                    <div className="w-9"></div>
                </div>
            )}
            <ScrollArea className="h-full">
                <ul className="bg-gray-900 row-span-4">
                    {queue?.length ? queue.map((value, i) => (
                        <QueueItem queueId={queueId} nodeId={nodeId} idx={i} time={value.time} name={value.objData.name} icon={value.objData.icon} key={i} />
                    )) : (
                        <li className="text-center text-gray-500 p-4 h-full flex items-center justify-center">Queue is empty</li>
                    )}
                </ul>
            </ScrollArea>
        </section>
    );
}

export default Queue;