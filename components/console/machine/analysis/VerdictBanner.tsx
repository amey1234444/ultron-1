import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { confidenceStatement, EVIDENCE_LABEL, verdictHex, type Hypothesis, type Verdict } from '../../../../lib/analysisDiagnosis';
import { consolePalette } from '../../../../lib/consoleTheme';

// The page's thesis, in the order a reader needs it: how bad, what is thought to
// be wrong, whether that is the machine or the instrument, and what to do next.
//
// The claim is deliberately hedged in the copy — "leading hypothesis", "cannot be
// confirmed" — because an uncalibrated rule engine ranking explanations is not the
// same thing as a diagnosis, and a page that reads like a diagnosis will be acted
// on like one.
export function VerdictBanner({
  verdict,
  hypothesis,
  runState,
  advisoryOnly = true,
  onPrimaryAction,
  primaryActionLabel,
  onOpenTrend,
}: {
  verdict: Verdict;
  hypothesis: Hypothesis | null;
  // "Producing · 6 h 14 m" — machine state and how long it has held.
  runState?: string;
  advisoryOnly?: boolean;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  onOpenTrend?: () => void;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const palette = consolePalette(isDark);
  const colour = verdictHex(verdict, isDark);

  return (
    // The stripe is the state; the card underneath it is not. On the dark
    // console a 5%-tinted wash reads as depth, but on white the same wash turns
    // the largest object on the page into a block of colour and the reader
    // stops being able to tell which part of it is the actual signal. Light
    // mode gets a white card with a neutral edge and keeps the stripe, the
    // headline and the class pill in the verdict's colour — see the note at the
    // top of lib/consoleTheme.ts.
    <View
      className="overflow-hidden rounded-2xl border"
      style={
        isDark
          ? { borderColor: `${colour}59`, backgroundColor: `${colour}0D` }
          : { borderColor: palette.line, backgroundColor: palette.panel }
      }
    >
      {/* Severity stripe: the page's state before a word is read. */}
      <View style={{ height: 3, backgroundColor: colour }} />

      <View className="gap-3 px-5 py-4">
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
          <Text className={cn('font-mono text-[10.5px] tracking-[0.16em]', mutedClass)}>MACHINE STATUS</Text>
          {runState ? <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>· {runState}</Text> : null}
          {advisoryOnly ? (
            <View className={cn('rounded border px-1.5 py-[1px]', lineClass)}>
              <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>ADVISORY ONLY</Text>
            </View>
          ) : null}
        </View>

        <View className="flex-row flex-wrap items-center gap-3">
          <Text style={{ color: colour, fontSize: 30, lineHeight: 34 }} className="font-heading-medium">
            {verdict.headline}
          </Text>

          {/* The cause class is the headline's other half: "Warning" alone does
              not tell you whether to send a fitter or a technician. */}
          {hypothesis ? (
            <View className="rounded border px-2 py-1" style={{ borderColor: `${colour}66` }}>
              <Text style={{ color: colour }} className="font-mono text-[10.5px] font-bold tracking-wider">
                {hypothesis.cause === 'chain' ? 'SENSOR CAUSE SUSPECTED' : 'MACHINE CAUSE SUSPECTED'}
              </Text>
            </View>
          ) : null}
        </View>

        {hypothesis ? (
          <View className="gap-2" style={{ maxWidth: 720 }}>
            <Text className={cn('font-body text-[14.5px] leading-[21px]', inkClass)}>
              Leading hypothesis is{' '}
              <Text className="font-body-bold" style={{ color: colour }}>
                {hypothesis.label.toLowerCase()}
              </Text>
              {hypothesis.localised ? '' : ', not localised to a single part'}. {hypothesis.statement}
            </Text>

            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <Text className={cn('font-mono text-[11.5px]', mutedClass)}>
                CLASS <Text style={{ color: colour }}>{EVIDENCE_LABEL[hypothesis.cause].toUpperCase()}</Text>
              </Text>
              <Text className={cn('font-mono text-[11.5px]', mutedClass)}>
                SUBSYSTEM <Text className={inkClass}>{hypothesis.affectedSubsystem}</Text>
              </Text>
              {verdict.machineUnconfirmable ? (
                <Text style={{ color: colour }} className="font-mono text-[11.5px] font-bold">
                  MACHINE CONDITION UNCONFIRMABLE
                </Text>
              ) : null}
            </View>

            {/* Certainty, stated as what it actually is. */}
            <Text className={cn('font-body text-[12.5px] leading-[19px]', mutedClass)}>{confidenceStatement(hypothesis)}</Text>
          </View>
        ) : (
          <Text className={cn('font-body text-[14.5px]', mutedClass)}>
            No rule has fired. Every signal is inside its registered reference.
          </Text>
        )}

        {(onPrimaryAction && primaryActionLabel) || onOpenTrend ? (
          <View className="flex-row flex-wrap items-center gap-2 pt-1">
            {onPrimaryAction && primaryActionLabel ? (
              <Pressable
                onPress={onPrimaryAction}
                accessibilityRole="button"
                accessibilityLabel={primaryActionLabel}
                className={cn('rounded-lg px-3.5 py-2', isDark ? 'bg-ink' : 'bg-ink-inverse')}
              >
                <Text className={cn('font-body-bold text-[13.5px]', isDark ? 'text-ink-inverse' : 'text-ink')}>
                  {primaryActionLabel}
                </Text>
              </Pressable>
            ) : null}

            {onOpenTrend ? (
              <Pressable onPress={onOpenTrend} accessibilityRole="button" accessibilityLabel="Open trend" className="px-2 py-2">
                <Text className="font-body-medium text-[13.5px] text-accent">Open trend ›</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
