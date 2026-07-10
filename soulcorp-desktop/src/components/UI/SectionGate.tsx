import type { ReactNode } from "react";

/** Renders children only when left-nav section matches (true page tabs, not scroll spy). */
export function SectionGate({
  id,
  activeSection,
  children,
}: {
  id: string;
  activeSection: string;
  children: ReactNode;
}) {
  if (activeSection !== id) {
    return null;
  }
  return <>{children}</>;
}
