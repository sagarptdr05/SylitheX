export default function Logo({ size = 34, withText = true, dark = false }: { size?: number; withText?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563EB" /><stop offset="1" stopColor="#0891B2" /></linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#lg)" />
        <circle cx="32" cy="32" r="11" fill="none" stroke="#fff" strokeWidth="3.5" />
        <ellipse cx="32" cy="32" rx="24" ry="9" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2.5" transform="rotate(-28 32 32)" />
        <circle cx="51" cy="21" r="4" fill="#fff"><animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite" /></circle>
        <path d="M27 32l3.5 3.5L38 28" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && (
        <div className="leading-none">
          <div className={`font-display text-[17px] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
            Terra<span className="text-gradient">Trust</span> <span className={dark ? 'text-sky' : 'text-ink-3'}>AI</span>
          </div>
          <div className={`mt-1 font-mono text-[9px] uppercase tracking-[0.2em] ${dark ? 'text-sky/70' : 'text-ink-3'}`}>EO Trust Layer</div>
        </div>
      )}
    </div>
  )
}
