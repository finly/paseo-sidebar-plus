import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useT } from "./i18n";

/** Search field in the view header: search icon, query input, and a Clear button while a query is typed. Fills the free width. */
export function SearchBox({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange(value: string): void;
  theme: PluginSidebarViewProps["theme"];
}) {
  const t = useT();
  const [clearHovered, setClearHovered] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 28,
        paddingLeft: 8,
        paddingRight: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Icon name="Search" color={theme.colors.foregroundMuted} size={14} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") onChange("");
        }}
        placeholder={t("search.placeholder")}
        placeholderTextColor={theme.colors.foregroundMuted}
        accessibilityLabel={t("search.placeholder")}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{
          flex: 1,
          minWidth: 0,
          paddingVertical: 0,
          color: theme.colors.foreground,
          fontSize: 13,
          lineHeight: 18,
          borderWidth: 0,
          backgroundColor: "transparent",
          // Web: no focus ring on the input; the search box border already frames it.
          outlineWidth: 0,
          outlineStyle: "none" as "solid",
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("search.clear")}
          onPress={() => {
            setClearHovered(false);
            onChange("");
          }}
          onHoverIn={() => setClearHovered(true)}
          onHoverOut={() => setClearHovered(false)}
          style={({ pressed }) => ({
            width: 24,
            height: 24,
            borderRadius: 4,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed || clearHovered ? theme.colors.surface2 : "transparent",
          })}
        >
          <Icon name="X" color={clearHovered ? theme.colors.foreground : theme.colors.foregroundMuted} size={14} />
        </Pressable>
        ) : null}
    </View>
  );
}
