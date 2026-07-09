import { Text, View } from 'react-native';

import { STATUS_BG_CLASS, STATUS_LABEL, type Status } from '../lib/status';
import { cn } from '../lib/cn';

export function StatusDot({ status, mutedTextClass }: { status: Status; mutedTextClass: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={cn('h-2 w-2 rounded-full', STATUS_BG_CLASS[status])} />
      <Text className={cn('font-body-medium text-xs', mutedTextClass)}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}
