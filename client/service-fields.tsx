import type { PluginTheme } from "@getpaseo/plugin";
import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";
import type { RowField } from "../shared/display-settings";
import { useT } from "./i18n";
import type { FieldFont } from "./pull-request-fields";
import { type WorkspaceDescriptor, useWorkspaceDescriptor } from "./workspace-descriptors";

/** A running service. Primitives only. */
export interface ServiceChipData {
  readonly name: string;
  readonly port: number | null;
  readonly unhealthy: boolean;
}

/** Running services only, so a stopped service drops out of the row. */
export function selectServiceChips(descriptor: WorkspaceDescriptor | null): ServiceChipData[] {
  return (descriptor?.scripts ?? [])
    .filter((script) => script.type === "service" && script.lifecycle === "running")
    .map((script) => ({
      name: script.scriptName,
      port: script.port,
      unhealthy: script.health === "unhealthy",
    }));
}

/** Stable identity for memoization, so unrelated descriptor updates do not re-render the row. */
function chipsKey(chips: readonly ServiceChipData[]): string {
  return chips.map((chip) => `${chip.name}\u0000${chip.port ?? ""}\u0000${chip.unhealthy}`).join("\n");
}

/** Not pressable: a press falls through to the row and opens the workspace. */
function ServiceChip({ chip, theme, font }: { chip: ServiceChipData; theme: PluginTheme; font: FieldFont }) {
  const t = useT();
  const color = chip.unhealthy ? theme.colors.statusDanger : theme.colors.statusSuccess;
  const label = chip.port !== null ? `${chip.name}:${chip.port}` : chip.name;
  return (
    <View
      accessible
      accessibilityLabel={t(chip.unhealthy ? "a11y.serviceUnhealthy" : "a11y.service", { label })}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Icon name="Globe" color={color} size={font.fontSize} />
      <Text numberOfLines={1} style={{ color, fontSize: font.fontSize, lineHeight: font.lineHeight }}>
        {label}
      </Text>
    </View>
  );
}

/** Services field content for a row: one item per running service. */
export function useServiceFieldValues(
  reference: WorkspaceRef,
  theme: PluginTheme,
  font: FieldFont,
): Partial<Record<RowField, ReactNode>> | null {
  const descriptor = useWorkspaceDescriptor(reference);
  const chips = selectServiceChips(descriptor);
  const key = chipsKey(chips);
  return useMemo(() => {
    if (chips.length === 0) return null;
    return {
      services: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {chips.map((chip) => (
            <ServiceChip key={chip.name} chip={chip} theme={theme} font={font} />
          ))}
        </View>
      ),
    };
    // `chips` is rebuilt every render; `key` captures its content.
  }, [theme, font, key]);
}
