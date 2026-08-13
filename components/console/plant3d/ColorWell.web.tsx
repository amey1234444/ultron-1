/** Native OS colour picker (web). Gives the super admin the full 24-bit range. */
export function ColorWell({ value, onChange, size = 26 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Pick any colour"
      style={{
        width: size,
        height: size,
        padding: 0,
        border: '1px solid rgba(128,128,128,0.4)',
        borderRadius: 6,
        background: 'transparent',
        cursor: 'pointer',
      }}
    />
  );
}
