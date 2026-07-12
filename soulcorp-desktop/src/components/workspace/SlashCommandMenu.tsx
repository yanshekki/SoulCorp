import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SlashCommandItem } from "./slashCommands";
import { useI18n } from "../../i18n/I18nProvider";

export interface SlashCommandMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashCommandMenu = forwardRef<
  SlashCommandMenuHandle,
  SuggestionProps<SlashCommandItem>
>(function SlashCommandMenu({ items, command }, ref) {
  const { t } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((current) => (current + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((current) => (current + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="ws-slash-menu" role="listbox" aria-label={t("workspace.slash.aria")}>
        <p className="ws-slash-menu-empty muted">{t("workspace.slash.empty")}</p>
      </div>
    );
  }

  return (
    <div className="ws-slash-menu" role="listbox" aria-label={t("workspace.slash.aria")}>
      <header className="ws-slash-menu-header">{t("workspace.slash.header")}</header>
      <ul className="ws-slash-menu-list">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`ws-slash-menu-item${index === selectedIndex ? " active" : ""}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectItem(index)}
            >
              <span className="ws-slash-menu-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ws-slash-menu-copy">
                <strong>{t(item.titleKey)}</strong>
                <span>{t(item.descriptionKey)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});