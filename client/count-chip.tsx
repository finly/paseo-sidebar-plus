import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";

/** Chip height: the view header's icon size, so counts and icons share one column. */
const CHIP_SIZE = 16;

/** Width of a heading's count column: a view header button, so the count centers under the new group button. */
const COLUMN_WIDTH = 28;

/** A count centered in a header-button-wide column (headings without a + button). */
export function CountColumn({ count, theme, marginRight }: { count: number; theme: PluginTheme; marginRight?: number }) {
  return (
    <View style={{ minWidth: COLUMN_WIDTH, marginRight, alignItems: "center" }}>
      <CountChip count={count} theme={theme} />
    </View>
  );
}

/** A heading's item count as a small rounded chip; grows sideways for longer numbers. */
export function CountChip({ count, theme, marginRight }: { count: number; theme: PluginTheme; marginRight?: number }) {
  return (
    <View
      style={{
        minWidth: CHIP_SIZE,
        height: CHIP_SIZE,
        paddingHorizontal: 4,
        marginRight,
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.surface2,
      }}
    >
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: CHIP_SIZE, fontWeight: "600" }}>
        {count}
      </Text>
    </View>
  );
}
