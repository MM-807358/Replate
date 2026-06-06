const Modals = (() => {

  // open close
  function open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    el.addEventListener('click', _backdropClick);
  }

  function close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    document.body.style.overflow = '';
    el.removeEventListener('click', _backdropClick);
  }

  function _backdropClick(e) {
    if (e.target === e.currentTarget) close(e.currentTarget.id);
  }

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.modal) close(btn.dataset.modal);
    });
  });

  // select business
  let selectedBusiness = null;

  function resetBusinessPicker() {
    selectedBusiness = null;
    document.getElementById('report-business-id').value = '';
    document.getElementById('business-name').value      = '';
    document.getElementById('report-lat').value         = '';
    document.getElementById('report-lng').value         = '';
    document.getElementById('report-address').value     = '';
    document.getElementById('business-picker-label').textContent = 'Select a business from the map or search below';
    document.getElementById('business-search').value = '';
    document.getElementById('business-picker-clear').classList.add('hidden');
    document.getElementById('business-search-results').classList.add('hidden');
    document.getElementById('business-search-results').innerHTML = '';
  }

  function applyBusinessPicker(biz) {
    selectedBusiness = biz;
    document.getElementById('report-business-id').value = biz.id;
    document.getElementById('business-name').value      = biz.name;
    document.getElementById('report-lat').value         = biz.lat;
    document.getElementById('report-lng').value         = biz.lng;
    document.getElementById('report-address').value     = biz.address || '';
    document.getElementById('business-picker-label').textContent = biz.name;
    document.getElementById('business-picker-clear').classList.remove('hidden');
    document.getElementById('business-search').value = '';
    document.getElementById('business-search-results').classList.add('hidden');
    document.getElementById('business-search-results').innerHTML = '';
  }

  // clear
  document.getElementById('business-picker-clear')?.addEventListener('click', e => {
    e.stopPropagation();
    resetBusinessPicker();
  });

  // search
  const searchInput   = document.getElementById('business-search');
  const searchResults = document.getElementById('business-search-results');

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) {
      searchResults.classList.add('hidden');
      searchResults.innerHTML = '';
      return;
    }

    const businesses = Store.getOsmBusinesses();
    const matches = businesses
      .filter(b => b.name.toLowerCase().includes(q))
      .slice(0, 8);

    if (!matches.length) {
      searchResults.innerHTML = '<div class="search-empty">No visible businesses match. Zoom into the map first to load businesses.</div>';
      searchResults.classList.remove('hidden');
      return;
    }

    searchResults.innerHTML = matches.map(b => `
      <div class="search-result-item" data-id="${b.id}">
        <div class="sri-name">${b.name}</div>
        <div class="sri-meta">${b.osmCategory || ''}${b.address ? ' · ' + b.address : ''}</div>
      </div>`).join('');
    searchResults.classList.remove('hidden');

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const biz = businesses.find(b => b.id === item.dataset.id);
        if (biz) applyBusinessPicker(biz);
      });
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#business-picker')) {
      searchResults?.classList.add('hidden');
    }
  });

  document.addEventListener('business:selected', e => {
    const biz = e.detail;
    // If report modal is open, fill it; otherwise just store for next open
    const modal = document.getElementById('report-modal');
    if (!modal.classList.contains('hidden')) {
      applyBusinessPicker(biz);
      Toast.show(`Selected: ${biz.name}`, 'success', 2500);
    }
  });

  function openReport(prefillBiz) {
    document.getElementById('report-form').reset();
    resetBusinessPicker();

    const def = new Date();
    def.setHours(20, 0, 0, 0);
    if (def < new Date()) def.setDate(def.getDate() + 1);
    document.getElementById('expiry').value = def.toISOString().slice(0, 16);

    const pending = prefillBiz || Store.popPendingBusiness();
    if (pending) {
      setTimeout(() => {
        applyBusinessPicker(pending);
        if (window.lucide) lucide.createIcons();
      }, 50);
    }

    open('report-modal');
    if (window.lucide) lucide.createIcons();
  }

  // report form
  document.getElementById('report-form')?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!selectedBusiness) {
      Toast.show('Please select a business first.', 'error');
      return;
    }

    const btn = document.getElementById('submit-report-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-inline"></span> Submitting…';

    const report = {
      businessId:   selectedBusiness.id,
      name:         selectedBusiness.name,
      businessName: selectedBusiness.name,
      address:      selectedBusiness.address || document.getElementById('report-address').value,
      lat:          selectedBusiness.lat,
      lng:          selectedBusiness.lng,
      foodType:     document.getElementById('food-type').value,
      quantity:     document.getElementById('quantity').value,
      description:  document.getElementById('food-desc').value.trim(),
      contact:      document.getElementById('contact').value.trim(),
      expiresAt:    new Date(document.getElementById('expiry').value).toISOString(),
      reportedAt:   new Date().toISOString(),
    };

    close('report-modal');
    MapManager.panTo(report.lat, report.lng, 16);
    btn.disabled = false;
    btn.textContent = 'Submit Report';

    try {
      if (FirebaseDB.isReady) {
        await FirebaseDB.addReport(report);
        Toast.show(`✓ Surplus reported for ${report.name}!`, 'success');
      } else {
        const localReport = { id: 'local_' + Date.now(), type: 'surplus', ...report };
        Store.setSurplusReports([...Store.getSurplusReports(), localReport]);
        document.dispatchEvent(new CustomEvent('data:updated'));
        Toast.show(`Saved locally (Firebase offline) for ${report.name}.`, 'info');
      }
    } catch (err) {
      console.error('[Replate] Submit failed:', err);
      Toast.show('Failed to submit report. Please try again.', 'error');
    }
  });

  function openDetail(id) {
    const allItems = [
      ...Store.getFoodBanks(),
      ...Store.getSurplusReports(),
      ...Store.getOsmBusinesses(),
    ];
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    document.getElementById('detail-title').textContent = item.name;
    document.getElementById('detail-body').innerHTML = buildDetailHTML(item);
    open('detail-modal');
    if (window.lucide) lucide.createIcons();
  }

  function buildDetailHTML(item) {
    const typeLabels = { foodbank: 'Food Bank', surplus: 'Surplus Food', business: 'Business' };
    const typeIcons  = { foodbank: 'heart-handshake', surplus: 'package-open', business: 'store' };
    const label = typeLabels[item.type] || item.type;
    const icon  = typeIcons[item.type]  || 'map-pin';

    let rows = '';

    if (item.type === 'surplus') {
      const expiresAt  = new Date(item.expiresAt);
      const hoursLeft  = Math.round((expiresAt - Date.now()) / 3600000);
      const urgency    = hoursLeft < 2 ? 'expiry-urgent' : hoursLeft < 6 ? 'expiry-soon' : '';
      rows += `
        <div class="detail-row"><i data-lucide="package-open"></i><span><strong>Food Type:</strong> ${item.foodType}</span></div>
        <div class="detail-row"><i data-lucide="boxes"></i><span><strong>Quantity:</strong> ${item.quantity}</span></div>
        ${item.description ? `<div class="detail-row"><i data-lucide="info"></i><span>${item.description}</span></div>` : ''}
        <div class="detail-row"><i data-lucide="clock"></i><span class="${urgency}"><strong>Available Until:</strong> ${expiresAt.toLocaleString()}</span></div>
        <div class="detail-row"><i data-lucide="phone"></i><span><strong>Pickup:</strong> ${item.contact}</span></div>`;
    }

    if (item.type === 'foodbank') {
      if (item.hours)   rows += `<div class="detail-row"><i data-lucide="clock"></i><span><strong>Hours:</strong> ${item.hours}</span></div>`;
      if (item.phone)   rows += `<div class="detail-row"><i data-lucide="phone"></i><span><strong>Phone:</strong> ${item.phone}</span></div>`;
      if (item.description) rows += `<div class="detail-row"><i data-lucide="info"></i><span>${item.description}</span></div>`;
      if (item.website) rows += `<div class="detail-row"><i data-lucide="globe"></i><span><a href="${item.website}" target="_blank" style="color:var(--clr-green)">${item.website.replace('https://','')}</a></span></div>`;
    }

    if (item.type === 'business') {
      if (item.osmCategory) rows += `<div class="detail-row"><i data-lucide="tag"></i><span><strong>Category:</strong> ${item.osmCategory}</span></div>`;
      if (item.hours)   rows += `<div class="detail-row"><i data-lucide="clock"></i><span><strong>Hours:</strong> ${item.hours}</span></div>`;
      if (item.phone)   rows += `<div class="detail-row"><i data-lucide="phone"></i><span>${item.phone}</span></div>`;
      if (item.website) rows += `<div class="detail-row"><i data-lucide="globe"></i><span><a href="${item.website}" target="_blank" style="color:var(--clr-blue)">${item.website.replace('https://','')}</a></span></div>`;
    }

    const addressLine = item.address
      ? `<div class="detail-address"><i data-lucide="map-pin"></i>${item.address}</div>` : '';

    const mapsUrl = `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lng}&zoom=17`;
    const dirUrl  = `https://www.openstreetmap.org/directions?from=&to=${item.lat},${item.lng}`;

    const reportBtn = item.type === 'business'
      ? `<button class="btn btn-accent" onclick="Modals.close('detail-modal'); App.openReportForBusiness('${item.id}')">
           <i data-lucide="plus-circle"></i> Report Surplus Here
         </button>` : '';

    return `
      <div class="detail-badge ${item.type}"><i data-lucide="${icon}"></i> ${label}</div>
      <div class="detail-name">${item.name}</div>
      ${addressLine}
      <div class="detail-divider"></div>
      ${rows}
      <div class="detail-actions">
        <a href="${mapsUrl}" target="_blank" class="btn btn-ghost"><i data-lucide="map"></i> Map</a>
        <a href="${dirUrl}"  target="_blank" class="btn btn-ghost"><i data-lucide="navigation"></i> Directions</a>
        ${reportBtn}
      </div>`;
  }

  return { open, close, openReport, openDetail, applyBusinessPicker };
})();
