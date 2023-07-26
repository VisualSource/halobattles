import useQueue, { useActiveQueueItem } from "../hooks/useQueue";
import QueueEngine from "../lib/QueueEngine";


const QueueItem: React.FC<{ queueId: string; nodeId: string, idx: number, name: string; time: number; icon: string; }> = ({ queueId, nodeId, idx, name, time, icon }) => {
    return (
        <li className="p-2 flex gap-2 items-center">
            <img className="aspect-square h-12 rounded-sm" src={icon} alt="unit-icon" />
            <div className="flex flex-col">
                <span className="text-ellipsis overflow-hidden whitespace-nowrap font-bold">{name}</span>
                <span className="text-gray-500">{time}s</span>
            </div>
            <div className="ml-auto flex gap-1">
                <button onClick={() => QueueEngine.get().swap(nodeId, queueId, idx + 1, idx)} type="button" className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center bg-blue-600 hover:bg-blue-700 hover:border-blue-400 focus:ring-blue-800">
                    <svg className="w-2 h-2 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 10">
                        <path d="M9.207 1A2 2 0 0 0 6.38 1L.793 6.586A2 2 0 0 0 2.207 10H13.38a2 2 0 0 0 1.414-3.414L9.207 1Z" />
                    </svg>
                </button>
                <button onClick={() => QueueEngine.get().swap(nodeId, queueId, idx, idx - 1)} type="button" className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center bg-blue-600 hover:bg-blue-700 hover:border-blue-400 focus:ring-blue-800">
                    <svg className="w-2 h-2 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 10">
                        <path d="M15.434 1.235A2 2 0 0 0 13.586 0H2.414A2 2 0 0 0 1 3.414L6.586 9a2 2 0 0 0 2.828 0L15 3.414a2 2 0 0 0 .434-2.179Z" />
                    </svg>
                </button>
                <button onClick={() => QueueEngine.get().removeItem(nodeId, queueId, idx)} type="button" className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center bg-red-600 hover:bg-red-700 hover:border-red-400 focus:ring-red-800">
                    <svg className="text-white w-2 h-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
                    </svg>
                </button>
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
                            <div className="bg-blue-600 text-xs font-medium text-blue-100 text-center leading-none rounded-sm h-full" style={{ width: `${(item.objData.duration - item.time) * 10}%` }}>
                                <span className="absolute text-center w-full left-0.5 h-full">{item.time}s</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center w-9">
                        <button onClick={() => QueueEngine.get().removeCurrent(nodeId, queueId)} type="button" className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm p-2.5 text-center inline-flex items-center bg-red-600 hover:bg-red-700 hover:border-red-400 focus:ring-red-800">
                            <svg className="w-[15px] h-[15px] text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
                            </svg>
                        </button>
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
            <ul className="bg-gray-900 row-span-4 overflow-y-scroll">
                {queue?.length ? queue.map((value, i) => (
                    <QueueItem queueId={queueId} nodeId={nodeId} idx={i} time={value.time} name={value.objData.name} icon={value.objData.icon} key={i} />
                )) : (
                    <li className="text-center text-gray-500 p-4 h-full flex items-center justify-center">Queue is empty</li>
                )}
            </ul>
        </section>
    );
}

export default Queue;