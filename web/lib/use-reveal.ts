"use client";
import { useEffect } from "react";

/* Scroll reveals. Elements marked data-reveal start visible in the server
   HTML (so nothing is hidden without JavaScript). On mount they are set to
   data-reveal="pending" and flip to "shown" as they scroll into view; the
   `reveal` class string in lib/ui.ts styles both states. Children of an
   element with data-reveal-stagger get increasing transition delays.
   Nothing happens under reduced motion. */
export function useReveal() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !("IntersectionObserver" in window)) return;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const show = (element: Element) =>
      element.setAttribute("data-reveal", "shown");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        }),
      { threshold: 0.12 },
    );
    elements.forEach((element) => {
      element.setAttribute("data-reveal", "pending");
      if (element.hasAttribute("data-reveal-stagger"))
        Array.from(element.children).forEach((child, index) =>
          (child as HTMLElement).style.setProperty(
            "transition-delay",
            `${Math.min(index, 6) * 90}ms`,
          ),
        );
      observer.observe(element);
    });
    const showAll = () => media.matches && elements.forEach(show);
    media.addEventListener("change", showAll);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", showAll);
    };
  }, []);
}
