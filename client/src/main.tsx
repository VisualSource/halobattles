import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import ReactDOM from 'react-dom/client';
import React from 'react';

import 'react-toastify/dist/ReactToastify.css';

import { ThemeProvider } from '@component/theme-provider.tsx';
//import { trpc, trpcClient } from './lib/trpc.ts';
import { router } from './router.tsx';

import './index.css';

import { queryClient } from '@lib/query.ts';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="game-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastContainer stacked theme="dark" position="bottom-right" draggable={false} />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
