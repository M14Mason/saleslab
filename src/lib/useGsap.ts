import { useLayoutEffect, type RefObject } from "react";
import gsap from "gsap";
import { reducedMotion } from "./theme";
export { reducedMotion };

/** One orchestrated entrance per page: children marked data-anim rise in sequence. Cleaned up via gsap.context. */
export function useEntrance(scope: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useLayoutEffect(() => {
    if (!scope.current || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-anim]", { y: 12, opacity: 0, duration: 0.38, stagger: 0.04, ease: "power2.out", clearProps: "all" });
    }, scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
