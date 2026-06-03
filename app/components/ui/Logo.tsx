interface Props {
  size?: 'sm' | 'md';
}

export default function Logo({ size = 'md' }: Props) {
  const iconClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  const textClass = size === 'sm' ? 'text-base' : 'text-lg';
  return (
    <>
      <span
        className={`${iconClass} rounded flex items-center justify-center text-white font-bold flex-shrink-0`}
        style={{ background: 'var(--accent)' }}
      >
        R
      </span>
      <span className={`font-bold ${textClass}`} style={{ color: 'var(--text-primary)' }}>
        REXFORM
      </span>
      <span className={`font-bold ${textClass}`} style={{ color: 'var(--accent)' }}>
        · Notes
      </span>
    </>
  );
}
