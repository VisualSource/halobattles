import { Tooltip } from "flowbite-react";
import { usePlayerCredits, usePlayerUnitCap } from '../hooks/usePlayer';

const Overlay: React.FC = () => {
    const credits = usePlayerCredits();
    const unitcap = usePlayerUnitCap();

    return (
        <div className="absolute top-0 left-0 z-10">
            <div className="bg-gray-900 flex p-2 items-center gap-4 rounded-br-md shadow-lg">
                <img className="h-8 w-8 rounded-md" src="/Basic_Elements_(128).jpg" alt="icon" />
                <div className="flex flex-col">
                    <h1 className="font-bold text-lg">Username</h1>
                    <div className="flex text-white gap-2">
                        <Tooltip content="Credits">
                            <div className="flex items-center gap-1">
                                <svg className="text-white h-4 w-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 11 20">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M1.75 15.363a4.954 4.954 0 0 0 2.638 1.574c2.345.572 4.653-.434 5.155-2.247.502-1.813-1.313-3.79-3.657-4.364-2.344-.574-4.16-2.551-3.658-4.364.502-1.813 2.81-2.818 5.155-2.246A4.97 4.97 0 0 1 10 5.264M6 17.097v1.82m0-17.5v2.138" />
                                </svg>
                                <span>{credits.toLocaleString()}</span>
                            </div>
                        </Tooltip>
                        <Tooltip content="Unit Cap">
                            <div className="flex items-center gap-1">
                                <svg className="h-4 w-4 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 19">
                                    <path d="M14.5 0A3.987 3.987 0 0 0 11 2.1a4.977 4.977 0 0 1 3.9 5.858A3.989 3.989 0 0 0 14.5 0ZM9 13h2a4 4 0 0 1 4 4v2H5v-2a4 4 0 0 1 4-4Z" />
                                    <path d="M5 19h10v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2ZM5 7a5.008 5.008 0 0 1 4-4.9 3.988 3.988 0 1 0-3.9 5.859A4.974 4.974 0 0 1 5 7Zm5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5-1h-.424a5.016 5.016 0 0 1-1.942 2.232A6.007 6.007 0 0 1 17 17h2a1 1 0 0 0 1-1v-2a5.006 5.006 0 0 0-5-5ZM5.424 9H5a5.006 5.006 0 0 0-5 5v2a1 1 0 0 0 1 1h2a6.007 6.007 0 0 1 4.366-5.768A5.016 5.016 0 0 1 5.424 9Z" />
                                </svg>
                                <span>{unitcap.toLocaleString()}</span>
                            </div>
                        </Tooltip>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default Overlay;