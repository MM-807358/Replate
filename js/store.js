const Store = (() => {

  const state = {
    userLat: null,
    userLng: null,
    userLocationAvailable: false,
    activeFilter: 'all',

    foodBanks: [],
    foodBanksLoaded: false,

    osmBusinesses: {},

    surplusReports: [],

    pendingBusinessFill: null,
  };

  // food banks
  function setFoodBanks(list) {
    state.foodBanks = list;
    state.foodBanksLoaded = true;
  }
  function getFoodBanks() { return state.foodBanks; }

  // OSM businesse
  function mergeOsmBusinesses(list) {
    list.forEach(b => { state.osmBusinesses[b.id] = b; });
  }
  function getOsmBusinesses() { return Object.values(state.osmBusinesses); }
  function clearOsmBusinesses() { state.osmBusinesses = {}; }

  // surplus reports
  function setSurplusReports(list) {
    state.surplusReports = list;
    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(list)); } catch {}
  }
  function getSurplusReports() {
    const now = new Date();
    return state.surplusReports.filter(r => new Date(r.expiresAt) > now);
  }
  function loadCachedReports() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) state.surplusReports = JSON.parse(raw);
    } catch {}
  }

  // user loc
  function setUserLocation(lat, lng) {
    state.userLat = lat;
    state.userLng = lng;
    state.userLocationAvailable = true;
  }

  // filter
  function setActiveFilter(f) { state.activeFilter = f; }
  function getActiveFilter()  { return state.activeFilter; }

  function setPendingBusiness(biz) { state.pendingBusinessFill = biz; }
  function popPendingBusiness()    { const b = state.pendingBusinessFill; state.pendingBusinessFill = null; return b; }

  function getState() { return state; }

  // sidebar items
  function getVisibleLocations() {
    const filter = state.activeFilter;
    let items = [];

    if (filter === 'all' || filter === 'foodbank') {
      items = items.concat(state.foodBanks);
    }
    if (filter === 'all' || filter === 'surplus') {
      items = items.concat(getSurplusReports());
    }
    if (filter === 'all' || filter === 'business') {

      items = items.concat(getOsmBusinesses());
    }

    if (state.userLocationAvailable && state.userLat != null) {
      items.forEach(item => {
        if (item.lat != null && item.lng != null) {
          item._distance = distanceBetween(state.userLat, state.userLng, item.lat, item.lng);
        } else {
          item._distance = Infinity;
        }
      });
      items.sort((a, b) => a._distance - b._distance);
    }

    return items;
  }

  // helpers
  function distanceBetween(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistance(metres) {
    if (metres == null || !isFinite(metres)) return '';
    if (metres < 1000) return Math.round(metres) + ' m away';
    return (metres / 1000).toFixed(1) + ' km away';
  }

  // food bank cache
  const FB_CACHE_KEY = 'replate_foodbanks_cache';
  const FB_CACHE_TTL = 24 * 60 * 60 * 1000;

  function saveCachedFoodBanks(banks) {
    try {
      localStorage.setItem(FB_CACHE_KEY, JSON.stringify({ banks, ts: Date.now() }));
    } catch {}
  }

  function loadCachedFoodBanks() {
    try {
      const raw = localStorage.getItem(FB_CACHE_KEY);
      if (!raw) return null;
      const { banks, ts } = JSON.parse(raw);
      if (Date.now() - ts > FB_CACHE_TTL) return null;
      return Array.isArray(banks) ? banks : null;
    } catch {}
    return null;
  }

  const addrQueue = [];
  let addrWorkerRunning = false;

  function enrichAddresses(businesses) {
    businesses.forEach(b => {
      if (b.type === 'business' && !b.address && b.lat != null
          && !addrQueue.find(q => q.id === b.id)) {
        addrQueue.push(b);
      }
    });
    if (!addrWorkerRunning) runAddrWorker();
  }

  async function runAddrWorker() {
    addrWorkerRunning = true;
    while (addrQueue.length) {
      const biz = addrQueue.shift();
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${biz.lat}&lon=${biz.lng}&format=json&zoom=18`
        );
        const data = await res.json();
        const a    = data.address || {};
        const street = [a.house_number, a.road].filter(Boolean).join(' ');
        const city   = a.city || a.town || a.suburb || a.village || '';
        const addr   = [street, city].filter(Boolean).join(', ')
          || data.display_name?.split(',').slice(0, 2).join(',').trim()
          || '';
        if (addr) {
          biz.address = addr;
          if (state.osmBusinesses[biz.id]) state.osmBusinesses[biz.id].address = addr;
        }
      } catch {}
      if (addrQueue.length) await new Promise(r => setTimeout(r, 1100));
    }
    addrWorkerRunning = false;
  }

  const BIZ_CACHE_KEY = 'replate_businesses_cache';
  const BIZ_CACHE_TTL = 6 * 60 * 60 * 1000; 

  function saveBusinessCache(businesses, tileKeys) {
    try {
      localStorage.setItem(BIZ_CACHE_KEY, JSON.stringify({
        businesses,
        tiles: Array.from(tileKeys),
        ts: Date.now(),
      }));
    } catch {}
  }

  function loadBusinessCache() {
    try {
      const raw = localStorage.getItem(BIZ_CACHE_KEY);
      if (!raw) return null;
      const { businesses, tiles, ts } = JSON.parse(raw);
      if (Date.now() - ts > BIZ_CACHE_TTL) return null;
      return { businesses: businesses || [], tiles: tiles || [] };
    } catch {}
    return null;
  }

  // init
  loadCachedReports();

  return {
    getState,
    setUserLocation,
    setFoodBanks,       getFoodBanks,
    mergeOsmBusinesses, getOsmBusinesses, clearOsmBusinesses,
    setSurplusReports,  getSurplusReports,
    setActiveFilter,    getActiveFilter,
    setPendingBusiness, popPendingBusiness,
    getVisibleLocations,
    distanceBetween,
    formatDistance,
    saveCachedFoodBanks, loadCachedFoodBanks,
    saveBusinessCache,   loadBusinessCache,
    enrichAddresses,
  };
})();
