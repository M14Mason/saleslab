import { useLayoutEffect, type RefObject } from "react";
import gsap from "gsap";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Staggered fade-up for children marked data-anim. Cleans up via gsap.context. */
export function useEntrance(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useLayoutEffect(() => {
    if (!scope.current || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-anim]", { y: 16, opacity: 0, duration: 0.5, stagger: 0.06, ease: "power2.out" });
    }, scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
