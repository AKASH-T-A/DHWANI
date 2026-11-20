export function DhwaniLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DHWANI Logo"
      className="shrink-0"
    >
      <rect width="40" height="40" rx="8" fill="#0F1B2E" stroke="#223552" strokeWidth="1.25" />
      {/* Outer acoustic signal wave arcs */}
      <path
        d="M9.5 14.5C7.8 17.8 7.8 22.2 9.5 25.5"
        stroke="#38BDF8"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M30.5 14.5C32.2 17.8 32.2 22.2 30.5 25.5"
        stroke="#38BDF8"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M12.5 16.5C11.4 18.7 11.4 21.3 12.5 23.5"
        stroke="#06B6D4"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M27.5 16.5C28.6 18.7 28.6 21.3 27.5 23.5"
        stroke="#06B6D4"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {/* Central geographic emergency locator pin integrated with voice core */}
      <path
        d="M20 9.5C16.134 9.5 13 12.634 13 16.5C13 21.85 20 30.5 20 30.5C20 30.5 27 21.85 27 16.5C27 12.634 23.866 9.5 20 9.5Z"
        fill="#13253F"
        stroke="#E6EDF7"
        strokeWidth="1.6"
      />
      {/* Voice waveform bars inside pin */}
      <path
        d="M17.2 15.2V17.8M20 13.4V19.6M22.8 15.2V17.8"
        stroke="#F97316"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
