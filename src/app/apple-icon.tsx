import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same mark as app/icon.svg, with no rounded tile: iOS rounds home-screen icons itself.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#1b1320"/>
  <rect x="6.5" y="14" width="19" height="12.5" rx="2" fill="#f4b740"/>
  <rect x="5" y="10.5" width="22" height="4.5" rx="1.5" fill="#f4b740"/>
  <rect x="14.5" y="10.5" width="3" height="16" fill="#1b1320" opacity="0.55"/>
  <g fill="none" stroke="#f4b740" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 10c-2.4-4.6-7-4.4-6.6-1.6.3 1.9 3.9 1.6 6.6 1.6z"/>
    <path d="M16 10c2.4-4.6 7-4.4 6.6-1.6-.3 1.9-3.9 1.6-6.6 1.6z"/>
  </g>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`} width={180} height={180} alt="" />
    ),
    size,
  );
}
