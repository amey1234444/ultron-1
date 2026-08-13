import { View } from 'react-native';

/**
 * Native fallback for the colour well. There is no OS colour dialog to open
 * here, so it renders as a swatch of the current value — the hex field and the
 * preset swatches beside it remain the way to choose a colour.
 */
export function ColorWell({ value, size = 26 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: value,
        borderWidth: 1,
        borderColor: 'rgba(128,128,128,0.4)',
      }}
    />
  );
}
