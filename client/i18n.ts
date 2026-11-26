import { defineTranslations, useTranslation } from "@getpaseo/plugin/client";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import ru from "./locales/ru.json";
import ar from "./locales/ar.json";

export const messages = defineTranslations({
  resources: {
    en,
    "zh-CN": zhCN,
    ja,
    ko,
    es,
    fr,
    "pt-BR": ptBR,
    ru,
    ar,
  },
});

export function useT() {
  return useTranslation(messages).t;
}

/** `t` from `useT`, for helpers that run outside a component. */
export type Translate = ReturnType<typeof useT>;

/** A plain label key (no placeholders), for tables of labels translated at render time. */
export type MessageKey = Extract<
  Parameters<Translate>[0],
  `options.${string}` | `fields.${string}` | `statusSection.${string}`
>;
