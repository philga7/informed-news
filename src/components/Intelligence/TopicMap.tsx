import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { NewsArticle } from '../../types';

// Fix for default marker icon in Leaflet with Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface TopicMapProps {
  articles: NewsArticle[];
}

interface ArticleLocation {
  article: NewsArticle;
  lat: number;
  lng: number;
}

// Extract location from article (placeholder - structure ready for future implementation)
function extractLocation(_article: NewsArticle): { lat: number; lng: number } | null {
  // TODO: Implement location extraction from article metadata, content, or external API
  // For now, return null - map will render but show empty
  return null;
}

export function TopicMap({ articles }: TopicMapProps) {
  const locations: ArticleLocation[] = [];

  // Extract locations from articles
  articles.forEach(article => {
    const location = extractLocation(article);
    if (location) {
      locations.push({
        article,
        ...location,
      });
    }
  });

  // Default center (world view)
  const defaultCenter: [number, number] = [20, 0];
  const defaultZoom = 2;

  // Calculate center from locations if available
  let center = defaultCenter;
  let zoom = defaultZoom;

  if (locations.length > 0) {
    const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;
    center = [avgLat, avgLng];
    zoom = 5;
  }

  useEffect(() => {
    // Fix for Leaflet map not rendering properly in React
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border border-stone-800 relative">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((location, index) => (
          <Marker key={index} position={[location.lat, location.lng]}>
            <Popup>
              <div className="text-sm">
                <h3 className="font-semibold text-stone-900 mb-1">{location.article.title}</h3>
                <p className="text-stone-600 text-xs mb-2">{location.article.source}</p>
                <a
                  href={location.article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  Read article →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {locations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900/50 backdrop-blur-sm z-[1000] pointer-events-none">
          <p className="text-stone-400 text-sm">No location data available for these articles</p>
        </div>
      )}
    </div>
  );
}

