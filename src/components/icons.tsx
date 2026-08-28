import type { SVGProps } from "react";

/** 阿里 iconfont 风格的线性图标集，统一描边风格。 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  );
}

export function IconDoc(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3h7l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

export function IconShirt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 4 4 7l2 3 3-2v11h6V8l3 2 2-3-5-3c-1 1.4-2 1.4-3 0-1-1.4-2-1.4-3 0Z" />
    </svg>
  );
}

export function IconPose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="4.6" r="1.7" />
      <path d="M9 8.5 5.5 6M15 8.5 18.5 6" />
      <path d="M12 8.5v6" />
      <path d="M12 11l-4 4.5M12 11l4 4.5M12 14.5 9.5 20M12 14.5l2.5 5.5" />
    </svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a9 9 0 1 0 0 18c1.6 0 2.6-1.1 2.4-2.4-.15-1.05.5-1.85 1.6-1.85H18a3 3 0 0 0 3-3c0-5.5-4-10.75-9-10.75Z" />
      <circle cx="7.7" cy="10" r="1.1" />
      <circle cx="11" cy="7.4" r="1.1" />
      <circle cx="15.6" cy="8.6" r="1.1" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7L16.2 9.4" />
    </svg>
  );
}

export function IconLibrary(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 5.5V20.5M8 7h8" />
    </svg>
  );
}

export function IconStack(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconGear(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9a2.8 2.8 0 0 1 5.4.8c0 1.8-2.7 2.3-2.7 3.7" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17S18 14.5 18 8.5" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.5c.6 4.8 2.7 6.9 7.5 7.5-4.8.6-6.9 2.7-7.5 7.5-.6-4.8-2.7-6.9-7.5-7.5 4.8-.6 6.9-2.7 7.5-7.5Z" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

/** 应用 Logo：与桌面图标一致的「跨境 + AI + 艺术感」标识。 */
export function AppLogo(props: IconProps) {
  const { size = 30, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" {...rest}>
      <defs>
        <linearGradient id="applogo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cf1" />
          <stop offset="0.55" stopColor="#5a3fe0" />
          <stop offset="1" stopColor="#3b7bff" />
        </linearGradient>
        <linearGradient id="applogo-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9be7ff" />
          <stop offset="1" stopColor="#c9b8ff" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#applogo-bg)" />
      <circle cx="256" cy="256" r="176" fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="10" />
      <circle cx="256" cy="256" r="128" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="10" />
      <ellipse cx="256" cy="256" rx="128" ry="46" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" />
      <ellipse cx="256" cy="256" rx="46" ry="128" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" />
      <path d="M212 300 L212 356 M300 300 L300 356 M212 356 L300 356" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" />
      <path d="M212 300 L244 268 L256 256 L268 268 L300 300" fill="none" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M128 220 C 150 150, 220 130, 300 148" fill="none" stroke="url(#applogo-arc)" strokeWidth="11" strokeLinecap="round" />
      <circle cx="176" cy="140" r="11" fill="#ffffff" />
      <circle cx="344" cy="356" r="9" fill="#ffffff" fillOpacity="0.9" />
      <circle cx="362" cy="132" r="7" fill="#ffffff" fillOpacity="0.8" />
      <circle cx="150" cy="352" r="6" fill="#ffffff" fillOpacity="0.7" />
    </svg>
  );
}
