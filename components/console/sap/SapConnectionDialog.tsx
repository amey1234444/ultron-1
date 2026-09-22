import { Check, X } from "lucide-react-native";
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { SapButton, StatusPill, useSapPalette } from "./SapUi";

const CAPABILITIES = [
  ["Equipment", "API_EQUIPMENT"],
  ["Maintenance notifications", "API_MAINTENANCENOTIFICATION"],
  ["Maintenance orders", "API_MAINTENANCEORDER_0002"],
  ["Material stock", "API_MATERIAL_STOCK"],
  ["Measurement documents", "API_MEASUREMENTDOCUMENT"],
  ["Production orders", "API_PRODUCTION_ORDER_2_SRV"],
] as const;

export function SapConnectionDialog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const palette = useSapPalette();
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center px-4 py-8"
        style={{ backgroundColor: "rgba(0,0,0,0.68)" }}
        onPress={onClose}
      >
        <Pressable
          accessibilityRole="none"
          onPress={(event) => event.stopPropagation()}
          className="w-full max-w-[680px] overflow-hidden rounded-2xl border"
          style={{
            maxHeight: Math.max(420, height - 64),
            backgroundColor: palette.panel,
            borderColor: palette.lineStrong,
          }}
        >
          <View
            className="flex-row items-start justify-between gap-3 border-b p-5"
            style={{ borderColor: palette.line }}
          >
            <View className="min-w-[220px] flex-1">
              <Text
                className="font-body-medium text-[15px]"
                style={{ color: palette.ink }}
              >
                SAP connection settings
              </Text>
              <Text
                className="mt-1 font-body text-[10.5px]"
                style={{ color: palette.inkMuted }}
              >
                Super-admin only. Secrets must remain in the server environment.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close connection settings"
              onPress={onClose}
              className="rounded-lg border p-2"
              style={{ borderColor: palette.line }}
            >
              <X size={16} color={palette.inkMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <View className="flex-row flex-wrap gap-3">
              <Field
                label="SAP edition"
                value="S/4HANA Cloud Public"
                palette={palette}
              />
              <Field
                label="Connection route"
                value="Direct OData API"
                palette={palette}
              />
              <Field
                label="SAP base URL"
                value="https://customer-api.s4hana.cloud.sap"
                palette={palette}
                wide
              />
              <Field
                label="Authentication"
                value="OAuth 2.0 client credentials"
                palette={palette}
              />
              <Field label="Default plant" value="1000" palette={palette} />
              <Field
                label="Polling profile"
                value="Operational · 30–120 sec"
                palette={palette}
              />
              <Field
                label="Request timeout"
                value="15 seconds"
                palette={palette}
              />
            </View>

            <View
              className="mt-5 border-t pt-4"
              style={{ borderColor: palette.line }}
            >
              <View className="mb-3 flex-row items-center justify-between gap-3">
                <View>
                  <Text
                    className="font-body-medium text-[12px]"
                    style={{ color: palette.ink }}
                  >
                    Enabled capabilities
                  </Text>
                  <Text
                    className="mt-1 font-body text-[10px]"
                    style={{ color: palette.inkMuted }}
                  >
                    UI availability follows capability checks, not assumptions.
                  </Text>
                </View>
                <StatusPill label="6 selected" tone="success" />
              </View>
              <View className="flex-row flex-wrap gap-2">
                {CAPABILITIES.map(([label, api]) => (
                  <View
                    key={api}
                    className="min-w-[230px] flex-1 flex-row items-center gap-3 rounded-lg border p-3"
                    style={{
                      backgroundColor: palette.panelRaised,
                      borderColor: palette.line,
                    }}
                  >
                    <View
                      className="items-center justify-center rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: palette.accentSoft,
                      }}
                    >
                      <Check size={13} color={palette.accent} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text
                        className="font-body-medium text-[10px]"
                        style={{ color: palette.ink }}
                      >
                        {label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="mt-0.5 font-mono text-[8px]"
                        style={{ color: palette.inkFaint }}
                      >
                        {api}
                      </Text>
                    </View>
                    <Switch
                      value
                      trackColor={{
                        false: palette.track,
                        true: palette.accentDim,
                      }}
                      thumbColor={palette.accent}
                    />
                  </View>
                ))}
              </View>
            </View>

            <View
              className="mt-5 rounded-lg border p-3"
              style={{
                backgroundColor: palette.warningSoft,
                borderColor: palette.warningBorder,
              }}
            >
              <Text
                className="font-body-medium text-[10.5px]"
                style={{ color: palette.warningValue }}
              >
                Frontend configuration only
              </Text>
              <Text
                className="mt-1 font-body text-[9.5px] leading-[15px]"
                style={{ color: palette.inkMuted }}
              >
                Saving is intentionally disabled until the server-side
                credential vault, capability test endpoint and permission checks
                are connected.
              </Text>
            </View>
          </ScrollView>
          <View
            className="flex-row flex-wrap justify-end gap-2 border-t p-4"
            style={{ borderColor: palette.line }}
          >
            <SapButton label="Close" onPress={onClose} compact />
            <SapButton label="Test connection" compact />
            <SapButton label="Save configuration" primary compact disabled />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({
  label,
  value,
  palette,
  wide = false,
}: {
  label: string;
  value: string;
  palette: ReturnType<typeof useSapPalette>;
  wide?: boolean;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: wide ? "100%" : 260 }}>
      <Text
        className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: palette.inkFaint }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        editable={false}
        className="rounded-lg border px-3 py-2.5 font-body text-[11px]"
        style={{
          color: palette.ink,
          backgroundColor: palette.panelRaised,
          borderColor: palette.line,
        }}
      />
    </View>
  );
}
