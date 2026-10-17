import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech in, text out, on the device. Uses the browser's own speech
 * recognition where it exists (Chrome, Edge, Safari, Android). Where it does
 * not, `supported` is false and the mic is simply not offered — nothing
 * pretends to listen.
 */
export function useVoice(onText) {
  const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => () => recRef.current?.abort?.(), []);

  const toggle = useCallback(() => {
    if (!Rec) return;
    if (listening) { recRef.current?.stop(); return; }
    const r = new Rec();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const text = Array.from(e.results).slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript).join(' ').trim();
      if (text) cb.current(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  }, [Rec, listening]);

  return { supported: !!Rec, listening, toggle };
}
