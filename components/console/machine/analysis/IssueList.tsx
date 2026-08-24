import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  categoryIsAboutMachine,
  CONDITION_HEX,
  CONDITION_LABEL,
  CONSEQUENCE_LABEL,
  issueAgeLabel,
  prioritiseIssues,
  summariseCategories,
  TREND_LABEL,
  type Issue,
} from '../../../../lib/analysisOverview';

function ConditionBadge({ condition }: { condition: Issue['condition'] }) {
  const colour = CONDITION_HEX[condition];
  return (
    <View className="rounded border px-1.5 py-[1px]" style={{ borderColor: `${colour}66`, backgroundColor: `${colour}14` }}>
      <Text style={{ color: colour }} className="font-mono text-[9px] font-bold tracking-wider">
        {CONDITION_LABEL[condition]}
      </Text>
    </View>
  );
}

function Field({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  return (
    <View className="flex-1 gap-0.5" style={{ minWidth: 84 }}>
      <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
      <Text numberOfLines={1} style={tint ? { color: tint } : undefined} className={cn('font-body text-[11px]', !tint && inkClass)}>
        {value}
      </Text>
    </View>
  );
}

function IssueCard({ issue, onOpenDiagnosis }: { issue: Issue; onOpenDiagnosis?: (issue: Issue) => void }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const colour = CONDITION_HEX[issue.condition];
  const aboutMachine = categoryIsAboutMachine(issue.category);

  return (
    <View
      // Basis wide enough that a 1440px page lands on two columns, not three:
      // an issue card carries four fields and an action, and three across turns
      // each of them into a column of truncated labels.
      style={{ flexGrow: 1, flexBasis: 520, minWidth: 320, borderColor: `${colour}40` }}
      className={cn('overflow-hidden rounded-xl border', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
    >
      <View style={{ height: 2, backgroundColor: colour }} />

      <View className="gap-3 px-3.5 py-3">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className={cn('font-body-bold text-[13px]', inkClass)}>
              {issue.title}
            </Text>
            <Text numberOfLines={1} className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>
              {issue.componentLabel.toUpperCase()} · {CATEGORY_LABEL[issue.category].toUpperCase()}
            </Text>
          </View>
          <ConditionBadge condition={issue.condition} />
        </View>

        {/* A data-quality problem is labelled as one on the card itself, so it can
            never be skimmed as mechanical damage. */}
        {!aboutMachine ? (
          <View className="self-start rounded px-1.5 py-[1px]" style={{ backgroundColor: `${CONDITION_HEX.offline}26` }}>
            <Text className={cn('font-mono text-[8px] font-bold tracking-wider', mutedClass)}>
              DATA QUALITY — NOT MACHINE DAMAGE
            </Text>
          </View>
        ) : null}

        <Text className={cn('font-body text-[11px] leading-[16px]', mutedClass)}>{issue.description}</Text>

        <View className="flex-row flex-wrap gap-2 pt-2" style={{ borderTopWidth: 1, borderTopColor: hairline }}>
          <Field label="STARTED" value={`${issueAgeLabel(issue)} ago`} />
          <Field
            label="TREND"
            value={TREND_LABEL[issue.trend]}
            tint={issue.trend === 'rapidly-worsening' || issue.trend === 'worsening' ? colour : undefined}
          />
          <Field label="IF IGNORED" value={CONSEQUENCE_LABEL[issue.consequence]} />
          {/* Absent confidence reads as not rated, never as zero. */}
          <Field label="CONFIDENCE" value={issue.confidence === undefined ? 'not rated' : `${issue.confidence}%`} />
        </View>

        <View className="flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[11px]', inkClass)}>
            {issue.action}
          </Text>
          {onOpenDiagnosis ? (
            <Pressable
              onPress={() => onOpenDiagnosis(issue)}
              accessibilityRole="button"
              accessibilityLabel={`Open diagnosis for ${issue.title}`}
            >
              <Text className="font-body-medium text-[11px] text-accent">View diagnosis ›</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Every open issue, worst first. The page must handle several at once — a machine
// with one failing bearing usually also has the process anomaly that loaded it and
// the sensor that made it hard to see.
export function IssueList({ issues, onOpenDiagnosis }: { issues: Issue[]; onOpenDiagnosis?: (issue: Issue) => void }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ordered = prioritiseIssues(issues);

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-end justify-between gap-2">
        <View>
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Active issues</Text>
          <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>
            SORTED BY SEVERITY, THEN DETERIORATION, CONSEQUENCE, CONFIDENCE, AGE
          </Text>
        </View>
        <Text className={cn('font-mono text-[10px]', mutedClass)}>{ordered.length} open</Text>
      </View>

      {ordered.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>
          No open issues. Every monitored parameter is inside its limits.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {ordered.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onOpenDiagnosis={onOpenDiagnosis} />
          ))}
        </View>
      )}
    </View>
  );
}

// The same issues counted by kind, with machine categories and instrumentation
// kept visually apart. The point of the section is the separation, not the count.
export function CategoryBreakdown({ issues }: { issues: Issue[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  const summaries = summariseCategories(issues);

  return (
    <View className="gap-3">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Issue categories</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>
          MACHINE FAULTS AND SENSOR PROBLEMS COUNTED SEPARATELY
        </Text>
      </View>

      {summaries.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>Nothing open in any category.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {summaries.map((summary) => {
            const colour = CONDITION_HEX[summary.worst];
            const aboutMachine = categoryIsAboutMachine(summary.category);
            return (
              <View
                key={summary.category}
                style={{
                  flexGrow: 1,
                  flexBasis: 190,
                  minWidth: 170,
                  borderColor: hairline,
                  // Instrumentation gets a dashed edge, so the odd one out reads as
                  // a different kind of thing before the label is read.
                  borderStyle: aboutMachine ? 'solid' : 'dashed',
                }}
                className="gap-1.5 rounded-xl border px-3.5 py-3"
              >
                <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', inkClass)}>
                  {CATEGORY_LABEL[summary.category]}
                </Text>

                <View className="flex-row items-baseline gap-2">
                  <Text style={{ color: colour }} className="font-mono text-[22px] font-bold tabular-nums">
                    {summary.count}
                  </Text>
                  <Text style={{ color: colour }} className="font-mono text-[9px] font-bold tracking-wider">
                    {CONDITION_LABEL[summary.worst]}
                  </Text>
                </View>

                <Text numberOfLines={2} className={cn('font-body text-[10px] leading-[14px]', mutedClass)}>
                  {summary.where || CATEGORY_BLURB[summary.category]}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
