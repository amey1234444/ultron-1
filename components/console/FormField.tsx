import { Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type FormFieldProps = {
  /**
   * Omitted for a field whose purpose is obvious from its placeholder — a
   * search box above the thing it searches. An empty string is not the same
   * thing: it renders a blank line of label and leaves a gap where a label
   * would be.
   */
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  error?: string;
};

export function FormField({ label, required, value, onChangeText, placeholder, multiline, error }: FormFieldProps) {
  const { isDark } = useAppTheme();

  return (
    <View className="gap-1.5">
      {label ? (
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#5F625F' : '#A1A3A0'}
        multiline={multiline}
        className={cn(
          'rounded-lg border px-3 py-2 font-body text-sm',
          multiline ? 'h-20' : 'h-10',
          error ? 'border-status-critical' : isDark ? 'border-line-dark' : 'border-line-light',
          isDark ? 'bg-surface-dark text-ink' : 'bg-surface-light text-ink-inverse',
        )}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
      />
      {error && <Text className="font-body text-xs text-status-critical">{error}</Text>}
    </View>
  );
}
