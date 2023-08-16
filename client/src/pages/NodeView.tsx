import { Link, Outlet, type To, NavLink, useParams, useMatches, generatePath } from "react-router-dom";
import { Users2, UserPlus2, PackagePlus, Info, X, AlertCircle, Boxes, ChevronLeft } from 'lucide-react';
import useGetNode, { useIsNodeOwner, useIsNodeContested } from "../hooks/useGetNode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";


const NodeView: React.FC = () => {
    const isContested = useIsNodeContested();
    const isOwner = useIsNodeOwner();
    const matches = useMatches();
    const { id } = useParams();
    const node = useGetNode();

    if (isContested) {
        return (
            <div className="absolute top-0 left-0 flex bg-gray-800 bg-opacity-50 w-full h-screen z-50 flex-col justify-center items-center dark:text-white">
                <div id="popup-modal" tabIndex={-1} className="z-50 p-4 overflow-x-hidden overflow-y-auto md:inset-0">
                    <div className="relative w-full max-w-md max-h-full">
                        <div className="relative rounded-lg shadow bg-gray-700">
                            <Button size="icon" variant="ghost">
                                <X className="h-3 w-3" />
                                <span className="sr-only">Close modal</span>
                            </Button>
                            <div className="p-6 text-center">
                                <AlertCircle className="mx-auto mb-4 h-8 w-8" />
                                <h3 className="mb-5 text-lg font-normal text-gray-400">This location is contested. Please wait until the battle is finished to view this location.</h3>
                                <Link to={-1 as To} className="focus:ring-4 focus:outline-none rounded-lg border text-sm font-medium px-5 py-2.5 focus:z-10 bg-gray-700 text-gray-300 border-gray-500 hover:text-white hover:bg-gray-600 focus:ring-gray-600">Ok</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute top-0 left-0 flex bg-gray-800 bg-opacity-50 w-full h-full z-50 flex-col justify-center items-center dark:text-white">
            <div className="h-3/4 w-3/4 bg-gray-700 rounded-md border border-gray-600 shadow grid grid-header-row">
                <div className="p-2 border-b border-gray-600 divide-x-2 flex gap-2">
                    <Link to={-1 as To} type="button" className={buttonVariants({ variant: "default", size: "icon" })}>
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Icon description</span>
                    </Link>
                    <div className="flex items-center pl-2 w-full">
                        <h5 className="font-bold">{node?.name}</h5>
                        <h5 className="font-bold ml-auto">{(matches[2].handle as { name: string })?.name}</h5>
                    </div>
                </div>
                <div className="flex max-h-full">
                    <div className="flex flex-col bg-gray-800 h-full gap-4 w-11 py-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <NavLink data-tooltip-placement="right" data-tooltip-target="tooltip-units" end replace className={({ isActive }) => cn("p-2 text-neutral-300 flex justify-center items-center hover:text-white", { "text-blue-500 hover:text-blue-400": isActive })} to={generatePath("/game/view/node/:id", { id: id ?? null })}>
                                    <Users2 className="h-6 w-6" />
                                </NavLink>
                            </TooltipTrigger>
                            <TooltipContent side="left">Units</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <NavLink className={({ isActive }) => cn("p-2 text-neutral-300 flex justify-center items-center hover:text-white", { "text-blue-500 hover:text-blue-400": isActive })} replace to={generatePath("/game/view/node/:id/buildings", { id: id ?? null })}>
                                    <Boxes className="h-6 w-6" />
                                </NavLink>
                            </TooltipTrigger>
                            <TooltipContent side="left">Buildings</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <NavLink className={({ isActive }) => cn("p-2 text-neutral-300 flex justify-center items-center hover:text-white", { "text-blue-500 hover:text-blue-400": isActive })} replace to={generatePath("/game/view/node/:id/info", { id: id ?? null })}>
                                    <Info className="h-6 w-6" />
                                </NavLink>
                            </TooltipTrigger>
                            <TooltipContent side="left">Info</TooltipContent>
                        </Tooltip>
                        {isOwner ? (
                            <>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <NavLink className={({ isActive }) => cn("p-2 text-neutral-300 flex justify-center items-center hover:text-white", { "text-blue-500 hover:text-blue-400": isActive })} replace to={generatePath("/game/view/node/:id/queue-units", { id: id ?? null })}>
                                            <UserPlus2 className="h-6 w-6" />
                                        </NavLink>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">Unit Queue</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <NavLink className={({ isActive }) => cn("p-2 text-neutral-300 flex justify-center items-center hover:text-white", { "text-blue-500 hover:text-blue-400": isActive })} replace to={generatePath("/game/view/node/:id/queue-buildings", { id: id ?? null })}>
                                            <PackagePlus className="h-6 w-6" />
                                        </NavLink>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">Building Queue</TooltipContent>
                                </Tooltip>
                            </>
                        ) : null}
                    </div>
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

export default NodeView;