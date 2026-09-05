'use client';

import * as Sentry from '@sentry/nextjs';
import {useEffect} from 'react';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  const messages =
    typeof document !== 'undefined' && document.documentElement.lang === 'ar'
      ? ar.GlobalError
      : en.GlobalError;
  return (
    <html lang="en">
      <body>
        <main className="error-state">
          <h1>{messages.title}</h1>
          <p>{messages.description}</p>
          <button type="button" onClick={reset}>
            {messages.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
