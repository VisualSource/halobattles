import { useRouteError } from "react-router-dom";

const ErrorPage: React.FC = () => {
    const error = useRouteError();
    return (
        <div className="flex flex-col items-center justify-center w-full h-full">
            <h1 className="text-6xl mb-8 font-bold">Oops!</h1>
            <p className="text-xl mb-2">Sorry, an unexpected error has occurred.</p>
            <p className="text-gray-400">
                <i>{(error as Response)?.statusText ?? (error as Error)?.message}</i>
            </p>
        </div>
    );
}

export default ErrorPage;