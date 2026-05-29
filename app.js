/* ════════════════════════════════════════════════════════
   Guarderías públicas EI 0-3 · España
   ════════════════════════════════════════════════════════ */

const GUARDERIAS_FILE = 'guarderias.pmtiles';          // source-layer: guarderias
const INE_FILE        = 'ine_guarderias.pmtiles';      // source-layer: ine
const ESPANA_FILE     = 'espana.geojson';

/* ── Mapa ── */
const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: [-3.7, 40.2],
  zoom: 5.5,
  minZoom: 3,
  maxBounds: [[-35, 20], [20, 56]],
  antialias: true,
});

const tooltip   = document.getElementById('tooltip');
const infoPanel = document.getElementById('info-panel');
let guarderiasPuntos = false;
let modo             = 'secciones';
let colorMode   = 'acceso';
let radioMetros = 500;

/* Convierte metros a píxeles en zoom 0 para lat media de España (~40°) */
function radioPx(metros) {
  const lat = 40 * Math.PI / 180;
  const r0  = metros * 256 / (2 * Math.PI * 6378137 * Math.cos(lat));
  return ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 22, r0 * Math.pow(2, 22)];
}

/* ── Expresiones de color para la capa INE ── */

/* Vista Acceso: distancia al centro más cercano */
const distanciaFillColor = [
  'case',
  ['==', ['get', 'PROVINCIA'], 'Murcia'],
  '#d8d8d8',
  ['==', ['get', 'dist_m'], null],
  '#d8d8d8',
  ['interpolate', ['linear'], ['get', 'dist_m'],
    0,    '#01f3b3',
    500,  '#7fd9c0',
    1500, '#fee08b',
    4000, '#f4774a',
    8000, '#d73027',
  ],
];

/* Vista Per cápita: ratio niños/guardería */
const ratioFillColor = [
  'case',
  ['==', ['get', 'PROVINCIA'], 'Murcia'],
  '#d8d8d8',
  ['==', ['get', 'PERSONAS'], 0],
  '#aaaaaa',
  ['==', ['get', 'N_GUARDERIAS'], 0],
  '#494949',
  ['interpolate', ['linear'], ['get', 'RATIO'],
    0,   '#01f3b3',
    25,  '#7fd9c0',
    60,  '#fee08b',
    120, '#f4774a',
    250, '#d73027',
  ],
];

/* Índice compuesto de equidad (0 = peor, 1 = mejor)
   score = 0.6 × score_acceso + 0.4 × score_renta
   score_acceso : clamp((8000 - dist_m) / 8000,           0, 1)
   score_renta  : clamp((RENTA_HOGAR  - 20000) / 50000,   0, 1)  */
const scoreAcceso  = ['max', 0, ['min', 1, ['/', ['-', 8000, ['get', 'dist_m']],      8000]]];
const scoreRenta   = ['max', 0, ['min', 1, ['/', ['-', ['get', 'RENTA_HOGAR'], 20000], 50000]]];
const scoreEquidad = ['+', ['*', 0.6, scoreAcceso], ['*', 0.4, scoreRenta]];

const equidadFillColor = [
  'case',
  ['==', ['get', 'PROVINCIA'], 'Murcia'],
  '#d8d8d8',
  ['any', ['==', ['get', 'RENTA_HOGAR'], null], ['==', ['get', 'dist_m'], null]],
  '#d0d0d0',
  ['interpolate', ['linear'], scoreEquidad,
    0.0, '#d73027',
    0.3, '#f4774a',
    0.6, '#fee08b',
    0.8, '#7fd9c0',
    1.0, '#01f3b3',
  ],
];

/* ── Contenido de la leyenda según vista ── */
const LEY = {
  acceso: `
    <div class="lp-titulo">Acceso</div>
    <div class="lp-desc">Distancia al centro más cercano</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-sq" style="background:#01f3b3"></span>Menos de 500 m</div>
      <div class="lp-step"><span class="lp-sq" style="background:#7fd9c0"></span>500 m – 1,5 km</div>
      <div class="lp-step"><span class="lp-sq" style="background:#fee08b"></span>1,5 – 4 km</div>
      <div class="lp-step"><span class="lp-sq" style="background:#f4774a"></span>4 – 8 km</div>
      <div class="lp-step"><span class="lp-sq" style="background:#d73027"></span>Más de 8 km</div>
    </div>
    <div class="lp-sep"></div>
    <div class="lp-step"><span class="lp-dot"></span>Centro público de Primer Ciclo de Infantil</div>`,

  percapita: `
    <div class="lp-titulo">Per cápita</div>
    <div class="lp-grupo-label">Con centros · niños por centro</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-sq" style="background:#01f3b3"></span>Menos de 25</div>
      <div class="lp-step"><span class="lp-sq" style="background:#7fd9c0"></span>25 – 60</div>
      <div class="lp-step"><span class="lp-sq" style="background:#fee08b"></span>60 – 120</div>
      <div class="lp-step"><span class="lp-sq" style="background:#f4774a"></span>120 – 250</div>
      <div class="lp-step"><span class="lp-sq" style="background:#d73027"></span>Más de 250 (saturada)</div>
    </div>
    <div class="lp-sep"></div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-sq" style="background:#494949"></span>Sin centro en la sección</div>
      <div class="lp-step"><span class="lp-sq" style="background:#aaaaaa"></span>Sin bebés 0-3</div>
    </div>
    <div class="lp-sep"></div>
    <div class="lp-step"><span class="lp-dot"></span>Centro público de Primer Ciclo de Infantil</div>`,

  equidad: `
    <div class="lp-titulo">Equidad</div>
    <div class="lp-desc">Accesibilidad (60 %) + renta del hogar (40 %)</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-sq" style="background:#d73027"></span>Lejos + renta baja</div>
      <div class="lp-step"><span class="lp-sq" style="background:#f4774a"></span>Lejos + renta media</div>
      <div class="lp-step"><span class="lp-sq" style="background:#fee08b"></span>Distancia o renta intermedias</div>
      <div class="lp-step"><span class="lp-sq" style="background:#7fd9c0"></span>Cerca + renta media</div>
      <div class="lp-step"><span class="lp-sq" style="background:#01f3b3"></span>Cerca + renta alta</div>
    </div>
    <div class="lp-sep"></div>
    <div class="lp-step"><span class="lp-dot"></span>Centro público de Primer Ciclo de Infantil</div>`,

  radio: `
    <div class="lp-titulo">Radio de cobertura</div>
    <div class="lp-steps">
      <div class="lp-step"><span class="lp-ring"></span>Área a la distancia elegida</div>
      <div class="lp-step"><span class="lp-dot"></span>Centro público de Primer Ciclo de Infantil</div>
    </div>`,
};

let popup = null;

/* ── Carga ── */
map.on('load', async () => { try {

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  const espana = await fetch(ESPANA_FILE).then(r => r.json()).catch(() => null);

  /* Mapa base */
  map.addSource('basemap', {
    type: 'raster',
    tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  });
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });

  /* Frontera España (opcional) */
  if (espana) {
    map.addSource('espana', { type: 'geojson', data: espana });
    map.addLayer({
      id: 'espana-border', type: 'line', source: 'espana',
      paint: { 'line-color': '#374151', 'line-width': 1.5, 'line-opacity': 0.5 },
    });
  }

  /* Secciones censales */
  map.addSource('ine', { type: 'vector', url: `pmtiles://${INE_FILE}` });

  map.addLayer({
    id: 'ine-fill',
    type: 'fill',
    source: 'ine',
    'source-layer': 'ine',
    paint: {
      'fill-color': distanciaFillColor,
      'fill-opacity': 0.72,
    },
  });

  map.addLayer({
    id: 'ine-line',
    type: 'line',
    source: 'ine',
    'source-layer': 'ine',
    paint: {
      'line-color': '#ffffff',
      'line-width': 0.3,
      'line-opacity': 0.35,
    },
  });

  /* Guarderías */
  map.addSource('guarderias', { type: 'vector', url: `pmtiles://${GUARDERIAS_FILE}` });

  /* Buffers de radio (modo radio) */
  map.addLayer({
    id: 'guarderias-buffer',
    type: 'circle',
    source: 'guarderias',
    'source-layer': 'guarderias',
    layout: { visibility: 'none' },
    paint: {
      'circle-radius':         radioPx(radioMetros),
      'circle-color':          '#01f3b3',
      'circle-opacity':        0.12,
      'circle-stroke-color':   '#017a5a',
      'circle-stroke-width':   1.5,
      'circle-stroke-opacity': 0.45,
    },
  });

  const OPACITY_AUTO = ['interpolate', ['linear'], ['zoom'], 10.9, 0, 11, 0.9];
  const OPACITY_ALL  = 0.9;
  const STROKE_AUTO  = ['interpolate', ['linear'], ['zoom'], 10.9, 0, 11, 0.7];
  const STROKE_ALL   = 0.7;

  /* Puntos individuales — visibles en zoom ≥ 11 por defecto; botón los muestra a cualquier zoom */
  map.addLayer({
    id: 'guarderias-circle',
    type: 'circle',
    source: 'guarderias',
    'source-layer': 'guarderias',
    paint: {
      'circle-radius':         ['interpolate', ['linear'], ['zoom'], 5, 2, 11, 4, 14, 7],
      'circle-color':          '#01f3b3',
      'circle-opacity':        OPACITY_AUTO,
      'circle-stroke-width':   1,
      'circle-stroke-color':   '#017a5a',
      'circle-stroke-opacity': STROKE_AUTO,
    },
  });

  /* Controles de navegación */
  map.addControl(new GeocoderControl(), 'top-right');
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  /* ── Render panel sección censal ── */
  function renderPanelSeccion(p) {
    const n     = p.N_GUARDERIAS ?? 0;
    const ratio = n > 0 ? parseFloat(p.RATIO).toFixed(0) : '—';
    const dist  = p.dist_m  != null ? `${Math.round(p.dist_m)} m` : '—';
    const renta = p.RENTA_HOGAR != null ? `€${Math.round(p.RENTA_HOGAR / 1000)}k` : null;

    infoPanel.innerHTML = `
      <div class="ip-bar"></div>
      <div class="ip-body">
        <div class="ip-header">
          <span class="ip-seccion">Secc. ${p.SECCION}</span>
        </div>
        <div class="ip-name">${p.MUNICIPIO || '—'}</div>
        <div class="ip-sub">${p.PROVINCIA || ''}</div>
        <div class="ip-sep"></div>
        <div class="ip-stats">
          <div class="ip-stat">
            <span class="ip-stat-val">${p.PERSONAS ?? '—'}</span>
            <span class="ip-stat-key">Niños 0-3</span>
          </div>
          <div class="ip-stat">
            <span class="ip-stat-val">${n}</span>
            <span class="ip-stat-key">Centros</span>
          </div>
          <div class="ip-stat">
            <span class="ip-stat-val">${ratio}</span>
            <span class="ip-stat-key">Niños/centro</span>
          </div>
          <div class="ip-stat">
            <span class="ip-stat-val">${dist}</span>
            <span class="ip-stat-key">Dist. más cercana</span>
          </div>
          ${renta ? `<div class="ip-stat">
            <span class="ip-stat-val">${renta}</span>
            <span class="ip-stat-key">Renta bruta/hogar</span>
          </div>` : ''}
        </div>
      </div>`;
  }

  /* ── Render panel guardería ── */
  function renderPanelGuarderia(p) {
    const ccaa     = p.CCAA          || '';
    const nombre   = p.NOMBRE        || '—';
    const domicilio = p.DOMICILIO    || '';
    const localidad = p.LOCALIDAD    || '';
    const provincia = p.PROVINCIA    || '';
    const cp        = p['CÓD POSTAL'] || '';
    const dirLine   = [domicilio, cp].filter(Boolean).join(', ');
    const locLine   = [localidad, provincia].filter(Boolean).join(', ');

    infoPanel.innerHTML = `
      <div class="ip-bar"></div>
      <div class="ip-body">
        <div class="ip-header">
          <span class="ip-tag">Centro público de Primer Ciclo de Infantil</span>
        </div>
        <div class="ip-name">${nombre}</div>
        ${dirLine || locLine ? `
          <div class="ip-sep"></div>
          <div class="ip-addr">
            ${dirLine ? `<span class="ip-addr-line ip-addr-line--street">${dirLine}</span>` : ''}
            ${locLine ? `<span class="ip-addr-line">${locLine}</span>` : ''}
          </div>` : ''}
        <p class="ip-hint">Clic para más detalles</p>
      </div>`;
  }

  /* ── Panel sección censal (hover) ── */
  map.on('mousemove', 'ine-fill', e => {
    const sobreGuarderia = map.queryRenderedFeatures(e.point, { layers: ['guarderias-circle'] }).length > 0;
    if (sobreGuarderia) return;
    const p = e.features?.[0]?.properties;
    if (!p) return;
    renderPanelSeccion(p);
    infoPanel.classList.remove('ip-hidden');
  });
  map.on('mouseleave', 'ine-fill', () => {
    infoPanel.classList.add('ip-hidden');
  });

  /* ── Panel guardería (hover) ── */
  map.on('mousemove', 'guarderias-circle', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features?.[0]?.properties;
    if (!p) return;
    renderPanelGuarderia(p);
    infoPanel.classList.remove('ip-hidden');
  });
  map.on('mouseleave', 'guarderias-circle', () => {
    map.getCanvas().style.cursor = '';
    // el panel de sección tomará el relevo si sigue sobre el mapa
  });

  /* ── Popup al hacer click ── */
  map.on('click', 'guarderias-circle', e => {
    const p = e.features?.[0]?.properties;
    if (!p) return;

    const nombre    = p.NOMBRE        || '—';
    const domicilio = p.DOMICILIO     || '';
    const localidad = p.LOCALIDAD     || '';
    const provincia = p.PROVINCIA     || '';
    const ccaa      = p.CCAA          || '';
    const cp        = p['CÓD POSTAL'] || '';

    const dirLine = [domicilio, cp].filter(Boolean).join(', ');
    const locLine = [localidad, provincia].filter(Boolean).join(', ');

    const query     = [nombre, dirLine, locLine, 'España'].filter(Boolean).join(', ');
    const mapsUrl   = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

    const html = `
      <div>
        <div class="pp-bar"></div>
        <div class="pp-inner">
          <p class="pp-nombre">${nombre}</p>
          ${dirLine || locLine ? `
            <div class="pp-sep"></div>
            <div class="pp-addr">
              ${dirLine ? `<span class="pp-addr-line pp-addr-line--street">${dirLine}</span>` : ''}
              ${locLine ? `<span class="pp-addr-line">${locLine}</span>` : ''}
            </div>` : ''}
        </div>
      </div>`;

    if (!popup) popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 14, maxWidth: '262px' });
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });

  map.on('click', e => {
    const bbox = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
    const feats = map.queryRenderedFeatures(bbox, { layers: ['guarderias-circle'] });
    if (!feats.length && popup?.isOpen()) popup.remove();
  });

  /* ── Leyenda flotante ── */
  const leyendaPanel = document.getElementById('leyenda-panel');
  function renderLeyenda() {
    const key = modo === 'radio' ? 'radio' : colorMode;
    leyendaPanel.innerHTML = LEY[key];
  }

  const equidadInfoEl = document.getElementById('equidad-info');

  /* ── Cambio de modo (Secciones / Radio) ── */
  function setModo(m) {
    modo = m;
    const esSecciones = m === 'secciones';
    map.setLayoutProperty('ine-fill',          'visibility', esSecciones ? 'visible' : 'none');
    map.setLayoutProperty('ine-line',          'visibility', esSecciones ? 'visible' : 'none');
    map.setLayoutProperty('guarderias-buffer', 'visibility', esSecciones ? 'none' : 'visible');
    document.getElementById('btn-secciones').classList.toggle('active',  esSecciones);
    document.getElementById('btn-radio').classList.toggle('active',     !esSecciones);
    document.getElementById('radio-panel').classList.toggle('hidden',    esSecciones);
    document.getElementById('color-toggle').classList.toggle('hidden',  !esSecciones);
    equidadInfoEl.classList.toggle('hidden', !esSecciones || colorMode !== 'equidad');
    renderLeyenda();
  }

  document.getElementById('btn-secciones').addEventListener('click', () => setModo('secciones'));
  document.getElementById('btn-radio').addEventListener('click',     () => setModo('radio'));

  /* ── Cambio de color (Acceso / Per cápita / Equidad) ── */
  const fillByMode = { acceso: distanciaFillColor, percapita: ratioFillColor, equidad: equidadFillColor };

  function setColor(c) {
    colorMode = c;
    map.setPaintProperty('ine-fill', 'fill-color', fillByMode[c]);
    ['acceso', 'percapita', 'equidad'].forEach(id =>
      document.getElementById(`btn-${id}`).classList.toggle('active', c === id)
    );
    equidadInfoEl.classList.toggle('hidden', c !== 'equidad');
    renderLeyenda();
  }

  document.getElementById('btn-acceso').addEventListener('click',    () => setColor('acceso'));
  document.getElementById('btn-percapita').addEventListener('click', () => setColor('percapita'));
  document.getElementById('btn-equidad').addEventListener('click',   () => setColor('equidad'));

  setModo(modo);
  setColor(colorMode);

  /* ── Selector de radio ── */
  document.querySelectorAll('.radio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      radioMetros = parseInt(btn.dataset.r, 10);
      map.setPaintProperty('guarderias-buffer', 'circle-radius', radioPx(radioMetros));
    });
  });

  /* ── Reset ── */
  document.getElementById('reset-btn').addEventListener('click', () =>
    map.flyTo({ center: [-3.7, 40.2], zoom: 5.5, duration: 1200 })
  );

  /* ── Toggle puntos de guarderías ── */
  const guarderiasBtnEl = document.getElementById('guarderias-btn');
  guarderiasBtnEl.addEventListener('click', () => {
    guarderiasPuntos = !guarderiasPuntos;
    map.setPaintProperty('guarderias-circle', 'circle-opacity',        guarderiasPuntos ? OPACITY_ALL : OPACITY_AUTO);
    map.setPaintProperty('guarderias-circle', 'circle-stroke-opacity', guarderiasPuntos ? STROKE_ALL  : STROKE_AUTO);
    guarderiasBtnEl.classList.toggle('active', guarderiasPuntos);
  });

} catch (err) {
  console.error('Error inicializando el mapa:', err);
}});

/* ══════════════════════════════════════════
   Geocoder (Nominatim)
   ══════════════════════════════════════════ */
class GeocoderControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl geocoder-ctrl';
    this._input = document.createElement('input');
    this._input.type = 'text';
    this._input.placeholder = 'Buscar lugar…';
    this._input.className = 'geocoder-input';
    this._input.setAttribute('autocomplete', 'off');
    this._list = document.createElement('div');
    this._list.className = 'geocoder-results';
    this._list.hidden = true;
    this._container.appendChild(this._input);
    this._container.appendChild(this._list);

    let timer;
    this._input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = this._input.value.trim();
      if (q.length < 3) { this._list.innerHTML = ''; this._list.hidden = true; return; }
      timer = setTimeout(() => this._search(q), 350);
    });
    this._input.addEventListener('keydown', e => { if (e.key === 'Escape') this._list.hidden = true; });
    document.addEventListener('click', e => { if (!this._container.contains(e.target)) this._list.hidden = true; });
    return this._container;
  }

  async _search(q) {
    try {
      const data = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=es&countrycodes=es`
      ).then(r => r.json());
      this._render(data);
    } catch { /* sin red */ }
  }

  _render(items) {
    this._list.innerHTML = '';
    if (!items.length) {
      const el = document.createElement('div');
      el.className = 'geocoder-item geocoder-empty';
      el.textContent = 'Sin resultados';
      this._list.appendChild(el);
    } else {
      items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'geocoder-item';
        el.textContent = item.display_name;
        el.addEventListener('click', () => {
          this._input.value = item.display_name;
          this._list.hidden = true;
          const bb = item.boundingbox;
          if (bb) {
            this._map.fitBounds(
              [[parseFloat(bb[2]), parseFloat(bb[0])], [parseFloat(bb[3]), parseFloat(bb[1])]],
              { padding: 60, maxZoom: 14 }
            );
          } else {
            this._map.flyTo({ center: [parseFloat(item.lon), parseFloat(item.lat)], zoom: 13 });
          }
        });
        this._list.appendChild(el);
      });
    }
    this._list.hidden = false;
  }

  onRemove() { this._container.parentNode?.removeChild(this._container); }
}
