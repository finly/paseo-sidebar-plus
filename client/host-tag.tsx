import { Icon } from "@getpaseo/plugin/client/ui";
import { type ViewStyle, Text, View } from "react-native";

/** Compact host badge, shared by project headings and workspace rows on multi-host setups. */
export function HostTag({
  name,
  color,
  fill,
  fontSize,
  lineHeight,
  maxWidth = "45%",
}: {
  name: string;
  color: string;
  fill: boolean;
  fontSize: number;
  lineHeight: number;
  maxWidth?: ViewStyle["maxWidth"];
}) {
  return (
    <View
      style={{
        flexShrink: 1,
        maxWidth,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 5,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Faded fill: the host color at low opacity, behind the content. */}
      {fill ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: color,
            opacity: 0.15,
          }}
        />
      ) : null}
      <Icon name="Server" color={color} size={fontSize - 3} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color, fontSize: fontSize - 2, lineHeight }}>
        {name}
      </Text>
    </View>
  );
}
