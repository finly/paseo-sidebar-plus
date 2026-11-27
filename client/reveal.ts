import { useCallback, useMemo, useState } from "react";

export interface SectionReveal {
  /** The section is showing every row past its cap. */
  has(key: string): boolean;
  revealSection(key: string): void;
  /** Drops one section back to its cap (it is being collapsed). */
  conceal(key: string): void;
  resetAll(): void;
}

/**
 * Sections revealed past their cap, keyed by project key or section key. Reveals are transient: changing
 * `resetKey` (grouping, search or filter) drops all of them, using the same derived state as `useViewCollapse`.
 */
export function useSectionReveal(resetKey: string): SectionReveal {
  const [state, setState] = useState<{ key: string; revealed: Set<string> }>(() => ({
    key: resetKey,
    revealed: new Set(),
  }));
  const current = state.key === resetKey ? state : { key: resetKey, revealed: new Set<string>() };
  if (current !== state) setState(current);
  const revealSection = useCallback((key: string) => {
    setState((state) => {
      if (state.revealed.has(key)) return state;
      const revealed = new Set(state.revealed);
      revealed.add(key);
      return { ...state, revealed };
    });
  }, []);
  const conceal = useCallback((key: string) => {
    setState((state) => {
      if (!state.revealed.has(key)) return state;
      const revealed = new Set(state.revealed);
      revealed.delete(key);
      return { ...state, revealed };
    });
  }, []);
  const resetAll = useCallback(() => setState((state) => ({ ...state, revealed: new Set<string>() })), []);
  return useMemo(
    () => ({
      has: (key: string) => current.revealed.has(key),
      revealSection,
      conceal,
      resetAll,
    }),
    [current, revealSection, conceal, resetAll],
  );
}
