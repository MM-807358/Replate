const Sidebar = (() => {

  const sidebar  = document.getElementById('sidebar');
  const titleEl  = document.getElementById('sidebar-title');
  const bodyEl   = document.getElementById('sidebar-body');
  const closeBtn = document.getElementById('sidebar-close');
  const handle   = document.getElementById('sidebar-handle');

  let isOpen = false;

  function open() {
    sidebar.classList.add('open');
    sidebar.classList.remove('collapsed');
    isOpen = true;
  }

  function close() {
    sidebar.classList.remove('open');
    isOpen = false;
  }

  function toggle() { isOpen ? close() : open(); }
  function setTitle(t) { if (titleEl) titleEl.textContent = t; }

  function render(locations) {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    const filter = Store.getActiveFilter();
    const labelMap = { all: 'Nearby', foodbank: 'Food Banks', surplus: 'Surplus Food', business: 'Businesses' };
    const count = locations.length;
    setTitle(`${labelMap[filter] || 'Nearby'} ${count ? `(${count})` : ''}`);

    if (!count) {
      const zoom = MapManager.getZoom();
      const hint = (filter === 'business' || filter === 'all') && zoom < CONFIG.BUSINESS_ZOOM_THRESHOLD
        ? 'Zoom in to see local businesses, or switch to the Food Banks filter.'
        : 'Nothing found for this filter in the current area.';
      bodyEl.innerHTML = `
        <div class="sidebar-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          <p>${hint}</p>
        </div>`;
      return;
    }

    const { userLat, userLng, userLocationAvailable } = Store.getState();

    // max item displayed
    const shown = locations.slice(0, 60);
    shown.forEach(loc => bodyEl.appendChild(buildCard(loc, userLat, userLng, userLocationAvailable)));
  }

  function buildCard(loc, userLat, userLng, hasLoc) {
    const card = document.createElement('div');
    card.className = 'location-card';
    card.dataset.id = loc.id;

    const typeLabels = { foodbank: 'Food Bank', surplus: 'Surplus Food', business: 'Business' };
    const typeLabel  = typeLabels[loc.type] || loc.type;

    const distStr = hasLoc && loc._distance != null && isFinite(loc._distance)
      ? Store.formatDistance(loc._distance) : '';

    const iconPaths = {
      foodbank: `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,
      surplus:  `<path d="M20.91 8.84 8.56 2.23a1.93 1.93 0 0 0-1.81 0L3.1 4.13a2.12 2.12 0 0 0-.05 3.69l12.22 6.93a2 2 0 0 0 1.94 0L21 12.51a2.12 2.12 0 0 0-.09-3.67Z"/><path d="M12 12v9"/>`,
      business: `<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>`,
    };

    let metaHTML = '';
    if (loc.type === 'surplus') {
      const hoursLeft = Math.round((new Date(loc.expiresAt) - Date.now()) / 3600000);
      const urgency = hoursLeft < 2 ? 'expiry-urgent' : hoursLeft < 6 ? 'expiry-soon' : '';
      metaHTML = `<div class="card-meta">
        <span class="card-tag">${loc.foodType || 'Food'}</span>
        <span class="card-tag">${loc.quantity || ''}</span>
        ${urgency ? `<span class="card-tag ${urgency}">⏱ ${hoursLeft}h left</span>` : ''}
      </div>`;
    } else if (loc.type === 'foodbank' && loc.hours) {
      metaHTML = `<div class="card-meta"><span class="card-tag">${loc.hours}</span></div>`;
    } else if (loc.type === 'business' && loc.osmCategory) {
      metaHTML = `<div class="card-meta"><span class="card-tag">${loc.osmCategory}</span></div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="card-icon ${loc.type}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${iconPaths[loc.type] || iconPaths.business}
          </svg>
        </div>
        <div class="card-title-area">
          <div class="card-name">${loc.name}</div>
          <div class="card-type ${loc.type}">${typeLabel}</div>
        </div>
        ${distStr ? `<span class="card-dist">${distStr}</span>` : ''}
      </div>
      ${metaHTML}`;

    card.addEventListener('click', () => {
      App.openDetail(loc.id);
      if (loc.lat && loc.lng) MapManager.panTo(loc.lat, loc.lng, 16);
    });

    return card;
  }

  closeBtn?.addEventListener('click', close);
  handle?.addEventListener('click', toggle);
  document.addEventListener('map:click', close);

  document.addEventListener('data:updated', () => {
    if (!isOpen && Store.getVisibleLocations().length > 0) open();
  });

  return { open, close, toggle, render, setTitle };
})();
