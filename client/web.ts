import type { PluginTheme } from "@getpaseo/plugin";
import { type RefObject, useEffect, useState } from "react";
import { Linking, Platform, type View, type ViewStyle } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomElement {
  parentElement: DomElement | null;
}
declare const window: {
  open(url: string, target: string, features: string): unknown;
  getComputedStyle(element: DomElement): { backgroundColor: string };
  addEventListener(type: "click", listener: (event: DomEvent) => void, capture: boolean): void;
  removeEventListener(type: "click", listener: (event: DomEvent) => void, capture: boolean): void;
};
interface DomEvent {
  stopPropagation(): void;
  preventDefault(): void;
}

const IS_WEB = Platform.OS === "web";

export async function openExternal(url: string): Promise<void> {
  if (IS_WEB) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}

/**
 * Web: the browser still fires `click` on the heading after a mouse drag ends, which react-native-web turns into
 * a press (toggling the dropped group or project, or opening the dropped workspace). Swallow that one click.
 */
export function swallowNextClick(): void {
  if (!IS_WEB) return;
  const swallow = (event: DomEvent) => {
    event.stopPropagation();
    event.preventDefault();
    remove();
  };
  const remove = () => {
    window.removeEventListener("click", swallow, true);
    clearTimeout(timer);
  };
  window.addEventListener("click", swallow, true);
  // No click follows when the pointer is released outside the window.
  const timer = setTimeout(remove, 100);
}

const isTransparent = (color: string) => color === "" || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);

/**
 * Web: the first opaque background behind `ref` (the host's sidebar surface, which the plugin theme does not
 * expose), so stuck headings cover the rows scrolling under them. Native and unmeasured: `surface0`.
 */
export function useSurfaceBehind(ref: RefObject<View | null>, theme: PluginTheme): string {
  const [color, setColor] = useState(theme.colors.surface0);
  useEffect(() => {
    if (!IS_WEB) return;
    let element = ref.current as unknown as DomElement | null;
    while (element) {
      const background = window.getComputedStyle(element).backgroundColor;
      if (!isTransparent(background)) {
        setColor(background);
        return;
      }
      element = element.parentElement;
    }
    setColor(theme.colors.surface0);
  }, [ref, theme]);
  return color;
}

/**
 * Sticky heading style: pinned at `top` of the scroll view while its block scrolls (CSS sticky).
 * Web and desktop only; React Native's ScrollView cannot pin nested headings, so native stays unpinned.
 */
export function stickyStyle(top: number, background: string, zIndex: number): ViewStyle | undefined {
  if (!IS_WEB) return undefined;
  return { position: "sticky", top, zIndex, backgroundColor: background } as unknown as ViewStyle;
}
