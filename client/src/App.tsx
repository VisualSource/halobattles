import { ToastContainer } from 'react-toastify';
import { Outlet } from "react-router-dom";

export default function App() {
    return (
        <>
            <Outlet />
            <ToastContainer theme="dark" position="bottom-right" />
        </>
    );
}