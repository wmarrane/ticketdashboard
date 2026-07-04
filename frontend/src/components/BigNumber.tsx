export default function BigNumber({ value, label }: { value: number; label: string }) {
  return (
    <div className="big-number">
      <span className="big-number-value">{value}</span>
      <span className="big-number-label">{label}</span>
    </div>
  );
}
