import { useMemo, useState } from 'react';

interface LocalMapWidgetProps {
  tileTemplate: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function LocalMapWidget({ tileTemplate }: LocalMapWidgetProps) {
  const [zoom, setZoom] = useState(2);
  const [center, setCenter] = useState({ x: 1, y: 1 });

  const maxIndex = Math.max(2 ** zoom - 1, 0);

  const tiles = useMemo(() => {
    const items: Array<{ key: string; x: number; y: number; z: number }> = [];

    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const x = clamp(center.x + col, 0, maxIndex);
        const y = clamp(center.y + row, 0, maxIndex);

        items.push({
          key: `${zoom}:${x}:${y}:${row}:${col}`,
          x,
          y,
          z: zoom,
        });
      }
    }

    return items;
  }, [center.x, center.y, zoom, maxIndex]);

  const buildTileUrl = (z: number, x: number, y: number) =>
    tileTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

  const move = (dx: number, dy: number) => {
    setCenter((current) => ({
      x: clamp(current.x + dx, 0, maxIndex),
      y: clamp(current.y + dy, 0, maxIndex),
    }));
  };

  const updateZoom = (nextZoom: number) => {
    const safeZoom = clamp(nextZoom, 0, 5);
    const nextMaxIndex = Math.max(2 ** safeZoom - 1, 0);
    const scale = safeZoom > zoom ? 2 : safeZoom < zoom ? 0.5 : 1;

    setZoom(safeZoom);
    setCenter((current) => ({
      x: clamp(Math.round(current.x * scale), 0, nextMaxIndex),
      y: clamp(Math.round(current.y * scale), 0, nextMaxIndex),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => move(0, -1)}
          className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => move(-1, 0)}
          className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => move(1, 0)}
          className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
        >
          Right
        </button>
        <button
          type="button"
          onClick={() => move(0, 1)}
          className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
        >
          Down
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateZoom(zoom - 1)}
            className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
          >
            -
          </button>
          <span className="text-sm text-bolt-elements-textSecondary">Zoom {zoom}</span>
          <button
            type="button"
            onClick={() => updateZoom(zoom + 1)}
            className="px-3 py-2 rounded-md bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
          >
            +
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={buildTileUrl(tile.z, tile.x, tile.y)}
            alt={`tile ${tile.z}/${tile.x}/${tile.y}`}
            className="w-full aspect-square object-cover bg-bolt-elements-background-depth-3"
          />
        ))}
      </div>

      <div className="text-xs text-bolt-elements-textTertiary">
        Local tiles are served from <code>{tileTemplate}</code> and rendered fully offline inside the app container.
      </div>
    </div>
  );
}
