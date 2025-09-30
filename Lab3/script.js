(() => {
  const form = document.getElementById('search-form');
  const queryField = document.getElementById('query');
  const radiusField = document.getElementById('radius');
  const statusEl = document.getElementById('status');
  const placesList = document.getElementById('places-list');

  const map = L.map('map', { scrollWheelZoom: true });
  map.setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);
  const submitButton = form.querySelector('button[type="submit"]');

  const status = (message, tone = 'info') => {
    statusEl.textContent = message;
    statusEl.dataset.tone = tone;
  };

  const geocode = async (searchQuery) => {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({
      format: 'json',
      q: searchQuery,
      limit: '1',
      addressdetails: '1',
      extratags: '1'
    }).toString();

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  };

  const fetchPlaces = async (lat, lon, radius) => {
    const around = `around:${radius},${lat},${lon}`;

    const queryParts = [
      `node(${around})["tourism"~"^(attraction|museum|art_gallery|zoo|theme_park)$"];`,
      `node(${around})["amenity"~"^(theatre|arts_centre)$"];`,
      `way(${around})["tourism"~"^(attraction|museum|art_gallery|zoo|theme_park)$"];`,
      `way(${around})["amenity"~"^(theatre|arts_centre)$"];`,
      `relation(${around})["tourism"~"^(attraction|museum|art_gallery|zoo|theme_park)$"];`,
      `relation(${around})["amenity"~"^(theatre|arts_centre)$"];`
    ];

    const overpassQuery = `[out:json][timeout:25];(${queryParts.join('')});out center 40;`;
    const endpoint = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Overpass request failed with status ${response.status}`);
    }

    const data = await response.json();
    const seen = new Set();

    return data.elements
      .map((element) => {
        const { tags = {} } = element;
        const latLng = element.type === 'node'
          ? { lat: element.lat, lon: element.lon }
          : element.center;

        if (!latLng) {
          return null;
        }

        const name = tags.name || 'Без названия';
        const category = inferCategory(tags);
        const address = buildAddress(tags);

        const key = `${name}:${latLng.lat}:${latLng.lon}`;
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);

        return {
          id: element.id,
          type: element.type,
          lat: latLng.lat,
          lon: latLng.lon,
          name,
          category,
          address,
          tags
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  };

  const inferCategory = (tags) => {
    if (tags.tourism) {
      switch (tags.tourism) {
        case 'museum':
          return 'Музей';
        case 'art_gallery':
          return 'Художественная галерея';
        case 'attraction':
          return 'Достопримечательность';
        case 'zoo':
          return 'Зоопарк';
        case 'theme_park':
          return 'Парк развлечений';
        default:
          return `Tourism: ${tags.tourism}`;
      }
    }

    if (tags.amenity) {
      switch (tags.amenity) {
        case 'theatre':
          return 'Театр';
        case 'arts_centre':
          return 'Центр искусств';
        default:
          return `Amenity: ${tags.amenity}`;
      }
    }

    return 'Объект';
  };

  const buildAddress = (tags) => {
    const parts = [
      tags['addr:street']
        ? `${tags['addr:street']}${tags['addr:housenumber'] ? ', ' + tags['addr:housenumber'] : ''}`
        : '',
      tags['addr:city'],
      tags['addr:state'],
      tags['addr:country']
    ].filter(Boolean);

    return parts.join(', ');
  };

  const renderPlaces = (places) => {
    placesList.innerHTML = '';

    if (!places.length) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = 'Объекты не найдены в указанном радиусе.';
      placesList.append(emptyItem);
      return;
    }

    places.forEach((place) => {
      const item = document.createElement('li');
      item.className = 'place-item';

      const title = document.createElement('h3');
      title.className = 'place-item__name';
      title.textContent = place.name;

      const meta = document.createElement('div');
      meta.className = 'place-item__meta';
      meta.textContent = `${place.category} · ${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;

      item.append(title, meta);

      const extra = [place.address, place.tags.wikipedia, place.tags.wikidata]
        .filter(Boolean)
        .join(' · ');

      if (extra) {
        const tagsLine = document.createElement('div');
        tagsLine.className = 'place-item__tags';
        tagsLine.textContent = extra;
        item.append(tagsLine);
      }

      placesList.append(item);
    });
  };

  const updateMarkers = (coords, places) => {
    markersLayer.clearLayers();

    L.circleMarker(coords, {
      radius: 8,
      color: '#2563eb',
      fillColor: '#2563eb',
      fillOpacity: 0.6
    }).addTo(markersLayer).bindPopup('Искомое местоположение');

    places.forEach((place) => {
      const marker = L.marker([place.lat, place.lon]);
      marker.bindPopup(`
        <strong>${place.name}</strong><br />
        ${place.category}${place.address ? `<br />${place.address}` : ''}
      `);
      marker.addTo(markersLayer);
    });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const searchQuery = queryField.value.trim();
    const radius = Number(radiusField.value) || 2000;

    if (!searchQuery) {
      status('Введите адрес или город.', 'error');
      return;
    }

    submitButton.disabled = true;
    status('Ищем координаты...', 'info');

    try {
      const geocodeResult = await geocode(searchQuery);

      if (!geocodeResult) {
        status('Не удалось найти указанный адрес. Попробуйте уточнить запрос.', 'error');
        return;
      }

      const center = {
        lat: Number(geocodeResult.lat),
        lon: Number(geocodeResult.lon)
      };

      map.setView([center.lat, center.lon], 14);

      status('Ищем достопримечательности поблизости...', 'info');

      const places = await fetchPlaces(center.lat, center.lon, radius);

      renderPlaces(places);
      updateMarkers([center.lat, center.lon], places);

      if (places.length) {
        status(`Найдено объектов: ${places.length}.`, 'success');
      } else {
        status('В указанном радиусе ничего не найдено. Попробуйте увеличить радиус или выбрать другой адрес.', 'warning');
      }
    } catch (error) {
      console.error(error);
      status('Произошла ошибка при загрузке данных. Попробуйте позже.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });

  status('Введите адрес и нажмите «Найти достопримечательности».');
})();
