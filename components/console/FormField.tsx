import { Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type FormFieldProps = {
  label: string;
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
      <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#6B6B6B' : '#8A8A8A'}
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
