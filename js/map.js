const MapManager = (() => {

  let map = null;
  let userMarker = null;

  // layer groups
  const layers = {
    foodbank: L.layerGroup(),
    surplus:  L.layerGroup(),
    business: L.layerGroup(),
  };

  // search thingy
  const searchLayer = L.layerGroup();
  let searchHighlightMarker = null;

  const fetchedTiles = new Set();

  let moveDebounce = null;

// im not even gonna try to understand what tihs is for
  const SVG_PATHS = {
    'heart-handshake': `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/>`,
    'package-open':   `<path d="M20.91 8.84 8.56 2.23a1.93 1.93 0 0 0-1.81 0L3.1 4.13a2.12 2.12 0 0 0-.05 3.69l12.22 6.93a2 2 0 0 0 1.94 0L21 12.51a2.12 2.12 0 0 0-.09-3.67Z"/><path d="m3.09 8.84 6.04 5.97"/><path d="M12 12v9"/><path d="m20.91 8.84-9 5.16"/><path d="M3 13.5l9 5 9-5"/>`,
    'store':          `<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>`,
    'map-pin':        `<path d="M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,
  };

  function svgIcon(name, size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG_PATHS[name] || ''}</svg>`;
  }

  function createMarkerIcon(type, size = 36) {
    const cfg = {
      foodbank: { icon: 'heart-handshake', css: 'marker-foodbank' },
      surplus:  { icon: 'package-open',    css: 'marker-surplus'  },
      business: { icon: 'store',           css: 'marker-business' },
    }[type] || { icon: 'store', css: 'marker-business' };

    const innerSize = Math.round(size * 0.48);
    const html = `<div class="custom-marker ${cfg.css}" style="width:${size}px;height:${size}px;">${svgIcon(cfg.icon, innerSize)}</div>`;
    return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }

  //init the map
  function init(lat, lng) {
    if (map) return;

    const bizCache = Store.loadBusinessCache();
    if (bizCache) {
      Store.mergeOsmBusinesses(bizCache.businesses);
      bizCache.tiles.forEach(t => fetchedTiles.add(t));
    }

    map = L.map('map', {
      center: [lat, lng],
      zoom: CONFIG.DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    Object.values(layers).forEach(lg => lg.addTo(map));
    searchLayer.addTo(map);

    map.on('click', () => document.dispatchEvent(new CustomEvent('map:click')));

    map.on('moveend', () => {
      clearTimeout(moveDebounce);
      moveDebounce = setTimeout(() => {
        document.dispatchEvent(new CustomEvent('map:moved'));
      }, 300);
    });
  }

  // usermarker
  function setUserLocation(lat, lng) {
    const icon = L.divIcon({
      html: '<div class="user-location-marker"></div>',
      className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    });
    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
    } else {
      userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
      userMarker.bindTooltip('You are here', { permanent: false, direction: 'top' });
    }
  }

  function panTo(lat, lng, zoom = 15) {
    if (map) map.flyTo([lat, lng], zoom, { duration: 1.1 });
  }

  function renderAll() {
    const filter = Store.getActiveFilter();

    // render the food banks
    layers.foodbank.clearLayers();
    if (filter === 'all' || filter === 'foodbank') {
      Store.getFoodBanks().forEach(fb => {
        const m = makeMarker(fb, 42);
        layers.foodbank.addLayer(m);
      });
    }

    // reports
    layers.surplus.clearLayers();
    if (filter === 'all' || filter === 'surplus') {
      Store.getSurplusReports().forEach(sr => {
        const m = makeMarker(sr, 36);
        layers.surplus.addLayer(m);
      });
    }

    // rendering the businesses
    layers.business.clearLayers();
    const zoom = map ? map.getZoom() : 0;
    if ((filter === 'all' || filter === 'business') && zoom >= CONFIG.BUSINESS_ZOOM_THRESHOLD) {
      Store.getOsmBusinesses().forEach(biz => {
        const m = makeMarker(biz, 28);
        layers.business.addLayer(m);
      });
    }

    updateZoomHint(filter, zoom);
  }

  function updateZoomHint(filter, zoom) {
    const hint = document.getElementById('zoom-hint');
    if (!hint) return;
    const showBiz = filter === 'all' || filter === 'business';
    if (showBiz && zoom < CONFIG.BUSINESS_ZOOM_THRESHOLD) {
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  function makeMarker(loc, size) {
    const icon = createMarkerIcon(loc.type, size);
    const marker = L.marker([loc.lat, loc.lng], {
      icon,
      zIndexOffset: loc.type === 'foodbank' ? 500 : loc.type === 'surplus' ? 300 : 0,
    });

    marker.bindPopup(buildPopup(loc), { maxWidth: 260 });

    marker.on('click', () => {
      if (loc.type === 'business') {
        Store.setPendingBusiness(loc);
        document.dispatchEvent(new CustomEvent('business:selected', { detail: loc }));
      }
      document.dispatchEvent(new CustomEvent('marker:clicked', { detail: loc }));
    });

    return marker;
  }

  function buildPopup(loc) {
    const labels = { foodbank: 'Food Bank', surplus: 'Surplus Food', business: 'Business' };
    const label  = labels[loc.type] || loc.type;

    let detail = '';
    if (loc.type === 'surplus')  detail = `<strong>${loc.foodType}</strong> · ${loc.quantity}`;
    else if (loc.hours)          detail = loc.hours;
    else if (loc.osmCategory)    detail = loc.osmCategory;

    const actionBtn = loc.type === 'business'
      ? `<button class="popup-btn popup-btn-report" onclick="App.openReportForBusiness('${loc.id}')">
           ${svgIcon('package-open', 12)} Report Surplus Here
         </button>`
      : `<button class="popup-btn" onclick="App.openDetail('${loc.id}')">
           ${svgIcon('store', 12)} View Details
         </button>`;

    return `
      <div class="popup-name">${loc.name}</div>
      <div class="popup-type ${loc.type}">${label}</div>
      ${detail ? `<div class="popup-detail">${detail}</div>` : ''}
      <div class="popup-actions">
        <button class="popup-btn" onclick="App.openDetail('${loc.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          Details
        </button>
        ${loc.type === 'business' ? `<button class="popup-btn popup-btn-report" onclick="App.openReportForBusiness('${loc.id}')">
          ${svgIcon('package-open', 12)} Report Surplus
        </button>` : ''}
      </div>`;
  }

  async function fetchGtaFoodBanks() {
    const { south, west, north, east } = CONFIG.GTA_BBOX;
    const bbox = `${south},${west},${north},${east}`;

    const query = `
      [out:json][timeout:30];
      (
        node["amenity"="food_bank"](${bbox});
        way["amenity"="food_bank"](${bbox});
        node["social_facility"="food_bank"](${bbox});
        way["social_facility"="food_bank"](${bbox});
        node["amenity"="social_facility"]["social_facility"="food_bank"](${bbox});
      );
      out center;`;

    try {
      const res = await fetch(CONFIG.OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await res.json();

      const banks = (data.elements || [])
        .filter(el => el.tags && (el.lat || el.center))
        .map(el => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          const t   = el.tags;
          return {
            id:      'fb_osm_' + el.id,
            type:    'foodbank',
            name:    t.name || t['name:en'] || 'Food Bank',
            address: buildAddress(t),
            lat, lng,
            phone:   t.phone || t['contact:phone'] || t['contact:mobile'] || '',
            hours:   t.opening_hours || '',
            website: t.website || t['contact:website'] || '',
            description: t.description || t.note || '',
          };
        })
        .filter(b => b.lat && b.lng);

      return banks;
    } catch (err) {
      console.warn('[Replate] Food bank fetch error:', err);
      return [];
    }
  }

  async function fetchViewportBusinesses() {
    if (!map) return;
    const zoom = map.getZoom();
    if (zoom < CONFIG.BUSINESS_ZOOM_THRESHOLD) return;

    const bounds = map.getBounds();
    const p = CONFIG.VIEWPORT_PADDING;
    const s = (bounds.getSouth() - p).toFixed(6);
    const w = (bounds.getWest()  - p).toFixed(6);
    const n = (bounds.getNorth() + p).toFixed(6);
    const e = (bounds.getEast()  + p).toFixed(6);
    const bbox = `${s},${w},${n},${e}`;

    const tileKey = `${Math.round(parseFloat(s)*20)}_${Math.round(parseFloat(w)*20)}`;
    if (fetchedTiles.has(tileKey)) return;
    fetchedTiles.add(tileKey);

    setLoading(true, 'Loading businesses…');

    const query = `
      [out:json][timeout:20];
      (
        node["shop"~"supermarket|grocery|greengrocer|bakery|butcher|deli|convenience|department_store|farm|food|general|health_food|seafood"](${bbox});
        node["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|marketplace"](${bbox});
        way["shop"~"supermarket|grocery|greengrocer|bakery|butcher|deli|convenience"](${bbox});
        way["amenity"~"restaurant|cafe|fast_food"](${bbox});
      );
      out center 200;`;

    try {
      const res = await fetch(CONFIG.OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await res.json();

      const businesses = (data.elements || [])
        .filter(el => el.tags && el.tags.name && (el.lat || el.center))
        .map(el => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          const t   = el.tags;
          const cat = t.shop || t.amenity || '';
          return {
            id:          'osm_' + el.id,
            type:        'business',
            name:        t.name,
            address:     buildAddress(t),
            lat, lng,
            phone:       t.phone || t['contact:phone'] || '',
            website:     t.website || t['contact:website'] || '',
            hours:       t.opening_hours || '',
            osmCategory: formatCategory(cat),
            osmRaw:      cat,
          };
        })
        .filter(b => b.lat && b.lng);

      Store.mergeOsmBusinesses(businesses);
      Store.enrichAddresses(businesses);
      Store.saveBusinessCache(Store.getOsmBusinesses(), fetchedTiles);
      renderAll();
      document.dispatchEvent(new CustomEvent('data:businesses-loaded'));
    } catch (err) {
      console.warn('[Replate] Business fetch error:', err);
      fetchedTiles.delete(tileKey); // allow retry
    } finally {
      setLoading(false);
    }
  }


  function buildAddress(t) {
    const parts = [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean);
    return parts.join(' ') || '';
  }

  function formatCategory(raw) {
    const map = {
      supermarket: 'Supermarket', grocery: 'Grocery Store', greengrocer: 'Greengrocer',
      bakery: 'Bakery', butcher: 'Butcher', deli: 'Deli', convenience: 'Convenience Store',
      restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Fast Food',
      food_court: 'Food Court', pub: 'Pub', bar: 'Bar',
      health_food: 'Health Food', seafood: 'Seafood', farm: 'Farm Shop',
      department_store: 'Department Store',
    };
    return map[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function setLoading(on, text = '') {
    const el  = document.getElementById('loading-indicator');
    const txt = document.getElementById('loading-text');
    if (!el) return;
    if (on) { el.classList.remove('hidden'); if (txt) txt.textContent = text; }
    else    { el.classList.add('hidden'); }
  }

  function highlightSearchResult(result) {
    clearSearchHighlight();

    const size      = 46;
    const innerSize = Math.round(size * 0.46);
    const iconName  = result.type === 'address' ? 'map-pin' : 'store';
    const html      = `<div class="custom-marker marker-business marker-highlighted" style="width:${size}px;height:${size}px;">${svgIcon(iconName, innerSize)}</div>`;
    const icon      = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

    searchHighlightMarker = L.marker([result.lat, result.lng], { icon, zIndexOffset: 2000 })
      .addTo(searchLayer);

    let popupHtml = `<div class="popup-name">${result.name}</div>`;
    if (result.type === 'business') {
      popupHtml += `<div class="popup-type business">${result.osmCategory || 'Business'}</div>`;
      if (result.address) popupHtml += `<div class="popup-detail">${result.address}</div>`;
      popupHtml += `<div class="popup-actions">
        <button class="popup-btn" onclick="App.openDetail('${result.id}')">
          ${svgIcon('store', 12)} Details
        </button>
        <button class="popup-btn popup-btn-report" onclick="App.openReportForBusiness('${result.id}')">
          ${svgIcon('package-open', 12)} Report Surplus
        </button>
      </div>`;
    }

    searchHighlightMarker.bindPopup(popupHtml, { maxWidth: 240 }).openPopup();
  }

  function clearSearchHighlight() {
    if (searchHighlightMarker) {
      searchLayer.removeLayer(searchHighlightMarker);
      searchHighlightMarker = null;
    }
  }

  function getMap()     { return map; }
  function getZoom()    { return map ? map.getZoom() : 0; }
  function getBounds()  { return map ? map.getBounds() : null; }

  return {
    init,
    setUserLocation,
    panTo,
    renderAll,
    fetchGtaFoodBanks,
    fetchViewportBusinesses,
    setLoading,
    getMap,
    getZoom,
    getBounds,
    highlightSearchResult,
    clearSearchHighlight,
  };
})();
