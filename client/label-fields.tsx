import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";
import type { RowField } from "../shared/display-settings";
import { useT } from "./i18n";
import type { FieldFont } from "./pull-request-fields";

/**
 * One tag icon plus name per label, in muted line color.
 * The plugin SDK exposes label names only (no label catalog), so Paseo's label colors are not available.
 * Not pressable: a press falls through to the row and opens the workspace.
 */
function LabelChip({ name, theme, font }: { name: string; theme: PluginTheme; font: FieldFont }) {
  const t = useT();
  const color = theme.colors.foregroundMuted;
  return (
    <View
      accessible
      accessibilityLabel={t("a11y.label", { name })}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}
    >
      <Icon name="Tag" color={color} size={font.fontSize} />
      <Text numberOfLines={1} style={{ color, fontSize: font.fontSize, lineHeight: font.lineHeight, flexShrink: 1 }}>
        {name}
      </Text>
    </View>
  );
}

/** Labels field content for a row, from `SnapshotFieldData.labels` ("\n"-joined names). */
export function useLabelFieldValues(
  labels: string | null,
  theme: PluginTheme,
  font: FieldFont,
): Partial<Record<RowField, ReactNode>> | null {
  return useMemo(() => {
    if (!labels) return null;
    return {
      labels: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, overflow: "hidden" }}>
          {labels.split("\n").map((name) => (
            <LabelChip key={name} name={name} theme={theme} font={font} />
          ))}
        </View>
      ),
    };
  }, [labels, theme, font]);
}
