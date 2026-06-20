import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'

type Props = {
  lat: number
  lon: number
}

const SHADEMAP_KEY = process.env.EXPO_PUBLIC_SHADEMAP_KEY ?? ''

function buildHtml(lat: number, lon: number, apiKey: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#0d1117;overflow:hidden}
    #map{width:100%;height:calc(100% - 68px)}
    #controls{
      position:fixed;bottom:0;left:0;right:0;height:68px;
      background:rgba(13,17,23,0.96);
      padding:8px 16px 12px;
      display:flex;flex-direction:column;gap:6px;
    }
    #time-label{
      color:#e2e8f0;
      font:600 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;
      text-align:center;
      letter-spacing:0.3px;
    }
    #slider{
      width:100%;
      -webkit-appearance:none;
      height:4px;
      border-radius:2px;
      background:rgba(255,255,255,0.15);
      outline:none;
    }
    #slider::-webkit-slider-thumb{
      -webkit-appearance:none;
      width:18px;height:18px;
      border-radius:50%;
      background:#84cc16;
      cursor:pointer;
    }
    .leaflet-attribution-flag{display:none!important}
    .leaflet-control-attribution{
      font-size:9px!important;
      background:rgba(0,0,0,0.5)!important;
      color:rgba(255,255,255,0.4)!important;
    }
    .leaflet-control-attribution a{color:rgba(255,255,255,0.4)!important}
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="controls">
    <div id="time-label">Loading…</div>
    <input id="slider" type="range" min="0" max="1439" step="10"/>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-shadow-simulator/dist/leaflet-shadow-simulator.umd.min.js"></script>
  <script>
    var LAT=${lat.toFixed(6)}, LON=${lon.toFixed(6)}, KEY="${apiKey}";

    var map = L.map('map', {
      center: [LAT, LON],
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Dark basemap without labels so shade sits cleanly on terrain
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 18,
      attribution: '© <a href="https://openstreetmap.org">OSM</a> © <a href="https://carto.com">CARTO</a>',
    }).addTo(map);

    // Shade layer
    var shade = null;
    try {
      shade = L.shadeMap({ apiKey: KEY, date: new Date(), color: '#000000', opacity: 0.65 }).addTo(map);
    } catch(e) {
      console.error('ShadeMap init error:', e);
    }

    // Labels pane above shade
    map.createPane('labels');
    map.getPane('labels').style.zIndex = '450';
    map.getPane('labels').style.pointerEvents = 'none';
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 18,
      pane: 'labels',
      attribution: '',
    }).addTo(map);

    // Crag pin
    L.circleMarker([LAT, LON], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#ef4444',
      fillOpacity: 1,
    }).addTo(map);

    var slider = document.getElementById('slider');
    var label  = document.getElementById('time-label');

    function fmt(mins) {
      var h = Math.floor(mins / 60), m = mins % 60;
      var ampm = h < 12 ? 'AM' : 'PM';
      var h12 = h % 12 || 12;
      return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    function update(mins) {
      var d = new Date();
      d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      label.textContent = fmt(mins);
      if (shade) shade.setDate(d);
    }

    slider.addEventListener('input', function(e) { update(+e.target.value); });

    // Init to current time
    var now = new Date();
    var cur = now.getHours() * 60 + now.getMinutes();
    slider.value = cur;
    update(cur);
  </script>
</body>
</html>`
}

export function ShadeMapEmbed({ lat, lon }: Props) {
  return (
    <View style={styles.container}>
      <WebView
        source={{ html: buildHtml(lat, lon, SHADEMAP_KEY) }}
        style={styles.webview}
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        startInLoadingState={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { height: 340, marginTop: 16, marginHorizontal: 0 },
  webview: { flex: 1 },
})
