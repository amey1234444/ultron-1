import { ExternalLink, RefreshCw } from "lucide-react-native";
import { Text, View } from "react-native";

import { MATERIAL_ROWS } from "../sapDemoData";
import {
  MetricCard,
  MetricRow,
  SapButton,
  SapTable,
  SectionCard,
  SectionHeader,
  StatusPill,
  useSapPalette,
} from "../SapUi";
import type { SapTone } from "../types";

export function MaterialsTab() {
  const palette = useSapPalette();
  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[260px] flex-1">
          <Text
            className="font-body-medium text-[14px]"
            style={{ color: palette.ink }}
          >
            Maintenance material readiness
          </Text>
          <Text
            className="mt-1 font-body text-[11px]"
            style={{ color: palette.inkMuted }}
          >
            SAP stock by plant and storage location, evaluated against planned
            work.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label="Stock refreshed 31 sec ago" tone="success" />
          <SapButton label="Refresh stock" icon={RefreshCw} compact />
        </View>
      </View>

      <MetricRow>
        <MetricCard
          label="Ready orders"
          value="2"
          detail="All components available"
          tone="success"
        />
        <MetricCard
          label="Partial readiness"
          value="1"
          detail="Bearing shortage on TSE-01"
          tone="warning"
        />
        <MetricCard
          label="Mapped components"
          value="18/20"
          detail="Two material numbers missing"
        />
        <MetricCard
          label="Inventory value at risk"
          value="€1.8k"
          detail="Required within 9 days"
          tone="warning"
        />
      </MetricRow>

      <View className="mb-3 flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 650, minWidth: 300 }}>
          <SectionHeader
            title="TSE-01 · Proposed maintenance kit"
            description="Failure mode + approved BOM mapping + current SAP availability"
            action={<StatusPill label="67% ready" tone="warning" />}
          />
          <SapTable
            columns={[
              "Component",
              "SAP material",
              "Available",
              "Required",
              "Readiness",
            ]}
            widths={[220, 150, 120, 110, 140]}
            rows={MATERIAL_ROWS.map(
              ([component, material, available, required, readiness, tone]) => [
                component,
                <Text
                  className="font-mono text-[10px]"
                  style={{ color: palette.ink }}
                >
                  {material}
                </Text>,
                <View>
                  <Text
                    className="font-mono text-[10px]"
                    style={{ color: palette.ink }}
                  >
                    {available}
                  </Text>
                  <View
                    className="mt-1 overflow-hidden rounded-full"
                    style={{ height: 4, backgroundColor: palette.track }}
                  >
                    <View
                      style={{
                        width: readiness === "Ready" ? "78%" : "50%",
                        height: 4,
                        backgroundColor:
                          readiness === "Ready"
                            ? palette.accent
                            : palette.critical,
                      }}
                    />
                  </View>
                </View>,
                <Text
                  className="font-mono text-[10px]"
                  style={{ color: palette.ink }}
                >
                  {required}
                </Text>,
                <StatusPill label={readiness} tone={tone as SapTone} />,
              ],
            )}
          />
        </SectionCard>

        <SectionCard style={{ flexGrow: 1, flexBasis: 330, minWidth: 280 }}>
          <SectionHeader
            title="Shortage resolution"
            description="BRG-6208 · need 2, available 1"
            action={<StatusPill label="Action needed" tone="critical" />}
          />
          {[
            ["M001", "Main spare store", "1 EA"],
            ["M003", "Maintenance staging", "0 EA"],
            ["Plant 1100", "Approved alternate site", "3 EA"],
          ].map(([place, label, stock]) => (
            <View
              key={place}
              className="flex-row items-center gap-3 border-t py-2.5 first:border-t-0"
              style={{ borderColor: palette.lineSubtle }}
            >
              <Text
                className="w-[72px] font-mono text-[9px]"
                style={{ color: palette.inkFaint }}
              >
                {place}
              </Text>
              <Text
                className="flex-1 font-body text-[10.5px]"
                style={{ color: palette.ink }}
              >
                {label}
              </Text>
              <Text
                className="font-mono text-[10px]"
                style={{ color: palette.ink }}
              >
                {stock}
              </Text>
            </View>
          ))}
          <View
            className="mt-3 rounded-lg border p-3"
            style={{
              backgroundColor: palette.accentSoft,
              borderColor: palette.accentBorder,
            }}
          >
            <Text
              className="font-body-medium text-[11px]"
              style={{ color: palette.ink }}
            >
              Approved substitute available
            </Text>
            <Text
              className="mt-1 font-body text-[10px] leading-[16px]"
              style={{ color: palette.inkMuted }}
            >
              BRG-6208-C3 is approved for this equipment class. Stock: 4 EA at
              plant 1000.
            </Text>
            <View className="mt-3">
              <SapButton
                label="Open substitute in SAP"
                icon={ExternalLink}
                primary
                compact
              />
            </View>
          </View>
          <View
            className="mt-3 border-l-2 pl-3"
            style={{ borderColor: palette.info }}
          >
            <Text
              className="font-body text-[9.5px] leading-[15px]"
              style={{ color: palette.inkMuted }}
            >
              Reservation and goods issue remain SAP-controlled actions. ULTRON
              does not mutate stock from this screen.
            </Text>
          </View>
        </SectionCard>
      </View>

      <SectionCard>
        <SectionHeader
          title="Component mapping coverage"
          description="Failure modes mapped to maintainable SAP materials"
          action={<SapButton label="Manage mappings" compact />}
        />
        {[
          [
            "TSE-01",
            "Gearbox bearing set · 3 mapped materials",
            "Complete",
            "success",
          ],
          [
            "SSE-02",
            "Pressure loop · 2 mapped materials",
            "Complete",
            "success",
          ],
          [
            "RAV-03",
            "Rotor seal kit · missing lubricant mapping",
            "Review",
            "warning",
          ],
        ].map(([machine, description, status, tone]) => (
          <View
            key={machine}
            className="flex-row flex-wrap items-center gap-3 border-t py-2.5 first:border-t-0"
            style={{ borderColor: palette.lineSubtle }}
          >
            <Text
              className="w-[70px] font-mono text-[9px]"
              style={{ color: palette.inkFaint }}
            >
              {machine}
            </Text>
            <Text
              className="min-w-[220px] flex-1 font-body text-[10.5px]"
              style={{ color: palette.ink }}
            >
              {description}
            </Text>
            <StatusPill label={status} tone={tone as SapTone} />
          </View>
        ))}
      </SectionCard>
    </View>
  );
}
