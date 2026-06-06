const App = (() => {

  const LOCATION_PREF_KEY = 'replate_location_pref';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function init() {
    if (window.lucide) lucide.createIcons();
    Search.init();
    if (!checkStoredLocationPref()) {
      showLocationOverlay();
    }
  }

  // Stored pref cheack
  function checkStoredLocationPref() {
    try {
      const raw = localStorage.getItem(LOCATION_PREF_KEY);
      if (!raw) return false;
      const pref = JSON.parse(raw);

      if (pref.choice === 'skip') {
        launchApp(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, false);
        return true;
      }

      if (pref.choice === 'location' && pref.lat != null && pref.lng != null) {
        Store.setUserLocation(pref.lat, pref.lng);
        launchApp(pref.lat, pref.lng, true);
        refreshLocationSilently();
        return true;
      }
    } catch {}
    return false;
  }

  function refreshLocationSilently() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        saveLocationPref('location', lat, lng);
        Store.setUserLocation(lat, lng);
        MapManager.setUserLocation(lat, lng);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  // location overlay
  function showLocationOverlay() {
    const overlay = document.getElementById('location-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('active')));
  }

  document.getElementById('allow-location-btn')?.addEventListener('click', requestLocation);
  document.getElementById('skip-location-btn')?.addEventListener('click', () => {
    saveLocationPref('skip');
    launchApp(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, false);
  });

  function saveLocationPref(choice, lat, lng) {
    try {
      localStorage.setItem(LOCATION_PREF_KEY, JSON.stringify({ choice, lat, lng }));
    } catch {}
  }

  function requestLocation() {
    const btn = document.getElementById('allow-location-btn');
    btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px"></div> Getting location…';
    btn.disabled = true;
    setTimeout(() => {
      saveLocationPref('skip');
      launchApp(CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG, false);
    }, 3000);
  }

  // bank loading
  let banksOverlaySkipped = false;

  function showBanksOverlay() {
    banksOverlaySkipped = false;
    const el = document.getElementById('banks-loading-overlay');
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
  }

  function hideBanksOverlay() {
    const el = document.getElementById('banks-loading-overlay');
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => el.classList.add('hidden'), 400);
  }

  function setBanksOverlayText(title, desc) {
    if (banksOverlaySkipped) return;
    const t = document.getElementById('banks-loading-title');
    const d = document.getElementById('banks-loading-desc');
    if (t) t.textContent = title;
    if (d) d.textContent = desc;
  }

  document.getElementById('banks-loading-skip-btn')?.addEventListener('click', () => {
    banksOverlaySkipped = true;
    hideBanksOverlay();
  });


  async function fetchFoodBanksWithRetry() {
    let banks = await MapManager.fetchGtaFoodBanks();
    if (banks.length) return banks;

    setBanksOverlayText(
      "Taking a little longer than usual…",
      "The map data server seems busy — we're trying again. Hang tight."
    );
    await sleep(2500);

    banks = await MapManager.fetchGtaFoodBanks();
    if (banks.length) return banks;

    setBanksOverlayText(
      "Still working on it…",
      "One last attempt. You can skip below to continue without food bank data."
    );
    await sleep(3000);

    return MapManager.fetchGtaFoodBanks();
  }

  async function loadFoodBanks() {
    const cached = Store.loadCachedFoodBanks();
    if (cached && cached.length) {
      Store.setFoodBanks(cached);
      MapManager.renderAll();
      Sidebar.render(Store.getVisibleLocations());
      return;
    }

    showBanksOverlay();
    const banks = await fetchFoodBanksWithRetry();
    hideBanksOverlay();

    Store.setFoodBanks(banks);
    if (banks.length) {
      Store.saveCachedFoodBanks(banks);
      Toast.show(`Loaded ${banks.length} food banks across the GTA.`, 'success', 3500);
    } else {
      Toast.show('Could not load food banks — check your connection.', 'error');
    }

    MapManager.renderAll();
    Sidebar.render(Store.getVisibleLocations());
  }

  // launch
  function launchApp(lat, lng, hasLocation) {
    const overlay = document.getElementById('location-overlay');
    overlay.classList.remove('active');
    setTimeout(() => overlay.classList.add('hidden'), 400);
    document.getElementById('app').classList.remove('hidden');

    MapManager.init(lat, lng);
    if (hasLocation) MapManager.setUserLocation(lat, lng);

    FirebaseDB.subscribeReports(reports => {
      Store.setSurplusReports(reports);
      MapManager.renderAll();
      Sidebar.render(Store.getVisibleLocations());
    });

    MapManager.renderAll();
    Sidebar.render(Store.getVisibleLocations());

    if (window.lucide) lucide.createIcons();

    loadFoodBanks();
  }

  document.addEventListener('map:moved', () => {
    const zoom = MapManager.getZoom();
    if (zoom >= CONFIG.BUSINESS_ZOOM_THRESHOLD) {
      MapManager.fetchViewportBusinesses();
    }
    MapManager.renderAll();
    Sidebar.render(Store.getVisibleLocations());
  });

  document.addEventListener('filter:changed', () => {
    MapManager.renderAll();
    Sidebar.render(Store.getVisibleLocations());
  });

  document.addEventListener('data:updated', () => {
    MapManager.renderAll();
    Sidebar.render(Store.getVisibleLocations());
  });

  document.addEventListener('data:businesses-loaded', () => {
    Sidebar.render(Store.getVisibleLocations());
  });

  document.addEventListener('map:click', () => Sidebar.close());

  document.getElementById('locate-me-btn')?.addEventListener('click', () => {
    const st = Store.getState();
    if (st.userLocationAvailable) {
      MapManager.panTo(st.userLat, st.userLng, 15);
    } else {
      navigator.geolocation?.getCurrentPosition(pos => {
        Store.setUserLocation(pos.coords.latitude, pos.coords.longitude);
        MapManager.setUserLocation(pos.coords.latitude, pos.coords.longitude);
        MapManager.panTo(pos.coords.latitude, pos.coords.longitude, 15);
        Toast.show('Location updated!', 'success');
      }, () => Toast.show('Could not get location.', 'error'));
    }
  });

  document.getElementById('report-surplus-btn')?.addEventListener('click', () => {
    Modals.openReport();
  });

  function openDetail(id) {
    Modals.openDetail(id);
  }

  function openReportForBusiness(bizId) {
    const biz = Store.getOsmBusinesses().find(b => b.id === bizId);
    Modals.openReport(biz || null);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { openDetail, openReportForBusiness };
})();
