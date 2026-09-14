import { useEffect, useMemo, useState } from 'react';

export function useSpeech(text: string) {
  const supported = useMemo(() => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window, []);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const toggle = () => {
    if (!supported) return;
    if (speaking && paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      return;
    }
    if (speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.95;
    utterance.onend = stop;
    utterance.onerror = stop;
    setSpeaking(true);
    setPaused(false);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => stop, [text, supported]);
  return { supported, speaking, paused, toggle, stop };
}