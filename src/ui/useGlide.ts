import { useEffect, useReducer, useRef } from "react";

// Terminals don't reliably repaint at 60fps, so step on a coarse frame (the sync
// spinner ticks at 80ms; 30ms is a smooth-but-honest middle). EASE_DIVISOR gives
// an ease-out: each frame closes ~1/3 of the remaining distance, so a ~half-page
// glide settles in ~150–210ms and short jumps finish in a couple of frames.
const FRAME_MS = 30;
const EASE_DIVISOR = 3;

// Smooth-scroll wrapper around an integer scroll offset. Returns `target` verbatim
// while idle — so ordinary j/k and gg/G stay instant and synchronous (the offset
// is returned in render, never snapped post-paint) — and returns a gliding value
// only while animating. A glide starts when `nonce` bumps (a half-page command
// asked for one); a target change that arrives WITHOUT a nonce bump (plain
// navigation, a resize, a filter) cancels any in-flight glide and snaps. Rows are
// sliced by integer index, so the offset steps in whole rows.
export function useGlide(target: number, nonce: number): number {
  const rendered = useRef(target);
  const animating = useRef(false);
  const lastNonce = useRef(nonce);
  // Latest target, readable inside the timer closure so an interrupt can retarget.
  const targetRef = useRef(target);
  targetRef.current = target;
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const bumped = nonce !== lastNonce.current;
    lastNonce.current = nonce;

    if (!bumped) {
      // The window moved without a glide request (gg/G, j/k, resize, filter). Always
      // re-sync `rendered` to the target — even when idle — so the NEXT glide starts
      // from where the window actually is, not a stale pre-snap offset. (Skipping this
      // when idle was a bug: scroll down, gg to the top, then Ctrl+d glided from the
      // old scrolled offset back to 0.) Only repaint if a glide was in flight (an
      // interrupt); idle navigation already returned `target` from render, so forcing
      // would just waste a render.
      const wasAnimating = animating.current;
      animating.current = false;
      rendered.current = target;
      if (wasAnimating) force();
      return;
    }

    animating.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      const cur = rendered.current;
      const dest = targetRef.current;
      const remaining = Math.abs(dest - cur);
      if (remaining === 0) {
        animating.current = false;
        force();
        return;
      }
      const delta = Math.min(remaining, Math.max(1, Math.ceil(remaining / EASE_DIVISOR)));
      rendered.current = cur + Math.sign(dest - cur) * delta;
      force();
      timer = setTimeout(step, FRAME_MS);
    };
    step();

    // Only stop the stepping here; `animating` is cleared by step() on arrival or by
    // the interrupt branch above, so it survives this cleanup running before that.
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, nonce]);

  return animating.current ? rendered.current : target;
}
