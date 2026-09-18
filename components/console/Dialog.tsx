import { useEffect, useRef, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

type DialogProps = {
  visible: boolean;
  title: string;
  onRequestClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /**
   * Change this to scroll the body to the bottom.
   *
   * A scrolling body can hide a field that a choice higher up has just made
   * required, and a required field nobody can see reads as a dialog that will
   * not let you continue. Any dialog that reveals a control below the fold
   * passes a value here that changes when it does.
   */
  revealBottomOn?: string | number | null;
};

/**
 * Chrome the dialog spends on itself: its own padding, the title, the footer
 * row and the backdrop's outer padding. Subtracted from the viewport so the
 * scrolling body is given the height that is genuinely left over.
 *
 * Deliberately generous. Underestimating it would let the footer sit just off
 * the bottom of a short screen, which is the exact failure this is here to
 * prevent; overestimating only means the body starts scrolling slightly sooner
 * than it strictly had to.
 */
const DIALOG_CHROME_HEIGHT = 260;

/** Never squeeze the body below this, even on a very short viewport. */
const MIN_BODY_HEIGHT = 180;

export function Dialog({ visible, title, onRequestClose, children, footer, revealBottomOn }: DialogProps) {
  const { isDark } = useAppTheme();
  const { height } = useWindowDimensions();
  const bodyRef = useRef<ScrollView | null>(null);

  // Bring a newly revealed control into view.
  //
  // Deferred a frame because the child that triggered this mounts in the same
  // commit: scrolling before layout has run measures the old content height and
  // lands short of the bottom. `null` means nothing to reveal, so an ordinary
  // dialog never scrolls itself.
  useEffect(() => {
    if (revealBottomOn === null || revealBottomOn === undefined) return;
    const frame = requestAnimationFrame(() => bodyRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [revealBottomOn]);

  // The body scrolls; the title and the footer do not.
  //
  // Every dialog here used to grow to whatever its content needed, which was
  // fine while the tallest of them was a rename field. Add Machine is not that:
  // it carries eleven template cards, and on a laptop viewport the Create
  // button could already be pushed under the fold with no way to reach it.
  // Bounding the body and letting it scroll keeps the action row on screen at
  // every height, and costs nothing on the small dialogs — a ScrollView whose
  // content is shorter than its maxHeight lays out exactly as the plain View
  // did.
  const maxBodyHeight = Math.max(MIN_BODY_HEIGHT, height - DIALOG_CHROME_HEIGHT);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable
        onPress={onRequestClose}
        className="flex-1 items-center justify-center bg-black/50 p-6"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className={cn(
            'w-full max-w-md rounded-2xl border p-6',
            isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
          )}
        >
          <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
          <ScrollView
            ref={bodyRef}
            style={{ maxHeight: maxBodyHeight }}
            contentContainerStyle={{ gap: 16 }}
            showsVerticalScrollIndicator={false}
            // The body only scrolls when it overflows; flexGrow: 0 stops the
            // ScrollView claiming the full maxHeight when its content is short,
            // which would leave a gap above the footer on every small dialog.
            className="mt-4 flex-grow-0"
          >
            {children}
          </ScrollView>
          <View className="mt-6 flex-row justify-end gap-3">{footer}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
