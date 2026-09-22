import { Check, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
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

type PublicConnection = {
  id: string;
  name: string;
  edition: string;
  baseUrl: string;
  authType: string;
  tokenUrl: string;
  defaultPlant: string;
  lastTestStatus: string;
  credentialStatus: string;
};

export function SapConnectionDialog({
  visible,
  onClose,
  connection,
  canConfigure,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  connection: PublicConnection | null;
  canConfigure: boolean;
  onSaved: () => void;
}) {
  const palette = useSapPalette();
  const { height } = useWindowDimensions();
  const [form, setForm] = useState({
    name: "SAP S/4HANA",
    edition: "cloud_public",
    baseUrl: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    username: "",
    password: "",
    defaultPlant: "1000",
    authType: "oauth_client_credentials",
  });
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm((value) => ({
      ...value,
      name: connection?.name ?? "SAP S/4HANA",
      edition: connection?.edition ?? "cloud_public",
      baseUrl: connection?.baseUrl ?? "",
      tokenUrl: connection?.tokenUrl ?? "",
      defaultPlant: connection?.defaultPlant ?? "1000",
      authType: connection?.authType ?? "oauth_client_credentials",
      clientId: "",
      clientSecret: "",
      username: "",
      password: "",
    }));
    setNotice("");
    setOk(false);
  }, [visible, connection?.id]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setWorking(true);
    setNotice("");
    setOk(false);
    try {
      const response = await fetch("/api/sap/connection", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...form, id: connection?.id, enabled: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Could not save SAP connection.");
      setOk(true);
      setNotice("Configuration encrypted and saved on the server.");
      onSaved();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save SAP connection.",
      );
    } finally {
      setWorking(false);
    }
  };
  const test = async () => {
    if (!connection?.id) {
      setNotice("Save the connection before testing it.");
      return;
    }
    setWorking(true);
    setNotice("");
    setOk(false);
    try {
      const response = await fetch("/api/sap/connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: connection.id }),
      });
      const data = (await response.json()) as {
        message?: string;
        latencyMs?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Connection test failed.");
      setOk(true);
      setNotice(`${data.message} ${data.latencyMs ?? 0} ms`);
      onSaved();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Connection test failed.",
      );
    } finally {
      setWorking(false);
    }
  };

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
          className="w-full max-w-[720px] overflow-hidden rounded-2xl border"
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
                Credentials are encrypted at rest and never returned to this
                browser.
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
            {!canConfigure ? (
              <View
                className="mb-4 rounded-lg border p-3"
                style={{
                  backgroundColor: palette.warningSoft,
                  borderColor: palette.warningBorder,
                }}
              >
                <Text
                  className="font-body text-[10px]"
                  style={{ color: palette.warningValue }}
                >
                  Your account can view SAP data but cannot change credentials.
                </Text>
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-3">
              <Field
                label="Connection name"
                value={form.name}
                onChange={(value) => update("name", value)}
                palette={palette}
              />
              <Choice
                label="SAP landscape"
                value={editionLabel(form.edition)}
                onPress={() =>
                  update(
                    "edition",
                    form.edition === "cloud_public"
                      ? "cloud_private"
                      : form.edition === "cloud_private"
                        ? "on_premise"
                        : form.edition === "on_premise"
                          ? "integration_suite"
                          : "cloud_public",
                  )
                }
                palette={palette}
              />
              <Choice
                label="Authentication"
                value={
                  form.authType === "oauth_client_credentials"
                    ? "OAuth 2.0 client credentials"
                    : "Basic authentication"
                }
                onPress={() =>
                  update(
                    "authType",
                    form.authType === "oauth_client_credentials"
                      ? "basic"
                      : "oauth_client_credentials",
                  )
                }
                palette={palette}
              />
              <Field
                label="SAP base URL"
                value={form.baseUrl}
                onChange={(value) => update("baseUrl", value)}
                placeholder="https://customer-api.s4hana.cloud.sap"
                palette={palette}
                wide
              />
              {form.authType === "oauth_client_credentials" ? (
                <>
                  <Field
                    label="OAuth token URL"
                    value={form.tokenUrl}
                    onChange={(value) => update("tokenUrl", value)}
                    placeholder="https://…/oauth/token"
                    palette={palette}
                    wide
                  />
                  <Field
                    label="Client ID"
                    value={form.clientId}
                    onChange={(value) => update("clientId", value)}
                    placeholder={
                      connection
                        ? "Leave blank to keep current"
                        : "OAuth client ID"
                    }
                    palette={palette}
                  />
                  <Field
                    label="Client secret"
                    value={form.clientSecret}
                    onChange={(value) => update("clientSecret", value)}
                    placeholder={
                      connection
                        ? "Leave blank to keep current"
                        : "OAuth client secret"
                    }
                    secure
                    palette={palette}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="SAP username"
                    value={form.username}
                    onChange={(value) => update("username", value)}
                    placeholder={
                      connection
                        ? "Leave blank to keep current"
                        : "Communication user"
                    }
                    palette={palette}
                  />
                  <Field
                    label="SAP password"
                    value={form.password}
                    onChange={(value) => update("password", value)}
                    placeholder={
                      connection ? "Leave blank to keep current" : "Password"
                    }
                    secure
                    palette={palette}
                  />
                </>
              )}
              <Field
                label="Default plant"
                value={form.defaultPlant}
                onChange={(value) => update("defaultPlant", value)}
                palette={palette}
              />
            </View>
            <View
              className="mt-5 border-t pt-4"
              style={{ borderColor: palette.line }}
            >
              <View className="mb-3 flex-row items-center justify-between">
                <Text
                  className="font-body-medium text-[12px]"
                  style={{ color: palette.ink }}
                >
                  Enabled API surface
                </Text>
                <StatusPill label="6 resources" tone="success" />
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
                  </View>
                ))}
              </View>
            </View>
            {notice ? (
              <View
                className="mt-4 rounded-lg border p-3"
                style={{
                  backgroundColor: ok
                    ? palette.accentSoft
                    : palette.criticalSoft,
                  borderColor: ok
                    ? palette.accentBorder
                    : palette.criticalBorder,
                }}
              >
                <Text
                  className="font-body text-[10px]"
                  style={{
                    color: ok ? palette.accentValue : palette.criticalValue,
                  }}
                >
                  {notice}
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <View
            className="flex-row flex-wrap justify-end gap-2 border-t p-4"
            style={{ borderColor: palette.line }}
          >
            <SapButton label="Close" onPress={onClose} compact />
            <SapButton
              label={working ? "Working…" : "Test connection"}
              onPress={test}
              compact
              disabled={working || !connection}
            />
            <SapButton
              label={working ? "Saving…" : "Save configuration"}
              primary
              compact
              onPress={save}
              disabled={working || !canConfigure || !form.baseUrl}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function editionLabel(value: string) {
  if (value === "cloud_private") return "S/4HANA Cloud Private";
  if (value === "on_premise") return "S/4HANA On-Premise";
  if (value === "integration_suite") return "SAP Integration Suite";
  return "S/4HANA Cloud Public";
}

function Field({
  label,
  value,
  onChange,
  palette,
  wide = false,
  placeholder,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  palette: ReturnType<typeof useSapPalette>;
  wide?: boolean;
  placeholder?: string;
  secure?: boolean;
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
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkFaint}
        secureTextEntry={secure}
        autoCapitalize="none"
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

function Choice({
  label,
  value,
  onPress,
  palette,
}: {
  label: string;
  value: string;
  onPress: () => void;
  palette: ReturnType<typeof useSapPalette>;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 260 }}>
      <Text
        className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: palette.inkFaint }}
      >
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        className="rounded-lg border px-3 py-2.5"
        style={{
          backgroundColor: palette.panelRaised,
          borderColor: palette.line,
        }}
      >
        <Text className="font-body text-[11px]" style={{ color: palette.ink }}>
          {value}
        </Text>
      </Pressable>
    </View>
  );
}
