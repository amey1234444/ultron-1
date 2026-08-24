import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { consolePalette } from '../../../../lib/consoleTheme';
import { text } from '../../../ui';
import { Dropdown, DropdownGroupLabel, DropdownItem } from './Dropdown';
import {
  parseCustomWindow,
  TREND_WINDOWS,
  WINDOW_GROUP_LABEL,
  WINDOW_GROUP_ORDER,
  windowAvailability,
  type TrendWindow,
} from './windowCatalog';

/**
 * The window control: `Window  30 s ▾`.
 *
 * Everything the old row of chips did, in the width of one button. The menu is
 * grouped by unit, the current window is the only highlighted row, and a window
 * the buffer cannot honour is disabled with the reason beside it rather than
 * being silently drawn short.
 */
export function WindowMenu({
  value,
  onChange,
  custom,
  onAddCustom,
  sampleCount,
  spanMs,
}: {
  value: TrendWindow;
  onChange: (option: TrendWindow) => void;
  /** Windows the reader has added this session, kept at the top of the menu. */
  custom: TrendWindow[];
  onAddCustom: (option: TrendWindow) => void;
  sampleCount: number;
  spanMs: number;
}) {
  return (
    <Dropdown
      label="Window"
      value={value.short}
      menuWidth={244}
      menuMaxHeight={560}
      accessibilityLabel={`Trend window, currently ${value.label}`}
    >
      {({ close }) => (
        <>
          <CustomIntervalRow
            onSubmit={(option) => {
              onAddCustom(option);
              onChange(option);
              close();
            }}
          />

          {custom.length > 0 ? (
            <>
              <DropdownGroupLabel>Custom</DropdownGroupLabel>
              {custom.map((option) => {
                const state = windowAvailability(option, sampleCount, spanMs);
                return (
                  <DropdownItem
                    key={option.id}
                    label={option.label}
                    detail={state.available ? undefined : state.note}
                    disabled={!state.available}
                    selected={option.id === value.id}
                    onPress={() => {
                      onChange(option);
                      close();
                    }}
                  />
                );
              })}
            </>
          ) : null}

          {WINDOW_GROUP_ORDER.map((unit, index) => (
            <View key={unit}>
              <DropdownGroupLabel first={index === 0 && custom.length === 0}>{WINDOW_GROUP_LABEL[unit]}</DropdownGroupLabel>
              {TREND_WINDOWS.filter((option) => option.unit === unit).map((option) => {
                const state = windowAvailability(option, sampleCount, spanMs);
                return (
                  <DropdownItem
                    key={option.id}
                    label={option.label}
                    detail={state.available ? undefined : state.note}
                    disabled={!state.available}
                    selected={option.id === value.id}
                    onPress={() => {
                      onChange(option);
                      close();
                    }}
                  />
                );
              })}
            </View>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/**
 * `+ Add custom interval…`, and the field it opens.
 *
 * Kept inside the menu rather than behind a dialog: it is one short string, and
 * a modal on top of a modal to type "90s" is ceremony. A string that does not
 * parse is rejected in place, next to the field, rather than quietly becoming
 * some default.
 */
function CustomIntervalRow({ onSubmit }: { onSubmit: (option: TrendWindow) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseCustomWindow(draft);
    if (!parsed) {
      setError('Try 45s, 90 min, 2h, 500 ticks');
      return;
    }
    setDraft('');
    setError(null);
    setOpen(false);
    onSubmit(parsed);
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="menuitem"
        accessibilityLabel="Add a custom trend interval"
        className="mx-1 flex-row items-center gap-2 rounded-[7px] px-2 py-[6px]"
      >
        <Text className={text.body} style={{ color: palette.accent }}>
          + Add custom interval…
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="mx-1 gap-1.5 px-2 py-1.5">
      <View className="flex-row items-center gap-1.5">
        <TextInput
          value={draft}
          onChangeText={(next) => {
            setDraft(next);
            setError(null);
          }}
          onSubmitEditing={submit}
          autoFocus
          placeholder="45s · 90 min · 2h · 500 ticks"
          placeholderTextColor={palette.inkDisabled}
          accessibilityLabel="Custom interval"
          className="min-w-0 flex-1 rounded-[7px] border px-2 py-[5px]"
          style={{
            borderColor: palette.lineStrong,
            backgroundColor: palette.panelRaised,
            color: palette.ink,
            fontSize: 11.5,
          }}
        />
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel="Add interval"
          className="rounded-[7px] border px-2 py-[5px]"
          style={{ borderColor: palette.accentBorder, backgroundColor: palette.accentSoft }}
        >
          <Text className={text.chip} style={{ color: palette.accent }}>
            Add
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Text className={text.meta} style={{ color: palette.critical }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
