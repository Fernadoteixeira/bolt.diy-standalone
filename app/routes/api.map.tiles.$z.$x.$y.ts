import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function tileToLongitude(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}

function tileToLatitude(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export const loader = withSecurity(
  async ({ params }: LoaderFunctionArgs) => {
  const z = clamp(Number(params.z || 0), 0, 8);
  const maxIndex = 2 ** z - 1;
  const x = clamp(Number(params.x || 0), 0, Math.max(maxIndex, 0));
  const y = clamp(Number(params.y || 0), 0, Math.max(maxIndex, 0));

  const west = tileToLongitude(x, z).toFixed(2);
  const east = tileToLongitude(x + 1, z).toFixed(2);
  const north = tileToLatitude(y, z).toFixed(2);
  const south = tileToLatitude(y + 1, z).toFixed(2);
  const hue = (x * 29 + y * 17 + z * 11) % 360;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 65% 22%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 40) % 360} 70% 10%)" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" fill="url(#bg)" />
      <g fill="none" stroke="rgba(255,255,255,0.22)">
        <path d="M0 64H256M0 128H256M0 192H256" />
        <path d="M64 0V256M128 0V256M192 0V256" />
      </g>
      <g fill="white" font-family="system-ui, sans-serif">
        <text x="16" y="34" font-size="22" font-weight="700">z${z} / x${x} / y${y}</text>
        <text x="16" y="64" font-size="12" opacity="0.9">north ${north}  south ${south}</text>
        <text x="16" y="82" font-size="12" opacity="0.9">west ${west}  east ${east}</text>
        <text x="16" y="224" font-size="13" opacity="0.78">bolt.diy local offline tile</text>
        <text x="16" y="242" font-size="12" opacity="0.66">generated from /api/map/tiles</text>
      </g>
      <circle cx="128" cy="128" r="42" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.26)" />
      <circle cx="128" cy="128" r="3" fill="white" />
    </svg>
  `.trim();

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
  },
  { allowedMethods: ['GET'] },
);
