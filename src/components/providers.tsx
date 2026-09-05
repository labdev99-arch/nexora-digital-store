'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {TooltipProvider} from '@radix-ui/react-tooltip';
import {domAnimation, LazyMotion, MotionConfig} from 'framer-motion';
import {ThemeProvider} from 'next-themes';
import {useState, type ReactNode} from 'react';
import {Toaster} from 'sonner';

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {staleTime: 30_000, refetchOnWindowFocus: false},
          mutations: {retry: 0}
        }
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      enableColorScheme
      storageKey="nexora-theme"
      disableTransitionOnChange={false}
    >
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={250} skipDelayDuration={100}>
              {children}
              <Toaster
                richColors
                closeButton
                position="top-center"
                toastOptions={{className: 'nexora-toast'}}
              />
            </TooltipProvider>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
