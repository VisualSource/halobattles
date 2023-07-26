import { Link, Outlet, type To, NavLink, useParams, useMatches, generatePath } from "react-router-dom";
import { Tooltip } from 'flowbite-react';
import useGetNode from "../hooks/useGetNode";

const NodeView: React.FC = () => {
    const matches = useMatches();
    const { id } = useParams();
    const node = useGetNode();

    return (
        <div className="absolute top-0 left-0 flex bg-gray-800 bg-opacity-50 w-full h-full z-50 flex-col justify-center items-center">
            <div className="h-3/4 w-3/4 bg-gray-700 rounded-md border border-gray-600 shadow grid grid-header-row">
                <div className="p-2 border-b border-gray-600 divide-x-2 flex">
                    <Link to={-1 as To} type="button" className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-md text-sm p-2.5 text-center inline-flex items-center mr-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">
                        <svg className="w-4 h-4 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 10">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5H1m0 0 4 4M1 5l4-4" />
                        </svg>
                        <span className="sr-only">Icon description</span>
                    </Link>
                    <div className="flex items-center pl-2 w-full">
                        <h5 className="font-bold">{node?.name}</h5>
                        <h5 className="font-bold ml-auto">{(matches[2].handle as { name: string }).name}</h5>
                    </div>
                </div>
                <div className="flex max-h-full">
                    <div className="flex flex-col bg-gray-800 h-full w-11">
                        <Tooltip content="Units" placement="left" arrow={false}>
                            <NavLink data-tooltip-placement="right" data-tooltip-target="tooltip-units" end replace className={({ isActive }) => `p-2 text-neutral-300 flex justify-center items-center hover:text-white ${isActive ? "text-blue-500 hover:text-blue-400" : ""}`} to={generatePath("/view/node/:id", { id: id ?? null })}>
                                <svg className="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 19">
                                    <path d="M14.5 0A3.987 3.987 0 0 0 11 2.1a4.977 4.977 0 0 1 3.9 5.858A3.989 3.989 0 0 0 14.5 0ZM9 13h2a4 4 0 0 1 4 4v2H5v-2a4 4 0 0 1 4-4Z" />
                                    <path d="M5 19h10v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2ZM5 7a5.008 5.008 0 0 1 4-4.9 3.988 3.988 0 1 0-3.9 5.859A4.974 4.974 0 0 1 5 7Zm5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5-1h-.424a5.016 5.016 0 0 1-1.942 2.232A6.007 6.007 0 0 1 17 17h2a1 1 0 0 0 1-1v-2a5.006 5.006 0 0 0-5-5ZM5.424 9H5a5.006 5.006 0 0 0-5 5v2a1 1 0 0 0 1 1h2a6.007 6.007 0 0 1 4.366-5.768A5.016 5.016 0 0 1 5.424 9Z" />
                                </svg>
                            </NavLink>
                        </Tooltip>
                        <Tooltip content="Buildings" placement="left" arrow={false}>
                            <NavLink className={({ isActive }) => `p-2 text-neutral-300 hover:text-white flex justify-center items-center ${isActive ? "text-blue-500 hover:text-blue-400" : ""}`} replace to={generatePath("/view/node/:id/buildings", { id: id ?? null })}>
                                <svg className="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 18 18">
                                    <path d="M17 16h-1V2a1 1 0 1 0 0-2H2a1 1 0 0 0 0 2v14H1a1 1 0 0 0 0 2h16a1 1 0 0 0 0-2ZM5 4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Zm0 5V8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Zm6 7H7v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3Zm2-7a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1Zm0-4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1Z" />
                                </svg>
                            </NavLink>
                        </Tooltip>
                        <Tooltip content="Info" placement="left" arrow={false}>
                            <NavLink className={({ isActive }) => `p-2 text-neutral-300 flex justify-center items-center hover:text-white ${isActive ? "text-blue-500 hover:text-blue-400" : ""}`} replace to={generatePath("/view/node/:id/info", { id: id ?? null })}>
                                <svg className="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
                                </svg>
                            </NavLink>
                        </Tooltip>
                        <Tooltip content="Unit Queue" placement="left" arrow={false}>
                            <NavLink className={({ isActive }) => `p-2 text-neutral-300 hover:text-white flex justify-center items-center ${isActive ? "text-blue-500 hover:text-blue-400" : ""}`} replace to={generatePath("/view/node/:id/queue-units", { id: id ?? null })}>
                                <svg className="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 18">
                                    <path d="M6.5 9a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM8 10H5a5.006 5.006 0 0 0-5 5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2a5.006 5.006 0 0 0-5-5Zm11-3h-2V5a1 1 0 0 0-2 0v2h-2a1 1 0 1 0 0 2h2v2a1 1 0 0 0 2 0V9h2a1 1 0 1 0 0-2Z" />
                                </svg>
                            </NavLink>
                        </Tooltip>
                        <Tooltip content="Building Queue" placement="left" arrow={false}>
                            <NavLink className={({ isActive }) => `p-2 text-neutral-300 hover:text-white flex justify-center items-center ${isActive ? "text-blue-500 hover:text-blue-400" : ""}`} replace to={generatePath("/view/node/:id/queue-buildings", { id: id ?? null })}>
                                <svg className="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M18 7.5h-.423l-.452-1.09.3-.3a1.5 1.5 0 0 0 0-2.121L16.01 2.575a1.5 1.5 0 0 0-2.121 0l-.3.3-1.089-.452V2A1.5 1.5 0 0 0 11 .5H9A1.5 1.5 0 0 0 7.5 2v.423l-1.09.452-.3-.3a1.5 1.5 0 0 0-2.121 0L2.576 3.99a1.5 1.5 0 0 0 0 2.121l.3.3L2.423 7.5H2A1.5 1.5 0 0 0 .5 9v2A1.5 1.5 0 0 0 2 12.5h.423l.452 1.09-.3.3a1.5 1.5 0 0 0 0 2.121l1.415 1.413a1.5 1.5 0 0 0 2.121 0l.3-.3 1.09.452V18A1.5 1.5 0 0 0 9 19.5h2a1.5 1.5 0 0 0 1.5-1.5v-.423l1.09-.452.3.3a1.5 1.5 0 0 0 2.121 0l1.415-1.414a1.5 1.5 0 0 0 0-2.121l-.3-.3.452-1.09H18a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 18 7.5Zm-8 6a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
                                </svg>
                            </NavLink>
                        </Tooltip>
                    </div>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

export default NodeView;