Objective: Fix the Devices table so long device names are readable and fully discoverable.

Current issue:
- In the Devices screen, the Device Name column is too narrow while other columns have excess empty spacing.
- Names like GATEWAY_SSE_HE... show too little of the real name.

Requirements:
- Update the existing app component, not a standalone mockup.
- Scope should stay in components/console/DevicesTable.tsx unless a tiny shared helper is clearly justified.
- Make at least about 70 percent of typical long gateway/device names visible in the row.
- Preserve table alignment across header and rows.
- Keep the Sim badge visible without stealing most of the name width.
- On hover, show the full device name properly.
- Use existing console theme tokens/classes; do not introduce new accent colors.
- Do not change device data, sorting behavior, row press behavior, or menu behavior.

Relevant project guidance:
- This is an authenticated Expo/RN-Web console route; evaluator is usually unavailable.
- Use the existing React Native / NativeWind component style.
- Expo SDK v57 docs have been checked.
