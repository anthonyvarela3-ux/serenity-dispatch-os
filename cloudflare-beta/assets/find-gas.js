(() => {
  const byId = id => document.getElementById(id);
  const dialog = byId('gasDialog');
  const status = byId('gasStatus');
  const results = byId('gasResults');
  const grade = byId('gasGrade');
  const refresh = byId('gasRefresh');
  const demo = document.body.hasAttribute('data-driver-demo');
  const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  let data;
  let lookup;

  function showPrices() {
    if (!data) return;
    const { stations, attributions = [] } = data;
    const reported = stations.map(station => station.prices[grade.value]?.amount).filter(Number.isFinite);
    byId('gasRange').textContent = reported.length
      ? `10-mile reported range: ${dollars.format(Math.min(...reported))} low · ${dollars.format(Math.max(...reported))} high per gallon (${reported.length} of ${stations.length} stations checked)`
      : 'No prices reported for this grade within the search results.';
    const list = byId('gasStations');
    list.replaceChildren();
    for (const station of stations.slice(0, 5)) {
      const row = document.createElement('li');
      row.style.marginBlockEnd = '0.75rem';
      const title = document.createElement('strong');
      title.textContent = `${station.name} · ${station.miles.toFixed(1)} mi`;
      const detail = document.createElement('div');
      const price = station.prices[grade.value];
      const when = price?.updatedAt ? new Date(price.updatedAt).toLocaleString() : 'report time unavailable';
      detail.textContent = price ? `${dollars.format(price.amount)}/gal · ${when}` : 'Price unavailable';
      const address = document.createElement('div');
      address.className = 'small muted';
      address.textContent = station.address || '';
      row.append(title, detail, address);
      if (station.directions) {
        const link = document.createElement('a');
        link.href = station.directions;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Directions';
        row.append(link);
      }
      list.append(row);
    }
    byId('gasSource').textContent = demo ? '' : ['Google Maps', ...attributions].join(' · ');
    results.hidden = false;
  }

  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location is unavailable on this device.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(({ coords }) => resolve({
        latitude: coords.latitude, longitude: coords.longitude,
      }), () => reject(new Error('Allow location in your browser and tap Refresh prices.')),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 });
    });
  }

  function sampleResults() {
    const updatedAt = new Date(Date.now() - 35 * 60000).toISOString();
    const prices = amounts => Object.fromEntries(['REGULAR_UNLEADED', 'MIDGRADE', 'PREMIUM', 'DIESEL']
      .map((key, i) => [key, amounts[i] ? { amount: amounts[i], updatedAt } : null]));
    return { stations: [
      { name: 'Sample Station A', miles: 0.7, prices: prices([3.19, 3.49, 3.79, 3.85]) },
      { name: 'Sample Station B', miles: 1.2, prices: prices([3.09, 3.39, 3.69]) },
      { name: 'Sample Station C', miles: 1.6, prices: prices([]) },
      { name: 'Sample Station D', miles: 2.3, prices: prices([3.29, 3.59, 3.89, 4.01]) },
      { name: 'Sample Station E', miles: 3.0, prices: prices([3.15, 3.45, 3.75, 3.89]) },
      { name: 'Sample Station F', miles: 5.4, prices: prices([2.99, 3.29, 3.59]) },
      { name: 'Sample Station G', miles: 7.8, prices: prices([3.39, 3.69, 3.99, 4.09]) },
    ] };
  }

  async function find() {
    if (lookup) return;
    data = undefined;
    results.hidden = true;
    byId('gasStations').replaceChildren();
    if (demo) {
      data = sampleResults();
      status.textContent = 'Demo only · fictional stations and prices';
      showPrices();
      return;
    }
    const request = new AbortController();
    lookup = request;
    refresh.disabled = true;
    status.textContent = 'Getting your location…';
    try {
      const location = await getLocation();
      if (request.signal.aborted) return;
      status.textContent = 'Checking nearby stations…';
      const response = await fetch('/api/fuel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(location), signal: request.signal,
      });
      const payload = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok) {
        if (payload.error === 'FUEL_PROVIDER_REJECTED') {
          const reason = payload.diagnostic?.reason;
          const explanations = {
            API_KEY_INVALID: 'Google did not accept the saved Places key. Check the value in the Cloudflare production secret.',
            API_KEY_EXPIRED: 'The saved Places key has expired.',
            API_KEY_NOT_FOUND: 'Google could not find the saved Places key.',
            SERVICE_DISABLED: 'Enable Places API (New) in the project that owns the saved key.',
            API_KEY_SERVICE_BLOCKED: 'Allow Places API (New) in the saved key’s API restrictions.',
            API_KEY_IP_ADDRESS_BLOCKED: 'The saved key’s IP restrictions blocked the Cloudflare Worker.',
            API_KEY_HTTP_REFERRER_BLOCKED: 'The saved key’s website restriction blocked the server request.',
            BILLING_DISABLED: 'Check billing for the Google Cloud project that owns the Places key.',
          };
          const detail = reason || payload.diagnostic?.status || 'HTTP ' + payload.upstreamStatus;
          throw new Error(`${explanations[reason] || 'Google Places returned an error.'} (${detail})`);
        }
        const messages = {
          FUEL_NOT_CONFIGURED: 'Live fuel prices are awaiting Google Places setup.',
          ROUTING_LOCKED: 'Connect Google Routing in Settings, then try Find Gas again.',
          FUEL_RATE_LIMIT: 'Wait a minute, then try again.',
          FUEL_DAILY_LIMIT: 'Today’s fuel-search limit has been reached.',
          FUEL_PROVIDER_UNAVAILABLE: 'Serenity could not complete the fuel lookup. Try again later.',
        };
        throw new Error(messages[payload.error] || 'Fuel prices are temporarily unavailable. Try again later.');
      }
      data = payload;
      status.textContent = data.stations.length
        ? `Checked ${new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Prices may change at the pump.`
        : 'No stations returned within 10 miles.';
      showPrices();
    } catch (error) {
      if (!request.signal.aborted) status.textContent = error instanceof TypeError
        ? 'Fuel prices are temporarily unavailable. Try again later.' : error.message;
    } finally {
      if (lookup === request) {
        lookup = undefined;
        refresh.disabled = false;
      }
    }
  }

  byId('findGas').addEventListener('click', () => {
    dialog.showModal();
    void find();
  });
  refresh.addEventListener('click', find);
  grade.addEventListener('change', showPrices);
  dialog.addEventListener('close', () => {
    lookup?.abort();
    lookup = undefined;
    refresh.disabled = false;
    data = undefined;
    results.hidden = true;
    byId('gasStations').replaceChildren();
  });
})();
