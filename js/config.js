const CONFIG = {
  DEFAULT_LAT:  43.7184,
  DEFAULT_LNG: -79.5181,
  DEFAULT_ZOOM: 11,
// thrreshikd before showing businesses to avoid cltutering the map
  BUSINESS_ZOOM_THRESHOLD: 14,

  OVERPASS_URL: 'https://overpass-api.de/api/interpreter',

  GTA_BBOX: {
    south: 43.4000,
    west:  -80.0000,
    north: 44.0500,
    east:  -78.8000,
  },

  VIEWPORT_PADDING: 0.005,

//backup
  STORAGE_KEY: 'replate_reports_cache',
};
