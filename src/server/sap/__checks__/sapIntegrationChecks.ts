import assert from "node:assert/strict";

import { parseSapODataPage } from "../client";
import { decryptSapCredentials, encryptSapCredentials } from "../crypto";
import { joinSapUrl, normalizeSapBaseUrl } from "../url";

process.env.SAP_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
  "base64",
);

const encrypted = encryptSapCredentials({
  clientId: "client",
  clientSecret: "secret",
});
assert.ok(!encrypted.includes("secret"));
assert.deepEqual(decryptSapCredentials(encrypted), {
  clientId: "client",
  clientSecret: "secret",
});

assert.equal(
  normalizeSapBaseUrl("https://tenant.example.com/"),
  "https://tenant.example.com",
);
assert.equal(
  joinSapUrl(
    "https://tenant.example.com",
    "/sap/opu/odata/sap/API_EQUIPMENT/Equipment",
  ),
  "https://tenant.example.com/sap/opu/odata/sap/API_EQUIPMENT/Equipment",
);
assert.throws(() =>
  joinSapUrl("https://tenant.example.com", "https://attacker.example.net/data"),
);

assert.deepEqual(
  parseSapODataPage({
    value: [{ Equipment: "100" }],
    "@odata.nextLink": "/next",
  }),
  {
    records: [{ Equipment: "100" }],
    nextLink: "/next",
    count: null,
  },
);
assert.deepEqual(
  parseSapODataPage({
    d: { results: [{ ProductionOrder: "200" }], __count: "1" },
  }),
  {
    records: [{ ProductionOrder: "200" }],
    nextLink: null,
    count: 1,
  },
);

console.log("SAP integration checks passed");
