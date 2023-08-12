import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from "react-router-dom";
import ReactDOM from 'react-dom/client'
import React from 'react'
import { trpc, client } from './lib/network.ts';
import { router } from './router.tsx';

import './index.css';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider } from './components/theme-provider.tsx';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="game-ui-theme">
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  </React.StrictMode>,
)
