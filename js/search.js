const Search = (() => {

  let debounceTimer = null;
  let currentQuery  = '';
  let activeAbort   = null;

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    const input    = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    input?.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn?.classList.toggle('hidden', !q);
      if (!q) { closeResults(); currentQuery = ''; return; }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runQuery(q), 380);
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Escape') { input.blur(); closeResults(); }
    });

    clearBtn?.addEventListener('click', () => {
      input.value = '';
      clearBtn.classList.add('hidden');
      closeResults();
      currentQuery = '';
      MapManager.clearSearchHighlight();
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('search-wrap')?.contains(e.target)) {
        closeResults();
      }
    });

    document.addEventListener('map:click', closeResults);
  }

  // query
  async function runQuery(q) {
    if (q === currentQuery) return;
    currentQuery = q;

    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();
    const { signal } = activeAbort;

    showLoading();

    const localItems = searchLocal(q);

    const [ovpResult, geoResult] = await Promise.allSettled([
      searchOverpass(q, signal),
      geocodeNominatim(q, signal),
    ]);

    if (currentQuery !== q) return; 

    const ovpItems = ovpResult.status === 'fulfilled' ? ovpResult.value : [];
    const geoItems = geoResult.status  === 'fulfilled' ? geoResult.value  : [];

    const seen    = new Set();
    const merged  = [];
    [...localItems, ...ovpItems].forEach(r => {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    });
    geoItems.forEach(r => {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    });

    const needAddr = merged.filter(r => r.type === 'business' && !r.address && r.lat != null);
    if (needAddr.length) await enrichAddrs(needAddr, signal);

    if (currentQuery !== q) return;
    renderResults(merged);
  }

  function searchLocal(q) {
    const lq = q.toLowerCase();
    return Store.getOsmBusinesses()
      .filter(b => b.name?.toLowerCase().includes(lq))
      .slice(0, 5)
      .map(b => ({ ...b, _src: 'local' }));
  }

  async function searchOverpass(q, signal) {
    const { south, west, north, east } = CONFIG.GTA_BBOX;
    const bbox    = `${south},${west},${north},${east}`;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const oql = `
      [out:json][timeout:12];
      (
        node["name"~"${escaped}",i]["shop"](${bbox});
        node["name"~"${escaped}",i]["amenity"~"restaurant|cafe|fast_food|food_court|pub|bar|ice_cream|marketplace"](${bbox});
        way["name"~"${escaped}",i]["shop"](${bbox});
        way["name"~"${escaped}",i]["amenity"~"restaurant|cafe|fast_food"](${bbox});
      );
      out center 15;`;

    const res  = await fetch(CONFIG.OVERPASS_URL, {
      method:  'POST',
      body:    'data=' + encodeURIComponent(oql),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    });
    const data = await res.json();

    const businesses = (data.elements || [])
      .filter(el => el.tags?.name && (el.lat || el.center))
      .map(el => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const t   = el.tags;
        const cat = t.shop || t.amenity || '';
        return {
          id: 'osm_' + el.id, type: 'business',
          name: t.name, address: buildAddr(t),
          lat, lng,
          phone:       t.phone || t['contact:phone'] || '',
          website:     t.website || t['contact:website'] || '',
          hours:       t.opening_hours || '',
          osmCategory: fmtCat(cat),
          osmRaw:      cat,
          _src: 'overpass',
        };
      })
      .filter(b => b.lat && b.lng);

    if (businesses.length) Store.mergeOsmBusinesses(businesses);
    return businesses;
  }

  async function geocodeNominatim(q, signal) {
    const { south, west, north, east } = CONFIG.GTA_BBOX;
    const url = 'https://nominatim.openstreetmap.org/search'
      + '?q='       + encodeURIComponent(q)
      + '&format=json&limit=3'
      + `&viewbox=${west},${south},${east},${north}&bounded=1`;

    const res  = await fetch(url, { signal });
    const data = await res.json();

    return data.map(item => ({
      id:      'nom_' + item.place_id,
      type:    'address',
      name:    item.display_name.split(',')[0].trim(),
      address: item.display_name,
      lat:     parseFloat(item.lat),
      lng:     parseFloat(item.lon),
      _src:    'nominatim',
    }));
  }

  // results
  function renderResults(items) {
    const el = document.getElementById('search-results');
    if (!el) return;
    el.innerHTML = '';
    el.classList.remove('hidden');

    if (!items.length) {
      el.innerHTML = '<div class="search-empty">No results found</div>';
      return;
    }

    items.slice(0, 9).forEach(r => {
      const row     = document.createElement('div');
      row.className = 'search-result-row';

      const iconName = r.type === 'address' ? 'map-pin' : 'store';
      const iconCls  = r.type === 'address' ? 'search-result-icon-addr' : 'search-result-icon-biz';
      const badge    = r.type === 'address'
        ? 'Address'
        : (r.osmCategory || 'Business');
      const sub = r.type === 'address'
        ? r.address.split(',').slice(1, 3).join(',').trim()
        : (r.address || r.osmCategory || '');

      row.innerHTML = `
        <div class="search-result-icon ${iconCls}">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="search-result-text">
          <div class="search-result-name">${esc(r.name)}</div>
          ${sub ? `<div class="search-result-sub">${esc(sub)}</div>` : ''}
        </div>
        <span class="search-result-badge">${esc(badge)}</span>`;

      row.addEventListener('click', () => pickResult(r));
      el.appendChild(row);
    });

    if (window.lucide) lucide.createIcons();
  }

  function pickResult(result) {
    document.getElementById('search-input').value = result.name;
    document.getElementById('search-clear')?.classList.remove('hidden');
    closeResults();
    currentQuery = '';

    const zoom = result.type === 'address' ? 15 : 16;
    MapManager.panTo(result.lat, result.lng, zoom);
    MapManager.highlightSearchResult(result);

    if (result._src === 'overpass') {
      MapManager.renderAll();
      Sidebar.render(Store.getVisibleLocations());
    }
  }

  function showLoading() {
    const el = document.getElementById('search-results');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = `<div class="search-loading">
      <div class="loading-spinner" style="width:13px;height:13px;flex-shrink:0"></div>
      Searching…
    </div>`;
  }

  function closeResults() {
    document.getElementById('search-results')?.classList.add('hidden');
  }

  async function enrichAddrs(businesses, signal) {
    const CHUNK = 6;
    for (let i = 0; i < businesses.length; i += CHUNK) {
      if (signal?.aborted) return;
      await Promise.all(
        businesses.slice(i, i + CHUNK).map(b => reverseGeocode(b, signal))
      );
    }
  }

  async function reverseGeocode(biz, signal) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse`
        + `?lat=${biz.lat}&lon=${biz.lng}&format=json&zoom=18`;
      const res  = await fetch(url, { signal });
      const data = await res.json();
      const a    = data.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(' ');
      const city   = a.city || a.town || a.suburb || a.village || '';
      const addr   = [street, city].filter(Boolean).join(', ')
        || data.display_name?.split(',').slice(0, 2).join(',').trim()
        || '';
      if (addr) {
        biz.address = addr;
        const stored = Store.getState().osmBusinesses[biz.id];
        if (stored) stored.address = addr;
      }
    } catch {}
  }

  function buildAddr(t) {
    return [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(' ');
  }

  function fmtCat(raw) {
    const map = {
      supermarket: 'Supermarket', grocery: 'Grocery Store', greengrocer: 'Greengrocer',
      bakery: 'Bakery', butcher: 'Butcher', deli: 'Deli', convenience: 'Convenience Store',
      restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Fast Food', food_court: 'Food Court',
      pub: 'Pub', bar: 'Bar', health_food: 'Health Food', seafood: 'Seafood', farm: 'Farm Shop',
    };
    return map[raw] || raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();
