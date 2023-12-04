import {
    Outlet,
    createBrowserRouter,
} from "react-router-dom";
import ErrorPage from "@page/ErrorPage";
import Home from "@page/Home";
import Game from '@page/Game';
import GameUIRoot from "./components/game/Root";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Outlet />,
        errorElement: <ErrorPage />,
        children: [
            {
                path: "/",
                index: true,
                element: <Home />,
                errorElement: <ErrorPage />
            },
            {
                path: "/game",
                element: <Game />,
                errorElement: <ErrorPage />,
                children: [
                    {
                        index: true,
                        element: <GameUIRoot />
                    },
                    {
                        path: "/game/tech",
                        element: <>Tech</>,
                    },
                    {
                        path: "/game/:node",
                        element: <>Node</>
                    }
                ]
            }
            /*{
                path: "/lobby",
                element: <Lobby />,
                errorElement: <ErrorPage />
            },
            {
                path: "/game",
                element: <Game />,
                errorElement: <ErrorPage />,
                children: [
                    {
                        path: "/game/gameover",
                        element: <GameOver />,
                        errorElement: <ErrorPage />
                    },
                    {
                        path: "/game/view/node/:id",
                        element: <NodeView />,
                        children: [
                            {
                                element: <UnitManagment />,
                                index: true,
                                handle: {
                                    name: "Unit Managment"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/buildings",
                                element: <BuildingManagment />,
                                handle: {
                                    name: "Building and tech Managment"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/info",
                                element: <PlanetInfo />,
                                handle: {
                                    name: "Planet Info"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/queue-units",
                                element: <UnitQueue />,
                                handle: {
                                    name: "Unit Queue"
                                },
                                errorElement: <ErrorPage />
                            },
                            {
                                path: "/game/view/node/:id/queue-buildings",
                                element: <BuildingQueue />,
                                handle: {
                                    name: "Building Queue"
                                },
                                errorElement: <ErrorPage />
                            },
                        ]
                    }
                ]
            },*/
        ]
    }
]);

/*window.addEventListener("game-over", ev => {
    const id = (ev as CustomEvent<{ winner: string; id: string; }>).detail;
    router.navigate(`/game/gameover?name=${id.winner}&uuid=${id.id}`);
});

window.addEventListener("node-selected", (ev) => {
    const id = (ev as CustomEvent<{ id: string }>).detail.id;
    router.navigate(`/game/view/node/${id}`);
});*/