import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { coveragePriority } from "../lib/territoryCoverage";
import {
  mapColors,
  type MapPoint,
  type MapShape,
  type MapTerritory,
} from "../lib/territoryMap";

interface Props {
  territories: MapTerritory[];
  shapes: MapShape[];
  today: string;
  selected: string;
  onSelect: (id: string) => void;
  fitKey: number;
  focusKey: number;
  streets: boolean;
  editParts: MapPoint[][] | null;
  currentPart: number;
  onAddPoint: (point: MapPoint) => void;
  onMovePoint: (index: number, point: MapPoint) => void;
}
const latLng = ([lng, lat]: MapPoint): L.LatLngExpression => [lat, lng];
const point = (latlng: L.LatLng): MapPoint => [
  Number(latlng.lng.toFixed(8)),
  Number(latlng.lat.toFixed(8)),
];
export default function TerritoryMapCanvas(props: Props) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    catalog = useRef<L.LayerGroup | null>(null),
    editor = useRef<L.LayerGroup | null>(null),
    tiles = useRef<L.TileLayer | null>(null),
    paths = useRef(new Map<string, L.Polygon>()),
    current = useRef(props),
    fitted = useRef(false);
  const [tileError, setTileError] = useState(false);
  current.current = props;
  useEffect(() => {
    const instance = L.map(element.current!, {
      center: [-5.19, -80.63],
      zoom: 14,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    map.current = instance;
    fitted.current = false;
    instance.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>',
    );
    catalog.current = L.layerGroup().addTo(instance);
    editor.current = L.layerGroup().addTo(instance);
    tiles.current = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        minZoom: 3,
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 1,
        referrerPolicy: "strict-origin",
        crossOrigin: "anonymous",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      },
    );
    tiles.current.on("tileerror", () => setTileError(true));
    tiles.current.on("load", () => {
      if (element.current?.querySelector("img.leaflet-tile-loaded"))
        setTileError(false);
    });
    instance.on("click", (event: L.LeafletMouseEvent) => {
      if (current.current.editParts)
        current.current.onAddPoint(point(event.latlng));
    });
    const resize = new ResizeObserver(() =>
      instance.invalidateSize({ pan: false }),
    );
    resize.observe(element.current!);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      catalog.current = null;
      editor.current = null;
      tiles.current = null;
      paths.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!map.current || !tiles.current) return;
    if (props.streets) tiles.current.addTo(map.current);
    else tiles.current.remove();
  }, [props.streets]);
  useEffect(() => {
    if (!map.current || !catalog.current) return;
    catalog.current.clearLayers();
    paths.current.clear();
    for (const shape of props.shapes) {
      if (shape.deleted_at) continue;
      const territory = props.territories.find(
        (t) => t.id === shape.territory_id,
      );
      if (!territory) continue;
      const priority = coveragePriority(territory.last_completed, props.today),
        selected = shape.territory_id === props.selected;
      const polygon = L.polygon(
        shape.geometry.coordinates.map((part) =>
          part.map((ring) => ring.map(latLng)),
        ),
        {
          color: selected ? "#17466f" : mapColors[priority.color],
          fillColor: mapColors[priority.color],
          fillOpacity: selected ? 0.56 : 0.3,
          weight: selected ? 3 : 1.7,
          dashArray: shape.review_status === "draft" ? "5 4" : undefined,
        },
      ).addTo(catalog.current);
      const label = document.createElement("span");
      label.textContent = String(territory.territory_number);
      polygon.bindTooltip(label, {
        permanent: true,
        direction: "center",
        className: "territory-map-number",
        opacity: 0.95,
      });
      polygon.on("click", () => {
        if (!current.current.editParts)
          current.current.onSelect(shape.territory_id);
      });
      const path = polygon.getElement();
      if (path) {
        path.setAttribute("role", "button");
        path.setAttribute("tabindex", "0");
        path.setAttribute(
          "aria-label",
          `Seleccionar territorio ${territory.territory_number}, ${priority.label}`,
        );
        path.addEventListener("keydown", (event) => {
          const key = (event as KeyboardEvent).key;
          if (key === "Enter" || key === " ") {
            event.preventDefault();
            current.current.onSelect(shape.territory_id);
          }
        });
      }
      paths.current.set(shape.territory_id, polygon);
    }
    if (!fitted.current && paths.current.size) {
      const bounds = L.latLngBounds(
        [...paths.current.values()].flatMap((p) => [
          p.getBounds().getSouthWest(),
          p.getBounds().getNorthEast(),
        ]),
      );
      map.current.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 17,
        animate: false,
      });
      fitted.current = true;
    }
  }, [props.territories, props.shapes, props.today, props.selected]);
  useEffect(() => {
    const polygon = paths.current.get(props.selected);
    if (polygon && map.current)
      map.current.fitBounds(polygon.getBounds(), {
        padding: [65, 65],
        maxZoom: 18,
        animate: false,
      });
  }, [props.focusKey]);
  useEffect(() => {
    if (!map.current || !paths.current.size) return;
    const bounds = L.latLngBounds(
      [...paths.current.values()].flatMap((p) => [
        p.getBounds().getSouthWest(),
        p.getBounds().getNorthEast(),
      ]),
    );
    map.current.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 17,
      animate: false,
    });
  }, [props.fitKey]);
  useEffect(() => {
    const group = editor.current;
    if (!group) return;
    group.clearLayers();
    if (!props.editParts) return;
    props.editParts.forEach((part, index) => {
      if (!part.length) return;
      const currentPart = index === props.currentPart;
      if (part.length >= 3)
        L.polygon(part.map(latLng), {
          color: "#1f5d92",
          weight: 3,
          fillOpacity: 0.08,
          interactive: false,
          dashArray: "4 3",
        }).addTo(group);
      else
        L.polyline(part.map(latLng), {
          color: "#1f5d92",
          weight: 3,
          interactive: false,
        }).addTo(group);
      if (!currentPart) return;
      part.forEach((p, i) => {
        const handle = L.marker(latLng(p), {
          draggable: true,
          keyboard: true,
          title: `Vértice ${i + 1}`,
          icon: L.divIcon({
            className: "territory-map-handle",
            html: "",
            iconSize: [13, 13],
            iconAnchor: [6, 6],
          }),
        }).addTo(group);
        handle.on("dragend", () =>
          current.current.onMovePoint(i, point(handle.getLatLng())),
        );
      });
    });
  }, [props.editParts, props.currentPart]);
  return (
    <div
      className={`territory-map-canvas-wrap ${props.editParts ? "is-drawing" : ""}`}
    >
      <div
        ref={element}
        className="territory-map-canvas"
        role="region"
        aria-label="Mapa interactivo de territorios"
      />
      {!props.streets && (
        <div className="territory-map-base-note">
          Vista de límites · mapa de calles oculto
        </div>
      )}
      {tileError && props.streets && (
        <p className="territory-map-tile-error" role="status">
          El fondo de calles no se pudo cargar por completo. Puedes seguir
          consultando los polígonos.
        </p>
      )}
    </div>
  );
}
