// Icons from design/assets/icons.svg: 24×24, stroke = currentColor.

import Svg, { Circle, Path, Rect } from "react-native-svg";

const ICONS = {
  cart: <><Path d="M6.5 8.5h11l-.9 10.1a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6.5 8.5Z" /><Path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></>,
  search: <><Circle cx="11" cy="11" r="6.5" /><Path d="M16 16l4 4" /></>,
  pin: <><Path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><Circle cx="12" cy="9" r="2.5" /></>,
  clock: <><Circle cx="12" cy="12" r="8.5" /><Path d="M12 7.5V12l3 2" /></>,
  phone: <Path d="M6.6 3.5 9.1 3a1.6 1.6 0 0 1 1.8.9l1.1 2.7a1.6 1.6 0 0 1-.4 1.8L10.2 9.8a12.2 12.2 0 0 0 4 4l1.4-1.4a1.6 1.6 0 0 1 1.8-.4l2.7 1.1a1.6 1.6 0 0 1 .9 1.8l-.5 2.5a2.6 2.6 0 0 1-2.6 2.1A15.9 15.9 0 0 1 4.5 5.9a2.6 2.6 0 0 1 2.1-2.4Z" />,
  user: <><Circle cx="12" cy="8.5" r="3.5" /><Path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  gift: <><Rect x="3.5" y="8.5" width="17" height="4" rx="1" /><Path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5S10.5 4 8 4.5 6.5 8.5 12 8.5zM12 8.5S13.5 4 16 4.5s1.5 4-4 4z" /></>,
  menu: <><Path d="M3 11h18a9 9 0 0 1-18 0z" /><Path d="M7 11c0-2 1.5-3 3-3M12 11c.5-2.5 2.5-4 5-3.5" /></>,
  receipt: <><Path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><Path d="M9 8h6M9 12h6" /></>,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  down: <Path d="M6 9l6 6 6-6" />,
  right: <Path d="M9 6l6 6-6 6" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  trash: <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <><Path d="M4 20h4L19 9l-4-4L4 16z" /><Path d="M13.5 6.5l4 4" /></>,
  bell: <><Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><Path d="M10 20a2 2 0 0 0 4 0" /></>,
  "wifi-off": <><Path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 5-3M11 5a15 15 0 0 1 11 4.5" /><Circle cx="12" cy="20" r=".8" /></>,
  alert: <><Path d="M12 3.5l9.5 16.5h-19z" /><Path d="M12 10v4.5M12 17.5v.1" /></>,
  map: <><Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><Path d="M9 4v14M15 6v14" /></>,
  card: <><Rect x="3" y="6" width="18" height="13" rx="2" /><Path d="M3 10h18M7 15h4" /></>,
  cash: <><Rect x="3" y="6" width="18" height="12" rx="2" /><Circle cx="12" cy="12" r="2.5" /><Path d="M6 9v.1M18 15v.1" /></>,
  refresh: <Path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4" />,
  store: <><Path d="M4 10l1.5-5h13L20 10M4 10v10h16V10M4 10h16" /><Path d="M10 20v-5h4v5" /></>,
  truck: <><Path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><Circle cx="7" cy="17.5" r="1.8" /><Circle cx="17" cy="17.5" r="1.8" /></>,
  logout: <Path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  star: <Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />,
  send: <><Path d="M21 3L3 10.5l7 2.5 2.5 7z" /><Path d="M10 13l11-10" /></>,
  locate: <><Circle cx="12" cy="12" r="3" /><Path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><Circle cx="12" cy="12" r="7.5" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, color = "#000", strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </Svg>
  );
}
