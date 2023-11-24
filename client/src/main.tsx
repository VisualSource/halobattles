import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import ReactDOM from 'react-dom/client';
import React from 'react';

import 'react-toastify/dist/ReactToastify.css';

import { ThemeProvider } from './components/theme-provider.tsx';
//import { trpc, trpcClient } from './lib/trpc.ts';
import { router } from './router.tsx';

import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="game-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastContainer theme="dark" position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
