import {
    createRoutesFromElements,
    createBrowserRouter,
    Route,
} from "react-router-dom";
import ErrorPage from "@page/ErrorPage";
import Home from "@page/Home";
import Game from '@page/Game';
import NodeView from "./components/game/NodeView";

export const router = createBrowserRouter(
    createRoutesFromElements(
        <Route path="/" errorElement={<ErrorPage />}>
            <Route index element={<Home />} />
            <Route path="game" element={<Game />}>
                <Route path="node/:node" element={<NodeView />} />
            </Route>
        </Route>
    ));