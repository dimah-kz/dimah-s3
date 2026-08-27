export function HomeBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-fd-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--color-fd-muted)_0%,transparent_58%)] opacity-30" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[56px_56px] opacity-30 mask-[linear-gradient(to_bottom,transparent,black_10%,black_78%,transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,var(--color-fd-background)_82%)]" />
    </div>
  );
}
