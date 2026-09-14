import { useEffect, useRef } from 'react';

export function useCardGesture(enabled: boolean, next: () => Promise<boolean>) {
  const card = useRef<HTMLElement>(null);
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const element = card.current;
    if (!element || !enabled) return;
    let origin: { x: number; y: number; id: number } | null = null;
    let distance = 0, wheel = 0, cooldown = 0;
    let switching = false, disposed = false;
    let timer = 0;
    let animation: Animation | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (value: number) => {
      distance = Math.min(240, Math.max(0, value));
      element.style.transform = `translateY(${distance}px)`;
      element.style.opacity = String(1 - distance / 800);
    };
    const animate = async (frames: Keyframe[], duration: number) => {
      animation?.cancel();
      animation = element.animate(frames, { duration: reduced ? 1 : duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      try { await animation.finished; } catch { /* Interrupted by navigation or another gesture. */ }
    };
    const reset = async () => {
      await animate([{ transform: `translateY(${distance}px)`, opacity: 1 - distance / 800 }, { transform: 'translateY(0)', opacity: 1 }], 220);
      if (!disposed) { animation?.cancel(); draw(0); }
    };
    const advance = async () => {
      if (switching || disposed) return;
      switching = true; origin = null; wheel = 0;
      element.classList.remove('card-dragging');
      element.setAttribute('aria-busy', 'true');
      await animate([{ transform: `translateY(${distance}px)`, opacity: 1 - distance / 800 }, { transform: `translateY(${window.innerHeight}px)`, opacity: 0 }], 230);
      if (disposed) return;
      const changed = await nextRef.current();
      if (disposed) return;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (disposed) return;
      await animate([{ transform: `translateY(${changed ? -45 : 30}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], 280);
      if (disposed) return;
      animation?.cancel(); draw(0); switching = false; cooldown = Date.now() + 450;
      element.removeAttribute('aria-busy');
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || switching || (event.target as HTMLElement).closest('button,a,input,textarea,select')) return;
      animation?.cancel(); draw(0);
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
      element.setPointerCapture(event.pointerId);
      element.classList.add('card-dragging');
    };
    const move = (event: PointerEvent) => {
      if (!origin || event.pointerId !== origin.id) return;
      draw(event.clientY - origin.y);
    };
    const up = (event: PointerEvent) => {
      if (!origin || event.pointerId !== origin.id) return;
      const dy = event.clientY - origin.y, dx = event.clientX - origin.x;
      origin = null;
      element.classList.remove('card-dragging');
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (dy > 65 && dy > Math.abs(dx) * 1.5) void advance(); else void reset();
    };
    const cancel = () => { if (origin) { origin = null; element.classList.remove('card-dragging'); void reset(); } };
    const scroll = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (switching || Date.now() < cooldown || origin || (event.deltaY < 0 && wheel === 0)) return;
      event.preventDefault();
      clearTimeout(timer);
      animation?.cancel();
      wheel = Math.max(0, wheel + event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
      draw(wheel * .7);
      if (wheel >= 100) void advance();
      else timer = window.setTimeout(() => { wheel = 0; void reset(); }, 160);
    };
    const preventTouchScroll = (event: TouchEvent) => { if (origin && event.cancelable) event.preventDefault(); };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', cancel);
    element.addEventListener('touchmove', preventTouchScroll, { passive: false });
    element.addEventListener('wheel', scroll, { passive: false });
    return () => {
      disposed = true; clearTimeout(timer); animation?.cancel();
      element.style.removeProperty('transform'); element.style.removeProperty('opacity');
      element.classList.remove('card-dragging'); element.removeAttribute('aria-busy');
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', cancel);
      element.removeEventListener('touchmove', preventTouchScroll); element.removeEventListener('wheel', scroll);
    };
  }, [enabled]);
  return card;
}
