'use client';

import {Check, Copy, MessageCircle, Send, Share2} from 'lucide-react';
import {useState} from 'react';

import {Button} from '@/components/ui/button';

export function ShareActions({
  url,
  message,
  labels
}: {
  url: string;
  message: string;
  labels: {whatsapp: string; telegram: string; x: string; copy: string; copied: string};
}) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedMessage = encodeURIComponent(message);
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="growth-share-actions">
      <Button asChild variant="outline" size="sm">
        <a
          href={`https://wa.me/?text=${encodedMessage}%20${encodedUrl}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle aria-hidden="true" /> {labels.whatsapp}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}`}
          target="_blank"
          rel="noreferrer"
        >
          <Send aria-hidden="true" /> {labels.telegram}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedMessage}`}
          target="_blank"
          rel="noreferrer"
        >
          <Share2 aria-hidden="true" /> {labels.x}
        </a>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? labels.copied : labels.copy}
      </Button>
    </div>
  );
}
