import { Link2, Search } from "lucide-react-native";
import { Text, TextInput, View } from "react-native";

import { SAP_EQUIPMENT_ROWS, SAP_MEASURING_POINTS } from "../sapDemoData";
import {
  MetricCard,
  MetricRow,
  SapButton,
  SapTable,
  SectionCard,
  SectionHeader,
  StatusPill,
  toneForStatus,
  useSapPalette,
} from "../SapUi";

export function EquipmentMappingTab() {
  const palette = useSapPalette();
  return (
    <View>
      <MetricRow>
        <MetricCard
          label="Mapped assets"
          value="24/26"
          detail="Two machines need review"
        />
        <MetricCard
          label="Measuring points"
          value="68"
          detail="61 linked to ULTRON channels"
        />
        <MetricCard
          label="Mapping conflicts"
          value="2"
          detail="One duplicate equipment ID"
          tone="warning"
        />
        <MetricCard
          label="Last master sync"
          value="44s"
          detail="Equipment delta received"
          tone="success"
        />
      </MetricRow>

      <View className="flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 760, minWidth: 300 }}>
          <SectionHeader
            title="Equipment mapping"
            description="Explicit identity between each ULTRON machine and one SAP technical object"
            action={
              <SapButton label="Map equipment" icon={Link2} primary compact />
            }
          />
          <View
            className="mb-3 flex-row items-center gap-2 rounded-lg border px-3"
            style={{
              height: 40,
              borderColor: palette.line,
              backgroundColor: palette.panelRaised,
            }}
          >
            <Search size={14} color={palette.inkFaint} />
            <TextInput
              accessibilityLabel="Search equipment mappings"
              placeholder="Search machine, equipment or functional location"
              placeholderTextColor={palette.inkFaint}
              className="min-w-0 flex-1 font-body text-[11px]"
              style={{ color: palette.ink, outlineStyle: "none" } as any}
            />
          </View>
          <SapTable
            columns={[
              "ULTRON machine",
              "SAP equipment",
              "Functional location",
              "Plant",
              "Work centre",
              "Health",
            ]}
            widths={[210, 145, 180, 85, 120, 130]}
            rows={SAP_EQUIPMENT_ROWS.map(
              ([
                machine,
                description,
                equipment,
                location,
                plant,
                workCentre,
                status,
              ]) => [
                <View>
                  <Text
                    className="font-body-medium text-[11px]"
                    style={{ color: palette.ink }}
                  >
                    {machine}
                  </Text>
                  <Text
                    className="mt-0.5 font-body text-[9px]"
                    style={{ color: palette.inkMuted }}
                  >
                    {description}
                  </Text>
                </View>,
                <Text
                  className="font-mono text-[10px]"
                  style={{ color: palette.ink }}
                >
                  {equipment}
                </Text>,
                <Text
                  className="font-mono text-[10px]"
                  style={{ color: palette.ink }}
                >
                  {location}
                </Text>,
                plant,
                <Text
                  className="font-mono text-[10px]"
                  style={{ color: palette.ink }}
                >
                  {workCentre}
                </Text>,
                <StatusPill label={status} tone={toneForStatus(status)} />,
              ],
            )}
          />
        </SectionCard>

        <View className="min-w-[280px] flex-1 basis-[330px] gap-3">
          <SectionCard>
            <SectionHeader
              title="Suggested match"
              description="Human confirmation is always required"
              action={<StatusPill label="1 pending" tone="warning" />}
            />
            <View
              className="rounded-lg border p-3"
              style={{
                borderColor: palette.accentBorder,
                backgroundColor: palette.accentSoft,
              }}
            >
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text
                  className="font-body-medium text-[11px]"
                  style={{ color: palette.ink }}
                >
                  RAV-03 → EQ-100067
                </Text>
                <StatusPill label="94% match" tone="success" dot={false} />
              </View>
              <Text
                className="mt-2 font-body text-[10px] leading-[16px]"
                style={{ color: palette.inkMuted }}
              >
                Same functional location, manufacturer and serial number.
              </Text>
              <View
                className="mt-3 overflow-hidden rounded-full"
                style={{ height: 5, backgroundColor: palette.track }}
              >
                <View
                  style={{
                    width: "94%",
                    height: 5,
                    backgroundColor: palette.accent,
                  }}
                />
              </View>
              <View className="mt-3 flex-row flex-wrap gap-2">
                <SapButton label="Review & confirm" primary compact />
                <SapButton label="Reject" compact />
              </View>
            </View>
          </SectionCard>

          <SectionCard>
            <SectionHeader
              title="Selected mapping"
              description="TSE-01 · EQ-100034"
              action={<StatusPill label="Healthy" tone="success" />}
            />
            {SAP_MEASURING_POINTS.map(([channel, label, point, status]) => (
              <View
                key={channel}
                className="flex-row items-center gap-3 border-t py-2.5 first:border-t-0"
                style={{ borderColor: palette.lineSubtle }}
              >
                <Text
                  className="w-[36px] font-mono text-[9px]"
                  style={{ color: palette.inkFaint }}
                >
                  {channel}
                </Text>
                <Text
                  className="min-w-[120px] flex-1 font-body text-[10.5px]"
                  style={{ color: palette.ink }}
                >
                  {label}
                </Text>
                <Text
                  className="font-mono text-[9px]"
                  style={{ color: palette.inkMuted }}
                >
                  {point}
                </Text>
                <StatusPill
                  label={status}
                  tone={toneForStatus(status)}
                  dot={false}
                />
              </View>
            ))}
          </SectionCard>
        </View>
      </View>
    </View>
  );
}
