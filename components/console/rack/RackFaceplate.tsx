import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import { slotKind, TOTAL_SLOTS } from '../../../lib/rack';
import { SlotCard } from './SlotCard';

type RackFaceplateProps = {
  device: DeviceNode;
  cards: CardNode[];
  live?: LiveState;
  editable?: boolean;
  /**
   * Which slot numbers the chassis renders, in order. Defaults to the full
   * 14-slot rack. The machine workspace passes a subset so the faceplate shows
   * only the slots that machine is actually wired to.
   */
  slots?: number[];
  /**
   * When set, any rendered slot outside this list is dimmed rather than hidden
   * — used to show one machine's footprint inside the complete rack.
   */
  activeSlots?: number[] | null;
  /** Fill the parent (default). Set false to size to content inside a ScrollView. */
  fill?: boolean;
  onPressEmpty: (slot: number, x: number, y: number) => void;
  onPressCard: (card: CardNode, x: number, y: number) => void;
};

// SlotCard's own natural size (its peak-waist frame reads well at this
// width); every other size is derived from this ratio so the rack always
// fits 14 slots without scrolling, however wide the panel next to the
// sidebar happens to be.
const BASE_CARD_WIDTH = 72;
const BASE_CARD_HEIGHT = 220;
const MIN_CARD_WIDTH = 56;
const MAX_CARD_WIDTH = 116;

const SLOT_MARGIN = 5; // horizontal margin on each side of a slot
const HANDLE_WIDTH = 18;
const HANDLE_MARGIN = 20;
const DIVIDER_SPACE = 27; // hairline width + its horizontal margins
const SCROLL_PADDING = 32; // ScrollView contentContainer horizontal padding

const SLOT_NUMBERS = Array.from(
  { length: TOTAL_SLOTS },
  (_, index) => index + 1,
);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function RackHandle({ isDark, width, height }: { isDark: boolean; width: number; height: number }) {
  return (
    <View
      style={{
        width,
        height,
        padding: 3,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isDark ? '#48505D' : '#4A5058',
        backgroundColor: isDark ? '#10141A' : '#20242A',
        shadowColor: '#000000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isDark ? '#242B35' : '#323840',
          backgroundColor: isDark ? '#05070A' : '#0C0F13',
        }}
      />
    </View>
  );
}

function RackVent({ isDark }: { isDark: boolean }) {
  return (
    <View className="h-5 items-center justify-center">
      <View className="flex-row items-center gap-1">
        {Array.from({ length: 32 }, (_, index) => (
          <View
            key={index}
            style={{
              width: 3,
              height: 7,
              borderRadius: 2,
              backgroundColor: isDark ? '#303741' : '#454B53',
              opacity: index % 4 === 0 ? 0.8 : 0.45,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function RackFaceplate({
  device,
  cards,
  live,
  editable = true,
  slots,
  activeSlots = null,
  fill = true,
  onPressEmpty,
  onPressCard,
}: RackFaceplateProps) {
  const { isDark } = useAppTheme();
  const [chassisWidth, setChassisWidth] = useState<number | null>(null);

  const slotNumbers = useMemo(
    () => (slots && slots.length > 0 ? [...slots].sort((a, b) => a - b) : SLOT_NUMBERS),
    [slots],
  );
  const activeSet = useMemo(() => (activeSlots ? new Set(activeSlots) : null), [activeSlots]);

  const cardBySlot = useMemo(
    () => new Map(cards.map((card) => [card.slot, card])),
    [cards],
  );

  const chassisBackground = isDark ? '#141920' : '#282D34';
  const chassisBorder = isDark ? '#343C47' : '#444B54';
  const innerLine = isDark ? '#252C35' : '#373D45';
  const numberColor = isDark ? '#CFD5DE' : '#D7DBE1';

  // Fit all 14 slots (plus handles + divider) into the measured chassis width
  // instead of relying on horizontal scroll, so the whole rack stays visible
  // no matter how much room the left panel leaves.
  const slotCount = Math.max(1, slotNumbers.length);
  const availableWidth = chassisWidth ?? BASE_CARD_WIDTH * slotCount;
  const fixedChrome = SCROLL_PADDING + 2 * (HANDLE_WIDTH + HANDLE_MARGIN) + DIVIDER_SPACE;
  const widthPerSlot = (availableWidth - fixedChrome) / slotCount - SLOT_MARGIN * 2;
  const cardWidth = clamp(widthPerSlot, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const cardHeight = cardWidth * (BASE_CARD_HEIGHT / BASE_CARD_WIDTH);
  const scale = cardWidth / BASE_CARD_WIDTH;
  const handleHeight = 140 * scale;

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - (chassisWidth ?? 0)) > 1) setChassisWidth(width);
  };

  return (
    <View className={fill ? 'flex-1 items-center justify-center px-6 py-6' : 'w-full items-center justify-center px-6 py-6'}>
      <View
        onLayout={handleLayout}
        style={{
          width: '100%',
          overflow: 'hidden',
          borderRadius: 20,
          borderWidth: 1,
          borderColor: chassisBorder,
          backgroundColor: chassisBackground,
          shadowColor: '#000000',
          shadowOpacity: isDark ? 0.42 : 0.25,
          shadowRadius: 24,
          shadowOffset: {
            width: 0,
            height: 12,
          },
          elevation: 10,
        }}
      >
        {/* Refined upper chassis lip */}
        <View
          style={{
            height: 4,
            backgroundColor: isDark ? '#414956' : '#555C65',
            opacity: 0.55,
          }}
        />

        {/* Minimal ventilation */}
        <RackVent isDark={isDark} />

        {/* Fine separation line */}
        <View
          style={{
            height: 1,
            marginHorizontal: 20,
            backgroundColor: innerLine,
          }}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            minWidth: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: SCROLL_PADDING / 2,
            paddingTop: 20,
            paddingBottom: 20,
          }}
        >
          <View className="flex-row items-center">
            <View className="mr-5">
              <RackHandle isDark={isDark} width={HANDLE_WIDTH} height={handleHeight} />
            </View>

            {slotNumbers.map((slot, index) => {
              const card = cardBySlot.get(slot) ?? null;
              // A slot outside the active set is still real hardware — it is
              // just not this machine's, so it recedes instead of disappearing.
              const dimmed = activeSet ? !activeSet.has(slot) : false;
              const previousSlot = slotNumbers[index - 1];

              return (
                <View
                  key={slot}
                  className="flex-row items-center"
                  style={dimmed ? { opacity: 0.26 } : undefined}
                >
                  {/* Visual separator where the acquisition slots hand over to
                      the controller slots (13–14), whenever both sides are on
                      screen — a slot subset may not contain the boundary. */}
                  {slotKind(slot) === 'controller' && previousSlot !== undefined && slotKind(previousSlot) === 'acquisition' && (
                    <View
                      style={{
                        width: 1,
                        height: cardHeight,
                        marginHorizontal: 13,
                        backgroundColor: innerLine,
                      }}
                    />
                  )}

                  <View style={{ marginHorizontal: SLOT_MARGIN, alignItems: 'center' }}>
                    <Text
                      style={{
                        marginBottom: 8,
                        color: numberColor,
                        fontSize: 12,
                        fontWeight: '500',
                        letterSpacing: 1.2,
                      }}
                    >
                      {String(slot).padStart(2, '0')}
                    </Text>

                    <SlotCard
                      slot={slot}
                      card={card}
                      device={device}
                      live={live}
                      width={cardWidth}
                      editable={editable && !dimmed}
                      onPressEmpty={(x, y) =>
                        onPressEmpty(slot, x, y)
                      }
                      onPressCard={(x, y) => {
                        if (card) {
                          onPressCard(card, x, y);
                        }
                      }}
                    />
                  </View>
                </View>
              );
            })}

            <View className="ml-5">
              <RackHandle isDark={isDark} width={HANDLE_WIDTH} height={handleHeight} />
            </View>
          </View>
        </ScrollView>

        {/* Minimal lower chassis rail */}
        <View
          style={{
            height: 9,
            borderTopWidth: 1,
            borderTopColor: innerLine,
            backgroundColor: isDark ? '#0D1116' : '#1D2127',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: '42%',
              height: 2,
              marginTop: 4,
              borderRadius: 2,
              backgroundColor: isDark ? '#343C47' : '#444B54',
            }}
          />
        </View>
      </View>
    </View>
  );
}
