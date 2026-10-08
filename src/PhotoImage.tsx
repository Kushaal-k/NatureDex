import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { backendFetch } from './connection';
import { getCachedPhoto, putCachedPhoto } from './snapshot';

export function PhotoImage({src, ...props}: ImgHTMLAttributes<HTMLImageElement>) {
  const privatePhoto = typeof src === 'string' && src.startsWith('/photos/');
  const [resolved, setResolved] = useState<{source:string;url:string} | null>(null);
  useEffect(() => {
    if (!privatePhoto || !src) return;
    let alive = true;
    let objectUrl = '';
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    (async () => {
      const cached = await getCachedPhoto(src).catch(() => undefined);
      let blob = cached?.blob;
      if (!blob) {
        const response = await backendFetch(src, {signal:abort.signal});
        if (!response.ok) return;
        blob = await response.blob();
        await putCachedPhoto(src, blob).catch(() => {});
      }
      if (alive) { objectUrl = URL.createObjectURL(blob); setResolved({source:src,url:objectUrl}); }
    })().catch(() => {});
    return () => { alive = false; clearTimeout(timer); abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, privatePhoto]);
  return <img {...props} src={privatePhoto ? resolved?.source === src ? resolved.url : undefined : src} />;
}
