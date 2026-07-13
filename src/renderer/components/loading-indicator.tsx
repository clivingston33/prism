export function LoadingIndicator({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-text-tertiary">
      <span className="prism-loader" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </span>
  );
}
