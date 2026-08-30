export type ChannelHistoryWrite = {
  gatewayId: string;
  rackId: string | number;
  slotId: number;
  channelId: number;
  measurementType?: string | null;
  value: number;
  timestampMs: number;
  unit?: string | null;
  quality?: string | null;
  cardType?: string | null;
  sensor?: string | null;
};

export type CloudHistoryPoint = {
  t: number;
  v: number;
  value: number;
  sourceTimestampUs: string;
};

export async function storeCompressedHistoryMeasurements(_samples: ChannelHistoryWrite[]): Promise<number> {
  return 0;
}

export async function getCompressedMeasurementHistory(
  _gatewayId: string,
  _rackId: string | number,
  _slotId: number,
  _channelId: number,
  _limit: number,
  _fromMs?: number,
  _toMs?: number,
): Promise<CloudHistoryPoint[]> {
  return [];
}
