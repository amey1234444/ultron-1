import type { SapTone } from "./types";

export const SAP_EQUIPMENT_ROWS = [
  [
    "TSE-01",
    "Twin-screw extruder · Line 1",
    "EQ-100034",
    "PL01-EXT-01",
    "1000",
    "EXT-01",
    "Validated",
  ],
  [
    "SSE-02",
    "Single-screw extruder · Line 2",
    "EQ-100041",
    "PL01-EXT-02",
    "1000",
    "EXT-02",
    "Validated",
  ],
  [
    "RAV-03",
    "Rotary air valve · Feed system",
    "—",
    "PL01-FEED-03",
    "1000",
    "FEED-01",
    "Review",
  ],
  [
    "PMP-08",
    "Cooling-water pump",
    "EQ-100056",
    "PL01-UTL-CW",
    "1000",
    "UTIL-01",
    "Duplicate",
  ],
] as const;

export const SAP_MEASURING_POINTS = [
  ["V21", "Motor vibration DE", "MP-310021", "Published"],
  ["T34", "Zone 1 temperature", "MP-310024", "Published"],
  ["S15", "Screw speed", "—", "Not published"],
] as const;

export const SAP_ACTIVITY: Array<{
  age: string;
  text: string;
  status: string;
  tone: SapTone;
}> = [
  {
    age: "44 sec ago",
    text: "Equipment EQ-100034 refreshed from SAP",
    status: "Success",
    tone: "success",
  },
  {
    age: "3 min ago",
    text: "Maintenance order 4000216 changed to PCNF",
    status: "Updated",
    tone: "success",
  },
  {
    age: "18 min ago",
    text: "Material BRG-6208 stock lookup timed out",
    status: "Retrying",
    tone: "warning",
  },
];

export const MAINTENANCE_LANES = [
  {
    title: "ULTRON review",
    items: [
      {
        title: "TSE-01 · Bearing degradation",
        detail: "Confidence 92% · RUL 9 days",
        meta: "MC-204",
        tone: "warning" as const,
      },
    ],
  },
  {
    title: "SAP notification",
    items: [
      {
        title: "RAV-01 · Rotor imbalance",
        detail: "Notification 10004690",
        meta: "Created",
        tone: "success" as const,
      },
    ],
  },
  {
    title: "Order execution",
    items: [
      {
        title: "SSE-02 · Pressure instability",
        detail: "Order 4000216 · Operation 0010",
        meta: "Released",
        tone: "success" as const,
      },
      {
        title: "PMP-08 · Seal leakage",
        detail: "Order 4000221 · parts staged",
        meta: "22:00",
        tone: "warning" as const,
      },
    ],
  },
  {
    title: "Verification",
    items: [
      {
        title: "MIX-04 · Motor alignment",
        detail: "Order 4000198 technically complete",
        meta: "Watch 48h",
        tone: "info" as const,
      },
    ],
  },
] as const;

export const MATERIAL_ROWS = [
  ["Drive-end bearing", "BRG-6208", "1 EA", "2 EA", "Short by 1", "critical"],
  ["Bearing housing seal", "SEAL-45", "4 EA", "1 EA", "Ready", "success"],
  ["High-temp grease", "LUBE-HT02", "13 KG", "0.5 KG", "Ready", "success"],
] as const;

export const API_HEALTH = [
  ["Equipment", "API_EQUIPMENT", "200 · 44s", "success"],
  ["Notifications", "API_MAINTENANCENOTIFICATION", "201 · 2h", "success"],
  ["Maintenance orders", "API_MAINTENANCEORDER_0002", "200 · 18s", "success"],
  ["Material stock", "API_MATERIAL_STOCK", "Retrying", "warning"],
  ["Measurements", "API_MEASUREMENTDOCUMENT", "201 · 12m", "success"],
  ["Production orders", "API_PRODUCTION_ORDER_2_SRV", "200 · 22s", "success"],
] as const;

export const AUDIT_ROWS = [
  ["21:15:44", "equipment.sync", "EQ-100034", "System", "Success", "7f2a…91d0"],
  ["21:12:08", "order.status", "4000216", "System", "REL → PCNF", "220c…a8b4"],
  [
    "20:58:31",
    "notification.create",
    "MC-198",
    "A. Planner",
    "201",
    "0d81…ed02",
  ],
  ["20:47:02", "material.read", "BRG-6208", "System", "Timeout", "57be…1fc0"],
] as const;
