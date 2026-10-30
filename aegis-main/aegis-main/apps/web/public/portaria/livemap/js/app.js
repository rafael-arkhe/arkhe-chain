// Onda 3 Safe Tag — o livemap troca o backend Firebase por AEGIS (push via SSE).
// A SPA (Google Maps + marcadores de iniciais + fora-de-rota) é mantida (D8).
import { AegisLive } from './aegis-live.js?v=f31f736ae7';

const config = {
  map: {
    defaultCenter: { lat: -23.591611, lng: -46.689133 }, // JK SP default
    defaultZoom: 17,
    disablePOI: true,
    mapType: 'satellite'
  },
  redirectUrl: "https://app.safetag.lat/signIn",
  markers: {
    // Colors for marker backgrounds
    colors: ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC', '#00ACC1', '#FF7043', '#9E9E9E'],
    size: 30, // Size of marker in pixels
    font: '12px Inter, sans-serif', // Font for initials
    fontColor: '#FFFFFF', // Text color for initials
    defaultColor: '#4285F4', // Default color for markers
    offRouteBorderColor: '#FF0000', // Border color for off-route markers
    defaultBorderColor: '#FFFFFF', // Border color for default markers
    textColor: '#FFFFFF', // Text color for markers
    routePointSize: 20, // Size of route point markers
    routePointColor: '#FF5722', // Color of route point markers
    routePointBorderColor: '#FFFFFF' // Border color for route point markers
  }
};

let map;
let markers = [];
// Onda 3 — auto-enquadramento AO VIVO: segue os marcadores dos visitantes até o
// operador arrastar o mapa. Sem isto o mapa fica no default (JK/SP) e o
// visitante — que está no condomínio (ex.: Itapetininga) — cai FORA da tela.
let autoFrame = true;
// Cerca do CONDOMÍNIO (operador): pontos LatLng passados no ?fence= do embed do
// AEGIS. Desenhada no mapa + entra no enquadramento (o widget nasce no condo com
// a geocerca, mesmo sem visitante ativo).
let condoFence = null;
let directionsService;
let directionsRenderer;
let db;
let rtdb; // Realtime Database reference
let userMarker = null;
let userAccuracyCircle = null;
let infoWindow = null; // Keep track of the currently open info window
let locationSettings = null; // Store fetched settings for the current location
let routePointMarkers = []; // Array to store route point markers

// DOM Elements
const mapElement = document.getElementById("map");
const loadingElement = document.getElementById("loading");
const errorElement = document.getElementById("error-message");

// Initialize app — Onda 3: sem Firebase/auth-na-URL; o mapa sobe e um único
// EventSource same-origin (cookie do operador) empurra as posições.
document.addEventListener('DOMContentLoaded', () => {
  try {
    showLoading();
    // O mapa e o STREAM são independentes: uma falha de tiles (ex.: a key de
    // Google Maps é provisão POR-SITE e pode faltar/ser restrita) NÃO pode
    // derrubar o push. initMap no seu próprio try → o EventSource sempre sobe;
    // sem mapa os marcadores não desenham, mas a portaria segue recebendo dado
    // (roster) e reconecta. Antes, um throw do Maps pulava o startLive().
    try {
      initMap();
    } catch (mapErr) {
      console.error("initMap falhou (Google Maps indisponível?):", mapErr);
      showError("Mapa indisponível — verifique a chave do Google Maps do site.");
    }
    startLive();
  } catch (error) {
    console.error("Error initializing app:", error);
    showError("Failed to initialize application");
  } finally {
    hideLoading();
  }
});

// ── Onda 3 — camada de dados AO VIVO (substitui Firestore+RTDB) ──────────────

/** Cor estável por token (era por tag+settings do Firestore; agora determinística). */
function colorForLive(key) {
  const colors = config.markers.colors;
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

/** Título (tooltip) do marcador com o contato DESNORMALIZADO do push (Onda 3b):
 *  nome + telefone (contact.phone) + unidade/endereço (house_number). Livre —
 *  campos ausentes simplesmente não entram. */
function liveTitle(subject, meta) {
  const parts = [subject || 'Visitante'];
  const phone = meta && meta.contact && meta.contact.phone;
  if (phone) parts.push(phone);
  if (meta && meta.house_number) parts.push(`Unidade ${meta.house_number}`);
  return parts.join('\n');
}

/** Enquadra o mapa nos marcadores AO VIVO + na CERCA do condomínio. Segue o
 *  visitante; para de seguir quando o operador arrasta (autoFrame=false). */
function frameLiveMarkers() {
  if (!autoFrame || !map) return;
  const bounds = new google.maps.LatLngBounds();
  let n = 0;
  for (const m of markers) { bounds.extend(m.marker.getPosition()); n++; }
  if (condoFence) for (const p of condoFence) { bounds.extend(p); n++; }
  if (n === 0) return;
  if (markers.length === 1 && !condoFence) {
    map.setCenter(markers[0].marker.getPosition());
    if (map.getZoom() == null || map.getZoom() < 15) map.setZoom(16);
    return;
  }
  map.fitBounds(bounds, 56);
}

/** Pontos da cerca passados no ?fence= do embed: `lat,lng;lat,lng;...`. */
function parseFenceParam() {
  const raw = getQueryParam("fence");
  if (!raw) return null;
  const pts = raw.split(";").map((s) => {
    const [a, b] = s.split(",").map(Number);
    return (isFinite(a) && isFinite(b)) ? new google.maps.LatLng(a, b) : null;
  }).filter(Boolean);
  return pts.length >= 3 ? pts : null;
}

/** Desenha a geocerca do condomínio (do ?fence=) no mapa do operador + enquadra
 *  nela. Mesmo estilo do livetracker (#132034, fill 0.05). */
function drawCondoFenceFromUrl() {
  const pts = parseFenceParam();
  if (!pts || !map) return;
  condoFence = pts;
  new google.maps.Polygon({
    paths: pts, strokeColor: "#132034", strokeWeight: 2,
    fillColor: "#132034", fillOpacity: 0.05, map,
  });
  frameLiveMarkers();
}

/** Cria/atualiza o marcador de um token a partir de um evento `position`. */
function upsertMarkerLive(tokenId, subject, pos, isOffRoute, data) {
  const meta = { contact: data.contact, house_number: data.house_number };
  const title = liveTitle(subject, meta);
  const existing = markers.find(m => m.id === tokenId);
  if (existing) {
    existing.data = data;
    existing.marker.setPosition({ lat: pos.lat, lng: pos.lng });
    existing.marker.setIcon(generateInitialsMarker(existing.initials, existing.markerColor, isOffRoute));
    existing.marker.setAnimation(isOffRoute ? google.maps.Animation.BOUNCE : null);
    existing.marker.setTitle(title);
    frameLiveMarkers();
    return;
  }
  const initials = getInitials(subject || '??');
  const markerColor = colorForLive(tokenId);
  const marker = new google.maps.Marker({
    position: { lat: pos.lat, lng: pos.lng },
    map,
    icon: generateInitialsMarker(initials, markerColor, isOffRoute),
    title,
  });
  if (isOffRoute) marker.setAnimation(google.maps.Animation.BOUNCE);
  const entry = { id: tokenId, marker, initials, markerColor, data };
  // Paridade com o legado: clique no marcador → POPUP do visitante (InfoWindow)
  // + LINHA marcador→destino (Directions), reusando as funções da UI legada com
  // os dados do PUSH AEGIS (não mais Firebase). D8: mesma interface, só o dado.
  marker.addListener('click', () => openLiveMarkerInfo(entry));
  markers.push(entry);
  frameLiveMarkers();
}

/** Popup (InfoWindow legado) + rota marcador→destino do marcador AO VIVO —
 *  reusa `createInfoWindowContent` e `calculateAndDisplayRoute` com os campos do
 *  push (subject/contact/house_number/target/distance), no lugar dos reads
 *  Firebase (owner/markerRef/route_markers). */
// Escapa string do PUSH (nome do visitante, unidade, rótulos de checkpoint)
// antes de ir p/ innerHTML da InfoWindow (createInfoWindowContent /
// addRoutePointMarkers). subject/house_number/labels vêm do AJX (não-confiável)
// e este é o mapa AUTENTICADO do operador — sem escape, um nome com markup vira
// XSS na sessão que controla o portão/Actions.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openLiveMarkerInfo(entry) {
  const data = entry.data || {};
  const tokenLike = {
    last_updated: data.ts,
    last_speed_kmh_txt: data.last_speed_kmh_txt || null,
    is_multiple_route: false,
    is_off_route: !!data.is_off_route,
  };
  const dist = (data.distance_to_target_m != null)
    ? `${Math.round(Number(data.distance_to_target_m))} m do destino` : null;
  const infoLike = {
    guestDisplayName: escapeHtml(data.subject || 'Visitante'),
    guestPhoneNumber: escapeHtml((data.contact && (data.contact.phone || data.contact.telefone)) || ''),
    userDisplayName: dist || 'Em percurso',
    residentAddress: data.house_number ? `Unidade ${escapeHtml(data.house_number)}` : 'Não informado',
  };
  if (!infoWindow) infoWindow = new google.maps.InfoWindow();
  infoWindow.setContent(createInfoWindowContent(tokenLike, infoLike));
  infoWindow.open(map, entry.marker);
  // ── Rota RICA por ruas com CHECKPOINTS NUMERADOS (paridade com o legado) ──
  // O push pode trazer data.route ([[lat,lng]...] ordenado) + data.route_labels
  // (rótulo por checkpoint, alinhado a route). Quando há, montamos a rota-multi
  // (waypoints por rua + marcadores numerados + glow/setas). Sem route mas com
  // target, mantém a linha simples marcador→destino (comportamento anterior).
  const routeArr = Array.isArray(data.route) ? data.route : null;
  const labels = Array.isArray(data.route_labels) ? data.route_labels : [];

  // Coordenada [lat,lng] → {lat,lng} (só se ambos finitos).
  const asLatLng = (p) =>
    (Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]))
      ? { lat: Number(p[0]), lng: Number(p[1]) } : null;

  if (routeArr && routeArr.length) {
    // Só pontos FINITOS (uma coord NaN faria a request inteira do Directions falhar).
    const pts = routeArr.map(asLatLng).filter(Boolean);
    if (pts.length) {
      // Destino = ÚLTIMO checkpoint. TODOS os checkpoints (inclusive o destino)
      // ganham marcador NUMERADO — o operador vê cada parada. O destino é
      // removido dos WAYPOINTS dentro de calculateAndDisplayRoute (senão vira
      // perna de tamanho zero: destino == último waypoint → rota meia-traçada).
      const destination = pts[pts.length - 1];
      // display_name ESCAPADO (vai p/ innerHTML da InfoWindow do checkpoint).
      const routeMarkers = pts.map((ll, i) => ({
        gps_point: { latitude: ll.lat, longitude: ll.lng },
        display_name: escapeHtml(labels[i] || (i === pts.length - 1
          ? (data.house_number || 'Destino') : ('Ponto ' + (i + 1)))),
      }));

      // Origem = a PORTARIA. data.start (coord real da portaria no token) tem
      // PRECEDÊNCIA sobre ?center= (que é o CENTRO do condo p/ enquadrar o mapa,
      // não a portaria) — sem isto a linha não saía da portaria.
      let origin = asLatLng(data.start);
      if (!origin) {
        const centerParam = getQueryParam('center');
        if (centerParam) {
          const [clat, clng] = centerParam.split(',').map(Number);
          if (isFinite(clat) && isFinite(clng)) origin = { lat: clat, lng: clng };
        }
      }
      if (!origin) origin = entry.marker.getPosition();

      // isMultipleRoute liga os marcadores numerados quando HÁ intermediários.
      calculateAndDisplayRoute(origin, destination, routeMarkers, pts.length > 1);
      return;
    }
  }

  // Sem rota rica: linha simples PORTARIA → destino. NUNCA parte do marcador —
  // o operador quer ver de ONDE o visitante partiu (a portaria). Origem =
  // data.start (portaria); só cai na posição do marcador se o token não trouxer start.
  const t = data.target;
  if (Array.isArray(t) && t.length === 2 && isFinite(t[0]) && isFinite(t[1])) {
    const originSimple = asLatLng(data.start) || entry.marker.getPosition();
    calculateAndDisplayRoute(originSimple, { lat: Number(t[0]), lng: Number(t[1]) });
  }
}

/** Abre o stream de push da portaria e conecta aos marcadores. */
function startLive() {
  const live = new AegisLive();
  live.on('ready', () => {
    // canal (re)abriu → reconstrói do zero + volta a seguir os visitantes
    for (const m of markers) m.marker.setMap(null);
    markers = [];
    autoFrame = true;
  });
  live.on('position', (p) => {
    const lp = p && p.last_position;
    if (!lp || lp.lat == null || lp.lng == null) return;
    // passa o PAYLOAD INTEIRO (subject/contact/house_number + target/route/
    // distance) → o marcador ganha popup + linha até o destino no clique.
    upsertMarkerLive(p.token_id, p.subject, { lat: Number(lp.lat), lng: Number(lp.lng) }, !!p.is_off_route, p);
  });
  live.on('remove', (id) => removeMarker(id));
  live.start();
  window.__aegisLive = live;
  // hook de diagnóstico/teste: dispara o clique do 1º marcador (popup + rota).
  window.__lmClickFirst = () => {
    if (markers[0]) google.maps.event.trigger(markers[0].marker, 'click');
    return markers.length;
  };
}

// URL Parameter Utilities
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Firebase Initialization
function initFirebase() {
  try {
    firebase.initializeApp(config.firebase);
    db = firebase.firestore();
    rtdb = firebase.database(); // Initialize Realtime Database
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw new Error("Firebase initialization failed");
  }
}

// Authentication
async function authenticateWithJWT() {
  const token = getQueryParam("jwt");

  if (!token) {
    throw new Error("Authentication token not provided");
  }

  try {
    const decoded = jwt_decode(token);
    // Validate JWT
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      throw new Error("Token expired");
    }
    
    // Convert JWT to Firebase custom token
    const firebaseToken = await convertToFirebaseToken(token);
    
    // Sign in with the custom token
    await firebase.auth().signInWithCustomToken(firebaseToken);
    
    console.log("Admin Live Map session authenticated successfully");
    return decoded;
  } catch (error) {
    console.error("Authentication error:", error);
    throw new Error("Invalid or expired token");
  }
}

// Convert JWT to Firebase custom token
async function convertToFirebaseToken(jwt) {
  try {
    const response = await fetch('https://bridge.safetag.lat/guard/convert-to-firebase-token', {
      method: 'POST',
      headers: {
        'Authorization': jwt,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.token; // Assuming the response contains a token field
  } catch (error) {
    console.error("Error converting token:", error);
    throw new Error("Failed to convert JWT to Firebase token");
  }
}

function redirectToLogin() {
  setTimeout(() => {
    window.location.href = config.redirectUrl;
  }, 3000);
}

// Map Initialization
function initMap() {
  try {
    // Get center from URL or use default
    let center = config.map.defaultCenter;
    let zoom = config.map.defaultZoom;

    const centerParam = getQueryParam("center");
    if (centerParam) {
      const [latitude, longitude] = centerParam.split(',').map(Number);
      if (!isNaN(latitude) && !isNaN(longitude)) {
        center = { lat: latitude, lng: longitude };
      } else {
        showError("Invalid 'center' parameter");
      }
    }

    // Create the map
    map = new google.maps.Map(mapElement, {
      center: center,
      zoom: zoom,
      streetViewControl: false,
      mapTypeId: config.map.mapType,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }]
        }
      ]
    });

    // Operador assumiu o controle (arrastou o mapa) → para de auto-seguir os
    // visitantes; ele explora à vontade. (Reabre o seguir no 'ready'/reconexão.)
    map.addListener('dragstart', function () { autoFrame = false; });

    // Cerca do condomínio (do ?fence= do embed do AEGIS) — desenha + enquadra.
    drawCondoFenceFromUrl();

    // Add listener for map tile loading errors
    map.addListener('tilesloaded', function () {
      hideLoading();
    });

    map.addListener('error', function (e) {
      console.error('Map loading error:', e);
      showError("Error loading map. Check your connection or try again later.");
    });

    // Initialize directions service and renderer
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true, // Prevent automatic zoom when displaying routes
      polylineOptions: {
        strokeColor: '#FF5722', // Mudando para um laranja vibrante que é mais chamativo
        strokeOpacity: 0.9,
        strokeWeight: 6, // Increased weight for better visibility
        // Add drop shadow effect
        shadowColor: '#000000',
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        // Add animation to the line with animated arrows
        icons: [{
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 3, // Larger arrows
            fillColor: '#FFFFFF', // White fill for better contrast
            fillOpacity: 1,
            strokeWeight: 1,
            strokeColor: '#132034', // Dark outline for arrows
          },
          offset: '0%',
          repeat: '80px' // Adjusted repeat distance
        },
        {
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 3, // Small circle markers along path
            fillColor: '#FFFFFF',
            fillOpacity: 0.8,
            strokeWeight: 1,
            strokeColor: '#132034',
          },
          offset: '40px',
          repeat: '80px' // Alternating with arrows
        }]
      }
    });
    
    // Make sure to set the map on the renderer
    directionsRenderer.setMap(map);
    console.log("Directions renderer initialized and set to map");

    console.log("Map initialized successfully");
  } catch (error) {
    console.error("Error initializing map:", error);
    showError("Failed to initialize map");
    throw error;
  }
}

// Marker Utility Functions
function getInitials(displayName) {
  if (!displayName) return '🖼️';

  // Extract the name part before the bracket
  const namePart = displayName.split('[')[0].trim();

  // Split into words and filter out empty strings
  const words = namePart.split(' ').filter(word => word.length > 0);

  // Get first and last word initials
  if (words.length === 0) return '🖼️';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  const initials = (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  return initials || '🖼️';
}

function generateInitialsMarker(initials, markerColor, isOffRoute = false) {
  const size = 30;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  // Draw the circle
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI, false);
  context.fillStyle = markerColor; // Use the provided color
  context.fill();

  // Draw the border
  context.lineWidth = 2;
  context.strokeStyle = isOffRoute ? config.markers.offRouteBorderColor : config.markers.defaultBorderColor;
  context.stroke();

  // Draw the initials
  context.fillStyle = config.markers.textColor;
  context.font = 'bold 12px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initials, size / 2, size / 2);

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
}

// Marker Management
async function loadMarkersRealtime() {
  try {
    // Get location filter from URL parameter
    const locationId = getQueryParam("location");

    // Fetch location settings if locationId is present
    if (locationId) {
      try {
        const locationRef = db.doc(`locations/${locationId}`);
        const settingsQuery = await db.collection("settings")
                                      .where("locationRef", "==", locationRef)
                                      .limit(1)
                                      .get();
        if (!settingsQuery.empty) {
          locationSettings = settingsQuery.docs[0].data();
          console.log("Loaded location settings:", locationSettings);
        } else {
          console.log("No settings found for location:", locationId);
          locationSettings = null; // Reset if no settings found
        }
      } catch (error) {
        console.error("Error fetching location settings:", error);
        locationSettings = null; // Reset on error
      }
    } else {
       locationSettings = null; // Reset if no locationId
    }


    let query = db.collection("tokens").where("status", "==", "active");

    // If location parameter is provided, add filter for owner field
    if (locationId) {
      // Create a reference to the location document (already created above if fetching settings)
      const locationRef = db.doc(`locations/${locationId}`);
      // Add filter for the owner field
      query = query.where("owner", "==", locationRef);
    }

    // Listen for active tokens from Firestore
    query.onSnapshot(
      snapshot => {
        handleFirestoreTokens(snapshot);
      },
      error => {
        console.error("Error loading markers from Firestore:", error);
        showError("Failed to load token data");
      }
    );
  } catch (error) {
    console.error("Error setting up marker listener:", error);
    showError("Failed to initialize real-time updates");
  }
}

function handleFirestoreTokens(snapshot) {
  snapshot.docChanges().forEach(change => {
    const data = change.doc.data();
    const tokenId = change.doc.id;

    if (change.type === "added") {
      // For new tokens, create a marker and setup Realtime DB listener
      setupTokenWithRealtimeUpdates(tokenId, data);
    } else if (change.type === "modified") {
      // For modified tokens, we only care about non-location updates
      updateTokenData(tokenId, data);
    } else if (change.type === "removed") {
      // For removed tokens, remove the marker and cleanup
      removeMarker(tokenId);
    }
  });
}

async function setupTokenWithRealtimeUpdates(tokenId, firestoreData) {
  try {
    // First, check if we already have location data in the Realtime DB
    const locationSnapshot = await rtdb.ref(`tokens/${tokenId}`).once('value');
    const locationData = locationSnapshot.val();

    if (!locationData || !locationData.last_position) {
      console.log(`No initial location data for token ${tokenId}`);
      // We'll still create a marker when we get the first location update
    } else {
      // Create initial marker with location from Realtime DB
      await createOrUpdateMarker(tokenId, firestoreData, locationData);
    }

    // Set up real-time listener for location updates
    setupRealtimeListener(tokenId, firestoreData);
  } catch (error) {
    console.error(`Error setting up token ${tokenId}:`, error);
  }
}

function setupRealtimeListener(tokenId, firestoreData) {
  rtdb.ref(`tokens/${tokenId}`).on('value',
    async (snapshot) => {
      const locationData = snapshot.val();
      if (locationData && locationData.last_position) {
        await createOrUpdateMarker(tokenId, firestoreData, locationData);
      }
    },
    (error) => {
      console.error(`Error in realtime listener for ${tokenId}:`, error);
    }
  );
}

async function createOrUpdateMarker(tokenId, firestoreData, locationData) {
  const location = {
    latitude: locationData.last_position.latitude,
    longitude: locationData.last_position.longitude
  };

  const existingMarker = markers.find(m => m.id === tokenId);

  if (existingMarker) {
    // Update existing marker position
    existingMarker.marker.setPosition({
      lat: location.latitude,
      lng: location.longitude
    });

    // Determine marker color based on tag and settings (needed for icon update)
    let markerColor = existingMarker.markerColor; // Use existing color by default
    if (locationSettings) {
      if (firestoreData.tag === "servicos" && locationSettings.token_category_autosync_prestador_color) {
        markerColor = locationSettings.token_category_autosync_prestador_color;
      } else if (firestoreData.tag === "visitantes" && locationSettings.token_category_autosync_visitante_color) {
        markerColor = locationSettings.token_category_autosync_visitante_color;
      } else if (!firestoreData.tag && locationSettings.token_category_autosync_padrao_color) {
        markerColor = locationSettings.token_category_autosync_padrao_color;
      }
    }
    existingMarker.markerColor = markerColor; // Update stored color

    // Handle bounce animation and icon update for off-route markers
    if (locationData.is_off_route) {
      existingMarker.marker.setAnimation(google.maps.Animation.BOUNCE);
      existingMarker.marker.setIcon(generateInitialsMarker(existingMarker.initials, markerColor, true));
    } else {
      existingMarker.marker.setAnimation(null);
      existingMarker.marker.setIcon(generateInitialsMarker(existingMarker.initials, markerColor, false));
    }

    // Update marker data with combined info
    const combinedData = {
      ...firestoreData,
      last_position: location,
      last_gps_strength: locationData.last_gps_strength,
      last_speed_kmh: locationData.last_speed_kmh,
      last_speed_kmh_txt: locationData.last_speed_kmh_txt,
      last_speed_ms2: locationData.last_speed_ms2,
      is_off_route: locationData.is_off_route,
      last_updated: new Date(locationData.last_updated)
    };

    // Update info window
    attachMarkerInfo(existingMarker.marker, firestoreData.markerRef,
      firestoreData.users_assigned[0], firestoreData.guest_assigned,
      combinedData, tokenId);
  } else {
    // Create new marker if it doesn't exist (addMarker handles color logic)
    await addMarker(tokenId, firestoreData, location, locationData);
  }
}

function updateTokenData(tokenId, firestoreData) {
  const existingMarker = markers.find(m => m.id === tokenId);
  if (existingMarker) {
    // Determine marker color based on tag and settings (needed for icon update)
    let markerColor = existingMarker.markerColor; // Use existing color by default
    if (locationSettings) {
      if (firestoreData.tag === "servicos" && locationSettings.token_category_autosync_prestador_color) {
        markerColor = locationSettings.token_category_autosync_prestador_color;
      } else if (firestoreData.tag === "visitantes" && locationSettings.token_category_autosync_visitante_color) {
        markerColor = locationSettings.token_category_autosync_visitante_color;
      } else if (!firestoreData.tag && locationSettings.token_category_autosync_padrao_color) {
        markerColor = locationSettings.token_category_autosync_padrao_color;
      }
    }
    existingMarker.markerColor = markerColor; // Update stored color

    // Get the current location data from the Realtime DB
    rtdb.ref(`tokens/${tokenId}`).once('value').then((snapshot) => {
      const locationData = snapshot.val();
      if (locationData) {
        // Handle bounce animation and icon update for off-route markers
        if (locationData.is_off_route) {
          existingMarker.marker.setAnimation(google.maps.Animation.BOUNCE);
          existingMarker.marker.setIcon(generateInitialsMarker(existingMarker.initials, markerColor, true));
        } else {
          existingMarker.marker.setAnimation(null);
          existingMarker.marker.setIcon(generateInitialsMarker(existingMarker.initials, markerColor, false));
        }

        // Update info window with combined data
        const combinedData = {
          ...firestoreData,
          last_position: {
            latitude: locationData.last_position.latitude,
            longitude: locationData.last_position.longitude
          },
          last_gps_strength: locationData.last_gps_strength,
          last_speed_kmh: locationData.last_speed_kmh,
          last_speed_kmh_txt: locationData.last_speed_kmh_txt,
          last_speed_ms2: locationData.last_speed_ms2,
          is_off_route: locationData.is_off_route,
          last_updated: new Date(locationData.last_updated)
        };

        attachMarkerInfo(existingMarker.marker, firestoreData.markerRef,
          firestoreData.users_assigned[0], firestoreData.guest_assigned,
          combinedData, tokenId);
      }
    }).catch(error => {
      console.error(`Error getting location data for ${tokenId}:`, error);
    });
  }
}

async function addMarker(id, firestoreData, location, locationData) {
  try {
    // Get the guest display name to create initials
    const guestDisplayName = await fetchDisplayName(firestoreData.guest_assigned) || "Unknown";
    const initials = getInitials(guestDisplayName);

    // Determine marker color based on tag and settings
    let markerColor = config.markers.defaultColor; // Default color
    if (locationSettings) {
      if (firestoreData.tag === "servicos" && locationSettings.token_category_autosync_prestador_color) {
        markerColor = locationSettings.token_category_autosync_prestador_color;
      } else if (firestoreData.tag === "visitantes" && locationSettings.token_category_autosync_visitante_color) {
        markerColor = locationSettings.token_category_autosync_visitante_color;
      } else if (!firestoreData.tag && locationSettings.token_category_autosync_padrao_color) {
        markerColor = locationSettings.token_category_autosync_padrao_color;
      }
    }

    // Create marker with custom icon using the determined color
    const marker = new google.maps.Marker({
      position: { lat: location.latitude, lng: location.longitude },
      map: map,
      icon: generateInitialsMarker(initials, markerColor, locationData.is_off_route),
      title: guestDisplayName // Tooltip on hover
    });

    // Apply bounce animation if marker is off route
    if (locationData.is_off_route) {
      marker.setAnimation(google.maps.Animation.BOUNCE);
    }

    // Combine Firestore data with location data
    const combinedData = {
      ...firestoreData,
      last_position: location,
      last_gps_strength: locationData.last_gps_strength,
      last_speed_kmh: locationData.last_speed_kmh,
      last_speed_kmh_txt: locationData.last_speed_kmh_txt,
      last_speed_ms2: locationData.last_speed_ms2,
      is_off_route: locationData.is_off_route,
      last_updated: new Date(locationData.last_updated)
    };

    attachMarkerInfo(marker, firestoreData.markerRef, firestoreData.users_assigned[0],
      firestoreData.guest_assigned, combinedData, id);

    markers.push({
      id: id,
      marker,
      initials,
      markerColor // Store the used color
    });

    // Optional: Add collision circles
    if (getQueryParam("showCollision") === "true") {
      addCollisionCircles(marker);
    }
  } catch (error) {
    console.error("Error adding marker:", error);
  }
}

function removeMarker(id) {
  const index = markers.findIndex(m => m.id === id);
  if (index > -1) {
    // Onda 3: sem listener RTDB a desligar — o push vem pelo EventSource único.
    markers[index].marker.setMap(null);
    markers.splice(index, 1);
  }
}

// Utility function to hash a string (for consistent color assignment)
function hashString(str) {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash);
}

// Marker Info Window
async function attachMarkerInfo(marker, markerRef, usersAssignedRef, guestAssignedRef, tokenData, tokenId) {
  if (!markerRef) return;

  try {
    // Fetch additional data
    const userDisplayName = await fetchDisplayName(usersAssignedRef) || "Unknown";
    const guestDisplayName = await fetchDisplayName(guestAssignedRef) || "Unknown";
    const residentAddress = await fetchAddress(markerRef) || "Unknown";
    const guestPhoneNumber = await fetchPhoneNumber(guestAssignedRef) || "---";
    
    // Fetch the marker document to get gps_point
    let markerDoc;
    if (typeof markerRef === "string") {
      markerDoc = await db.doc(markerRef).get();
    } else {
      markerDoc = await markerRef.get();
    }
    
    // Store the gps_point for route calculation if it exists
    let gpsPoint = null;
    if (markerDoc.exists && markerDoc.data().gps_point) {
      gpsPoint = markerDoc.data().gps_point;
    }

    // Create info window content
    const content = createInfoWindowContent(tokenData, {
      userDisplayName,
      guestDisplayName,
      residentAddress,
      guestPhoneNumber,
      tokenId
    });

    // Set up or update info window
    const markerIndex = markers.findIndex(m => m.marker === marker);
    let infoWindow;

    if (markerIndex !== -1 && markers[markerIndex].infoWindow) {
      // Update existing InfoWindow content
      infoWindow = markers[markerIndex].infoWindow;
      infoWindow.setContent(content);
      
      // Update stored gpsPoint
      markers[markerIndex].gpsPoint = gpsPoint;
      
      // Store route_markers if they exist
      markers[markerIndex].routeMarkers = tokenData.route_markers || null;
      
      // Store is_multiple_route flag
      markers[markerIndex].isMultipleRoute = tokenData.is_multiple_route || false;
    } else {
      // Create a new InfoWindow
      infoWindow = new google.maps.InfoWindow({
        content: content,
        disableAutoPan: true,
        closeBoxURL: "", // Hide default close button if using custom one
        pixelOffset: new google.maps.Point(0, -35) // Deslocamento vertical mínimo
      });

      if (markerIndex !== -1) {
        markers[markerIndex].infoWindow = infoWindow;
        markers[markerIndex].gpsPoint = gpsPoint;
        markers[markerIndex].routeMarkers = tokenData.route_markers || null;
        markers[markerIndex].isMultipleRoute = tokenData.is_multiple_route || false;
      }
    }

    // Add click listener
    marker.addListener("click", () => {
      // Close any open info windows first
      closeInfoWindow();
      
      // Then open this one
      infoWindow.open(map, marker);
      
      // Get the center from URL param or use current map center
      const centerParam = getQueryParam("center");
      let origin;
      
      if (centerParam) {
        const [latitude, longitude] = centerParam.split(',').map(Number);
        if (!isNaN(latitude) && !isNaN(longitude)) {
          origin = { lat: latitude, lng: longitude };
        } else {
          origin = map.getCenter().toJSON();
        }
      } else {
        origin = map.getCenter().toJSON();
      }
      
      // Get destination from the marker's gpsPoint
      const markerIndex = markers.findIndex(m => m.marker === marker);
      if (markerIndex !== -1 && markers[markerIndex].gpsPoint) {
        const gpsPoint = markers[markerIndex].gpsPoint;
        const destination = { 
          lat: gpsPoint.latitude || gpsPoint._lat, 
          lng: gpsPoint.longitude || gpsPoint._long 
        };
        
        console.log("Calculating route to destination:", destination);
        
        // Check if we have route_markers to use as waypoints
        const routeMarkers = markers[markerIndex].routeMarkers;
        const isMultipleRoute = markers[markerIndex].isMultipleRoute || false;
        
        if (routeMarkers && routeMarkers.length > 0) {
          console.log(`Using ${routeMarkers.length} route markers as waypoints`);
          // Calculate and display route with waypoints and pass isMultipleRoute flag
          calculateAndDisplayRoute(origin, destination, routeMarkers, isMultipleRoute);
        } else {
          console.log("No route markers available, calculating direct route");
          // Calculate and display route without waypoints and pass isMultipleRoute flag
          calculateAndDisplayRoute(origin, destination, null, isMultipleRoute);
        }
      } else {
        console.log("No gpsPoint found for marker, not calculating route");
      }
    });

    // Add close event
    infoWindow.addListener("closeclick", () => {
      directionsRenderer.set('directions', null); // Clear directions
      clearRoutePointMarkers(); // Clear route point markers
      console.log("Route cleared due to InfoWindow close");
    });
  } catch (error) {
    console.error("Error attaching marker info:", error);
  }
}

function createInfoWindowContent(token, info) {
  // Format the timestamp which might be a Date object or a Firestore timestamp
  let formattedTimestamp = 'N/A';
  if (token.last_updated) {
    let dateToFormat;
    if (token.last_updated instanceof Date) {
      dateToFormat = token.last_updated;
    } else if (token.last_updated.seconds) {
      dateToFormat = new Date(token.last_updated.seconds * 1000);
    } else {
      // Handle case where it might be a timestamp number
      dateToFormat = new Date(token.last_updated);
    }
    if (!isNaN(dateToFormat)) {
       formattedTimestamp = dateToFormat.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
  }

  const guestPhoneNumberClean = (info.guestPhoneNumber || '').replace(/[^0-9]/g, ''); // Clean phone number for link

  return `
    <div class="info-window-content">
      <button class="close-button" onclick="closeInfoWindow()" aria-label="Close">&times;</button>
      
      <div class="info-header-bar">
        <div class="guest-name">${info.guestDisplayName || 'Visitante'}</div>
        <div class="toggle-container">
          <button class="toggle-details-button" onclick="toggleInfoDetails(this)" title="Mostrar detalhes">
            <span>+ Detalhes</span>
          </button>
        </div>
      </div>

      <div class="info-details" style="display: none; max-height: 0; overflow: hidden;">
        <div class="distance-whatsapp">
          ${token.last_speed_kmh_txt ? `<span class="distance-badge">${token.last_speed_kmh_txt} Km/h</span>` : ''}
        </div>

        <div class="info-section location-section">
          ${token.is_multiple_route === false || token.is_multiple_route === undefined ? `
          <div class="location-item">
            <span class="label">
              <img width="8" height="8" src="https://img.icons8.com/material-outlined/24/777777/user.png" alt="user-icon">
              Morador:
            </span>
            <span class="value">${info.userDisplayName || 'Não informado'}</span>
          </div>
          <div class="location-item">
            <span class="label">
              <img width="8" height="8" src="https://img.icons8.com/material-outlined/24/777777/marker.png" alt="address-icon">
              Endereço:
            </span>
            <span class="value address-value">${info.residentAddress || 'Não informado'}</span>
          </div>
          ` : ''}
          ${token.is_off_route ? '<div class="off-route-indicator" title="Fora da rota definida">⚠️ Fora da Rota</div>' : '<div class="on-route-indicator" title="Em rota definida">✅ Em Rota</div>'}
        </div>
      </div>
    </div>
    <style>
      .info-window-content {
        font-family: 'Inter', 'Roboto', sans-serif;
        padding: 3px 0 3px 4px; /* Removido padding à direita */
        max-width: 100px; /* Ligeiramente maior para nomes completos */
        min-width: 80px; /* Minimum width */
        position: relative;
        background-color: #fff;
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        color: #333;
        overflow: hidden;
      }
      .close-button {
        position: absolute;
        top: 0px;
        right: 0px;
        background: rgba(0,0,0,0.05);
        border: none;
        font-size: 12px;
        font-weight: bold;
        color: #555;
        cursor: pointer;
        padding: 0 2px;
        line-height: 1;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        border-top-right-radius: 6px;
        border-bottom-left-radius: 4px;
        transition: background-color 0.2s, color 0.2s;
      }
      .close-button:hover {
        background-color: rgba(0,0,0,0.1);
        color: #000;
      }
      .info-header-bar {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        padding: 0;
        min-height: 18px; /* Ensure minimum height for collapsed state */
        transition: all 0.3s;
        width: 100%;
        flex-wrap: wrap;
        padding-top: 1px;
        padding-right: 0; /* Removido padding à direita */
      }
      .guest-name {
        font-size: 9px;
        font-weight: 600;
        color: #000;
        margin-right: 15px; /* Espaço para o botão fechar */
        margin-bottom: 5px;
        word-wrap: break-word;
        word-break: break-word;
        line-height: 1.1;
        text-transform: uppercase;
        flex-grow: 1;
        padding-right: 0;
        max-width: 100%;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .toggle-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: stretch;
        width: 100%;
        padding-right: 3px; /* Leve padding para não encostar na borda */
        margin-bottom: 1px;
      }
      .toggle-details-button {
        background-color: #132034; /* Dark blue color */
        border: none;
        padding: 2px 3px;
        cursor: pointer;
        width: 100%;
        transition: background-color 0.2s;
        border-radius: 3px;
        color: white;
        font-size: 8px;
        font-weight: 500;
        text-align: center;
        height: 18px;
      }
      .toggle-details-button:hover {
        background-color: #0e1825; /* Darker shade on hover */
      }
      .toggle-details-button.expanded {
        background-color: #555; /* Darker when expanded */
      }
      .toggle-details-button span {
        white-space: nowrap;
      }
      .info-details {
        transition: max-height 0.3s ease-out, opacity 0.3s;
        opacity: 0;
        margin-top: 2px;
        padding-top: 2px;
      }
      .info-details.expanded {
        max-height: 200px !important;
        opacity: 1;
      }
      
      /* Distance and WhatsApp section */
      .distance-whatsapp {
        display: flex;
        justify-content: flex-start;
        align-items: flex-start; /* Align items to top */
        gap: 4px;
        margin-bottom: 4px;
        flex-wrap: wrap; /* Allow wrapping if needed */
      }
      .distance-badge {
        background-color: #f5f5f5;
        color: #555;
        font-size: 8px;
        padding: 1px 3px;
        border-radius: 2px;
        display: flex;
        align-items: center;
        font-weight: 500;
      }
      .whatsapp-button {
        display: flex;
        align-items: center;
        gap: 2px;
        text-decoration: none;
        color: #25D366;
        font-weight: 500;
        font-size: 8px;
        padding: 1px 3px;
        background-color: #f0f9f0;
        border-radius: 2px;
        border: 1px solid #e0f4e0;
        transition: background-color 0.2s;
        white-space: nowrap; /* Prevent button text wrapping */
        height: 14px;
      }
      .whatsapp-button img {
        width: 10px;
        height: 10px;
      }
      .whatsapp-button:hover {
        background-color: #e0f4e0;
      }
      
      /* Location section */
      .info-section {
        margin-bottom: 2px;
        font-size: 8px;
        color: #333;
      }
      .location-section .location-item {
        margin-bottom: 2px;
        display: flex;
        flex-direction: column;
      }
      .location-item .label {
        font-weight: 400;
        color: #777;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 8px;
      }
      .location-item .value {
        padding-left: 12px;
        margin-top: 1px;
        font-size: 8px;
        color: #333;
        word-wrap: break-word;
      }
      
      /* Timestamp */
      .timestamp-container {
        display: flex;
        align-items: center;
        gap: 2px;
        color: #777;
        font-size: 7px;
        margin-top: 2px;
        padding-left: 1px;
      }
      
      /* Off-route indicator */
      .off-route-indicator {
        color: #e74c3c;
        font-weight: bold;
        font-size: 8px;
        margin-top: 2px;
      }

      /* On-route indicator */
      .on-route-indicator {
        color: #2ecc71;
        font-weight: bold;
        font-size: 8px;
        margin-top: 2px;
      }
    </style>
    <script>
      function toggleInfoDetails(button) {
        const detailsElement = button.closest('.info-window-content').querySelector('.info-details');
        const buttonText = button.querySelector('span');
        
        if (detailsElement.style.display === 'none') {
          // Expand
          detailsElement.style.display = 'block';
          setTimeout(() => {
            detailsElement.classList.add('expanded');
          }, 10);
          button.classList.add('expanded');
          button.title = 'Esconder detalhes';
          buttonText.textContent = '- Ocultar';
        } else {
          // Collapse
          detailsElement.classList.remove('expanded');
          button.classList.remove('expanded');
          button.title = 'Mostrar detalhes';
          buttonText.textContent = '+ Detalhes';
          setTimeout(() => {
            detailsElement.style.display = 'none';
          }, 300); // Match the transition duration
        }
      }
    </script>
  `;
}

function listenForTokenUpdates(tokenId, infoWindow, staticInfo) {
  db.collection("tokens").doc(tokenId).onSnapshot(
    docSnapshot => {
      if (docSnapshot.exists) {
        const updatedToken = docSnapshot.data();
        infoWindow.setContent(createInfoWindowContent(updatedToken, staticInfo));
      }
    },
    error => {
      console.error("Error listening for token updates:", error);
    }
  );
}

// Data Fetching
async function fetchDisplayName(ref) {
  if (!ref) return "Unknown";

  let docRef = typeof ref === "string" ? db.doc(ref) : ref;
  try {
    const doc = await docRef.get();
    return doc.exists ? (doc.data().display_name || "No name") : "Unknown";
  } catch (error) {
    console.error("Error fetching display name:", error);
    return "Unknown";
  }
}

async function fetchPhoneNumber(ref) {
  if (!ref) return "---";

  let docRef = typeof ref === "string" ? db.doc(ref) : ref;
  try {
    const doc = await docRef.get();
    if (doc.exists) {
      const phoneNumber = doc.data().phone_number || "---";
      return phoneNumber.startsWith('+') ? phoneNumber.substring(1) : phoneNumber;
    }
    return "---";
  } catch (error) {
    console.error("Error fetching phone number:", error);
    return "---";
  }
}

async function fetchAddress(ref) {
  if (!ref) return "Unknown";

  let docRef = typeof ref === "string" ? db.doc(ref) : ref;
  try {
    const doc = await docRef.get();
    return doc.exists ? (doc.data().address || "Unknown") : "Unknown";
  } catch (error) {
    console.error("Error fetching address:", error);
    return "Unknown";
  }
}

// Route Management
function drawRoute() {
  try {
    // If no custom path provided, use default
    const LGI = [
        { lat: -23.5613, lng: -48.0217592 },
        { lat: -23.5626916, lng: -48.0185459 },
        { lat: -23.5629374, lng: -48.0186639 },
        { lat: -23.563729, lng: -48.0163331 },
        { lat: -23.5621383, lng: -48.0140881 },
        { lat: -23.5617746, lng: -48.0136644 },
        { lat: -23.5596121, lng: -48.0152958 },
        { lat: -23.5597953, lng: -48.0158584 },
        { lat: -23.5601592, lng: -48.0169098 },
        { lat: -23.5605243, lng: -48.0178996 },
        { lat: -23.5592642, lng: -48.0205576 },
        { lat: -23.5613, lng: -48.0217592 }
      ];
    const LGIRoute = new google.maps.Polyline({
      path: LGI,
      geodesic: true,
      strokeColor: '#132034',
      strokeOpacity: 1.0,
      strokeWeight: 4,
    });
    LGIRoute.setMap(map);

    // Draw boundary area if provided or use default
    const ORV = [
        { lat: -23.5703357, lng: -48.0186513 },
        { lat: -23.5706897, lng: -48.0184474 },
        { lat: -23.570611, lng: -48.0182436 },
        { lat: -23.5713682, lng: -48.0178868 },
        { lat: -23.5715084, lng: -48.0178198 },
        { lat: -23.571796, lng: -48.017573 },
        { lat: -23.5705078, lng: -48.0155292 },
        { lat: -23.5710732, lng: -48.015261 },
        { lat: -23.5699374, lng: -48.012155 },
        { lat: -23.566766, lng: -48.0135443 },
        { lat: -23.5664095, lng: -48.012619 },
        { lat: -23.566026, lng: -48.012788 },
        { lat: -23.5660407, lng: -48.0128255 },
        { lat: -23.5669504, lng: -48.0152073 },
        { lat: -23.5659916, lng: -48.0156579 },
        { lat: -23.5666431, lng: -48.0164411 },
        { lat: -23.5657408, lng: -48.0173531 },
        { lat: -23.567656, lng: -48.0196866 },
        { lat: -23.5679854, lng: -48.0194345 },
        { lat: -23.5702029, lng: -48.0184367 },
        { lat: -23.5703357, lng: -48.0186513 }
      ];
    const ORVRoute = new google.maps.Polyline({
      path: ORV,
      geodesic: true,
      strokeColor: '#132034', // Different color for boundary
      strokeOpacity: 1.0,
      strokeWeight: 4,
    });
    ORVRoute.setMap(map);

    // Draw boundary area if provided or use default
    const GDV = [
      { lat: -23.5703499, lng: -48.0104631 },
      { lat: -23.5703542, lng: -48.0100911 },
      { lat: -23.570278, lng: -48.0100844 },
      { lat: -23.5702657, lng: -48.009945 },
      { lat: -23.5706517, lng: -48.0099195 },
      { lat: -23.5706762, lng: -48.0098229 },
      { lat: -23.5706258, lng: -48.0097197 },
      { lat: -23.5708348, lng: -48.0097156 },
      { lat: -23.5708139, lng: -48.0086602 },
      { lat: -23.5706013, lng: -48.0086629 },
      { lat: -23.570557, lng: -48.0085234 },
      { lat: -23.570439, lng: -48.0084563 },
      { lat: -23.5692467, lng: -48.0085234 },
      { lat: -23.5685583, lng: -48.0085744 },
      { lat: -23.5680232, lng: -48.0086167 },
      { lat: -23.5661917, lng: -48.0087468 },
      { lat: -23.5654427, lng: -48.0087902 },
      { lat: -23.5648063, lng: -48.008884 },
      { lat: -23.564408, lng: -48.008943 },
      { lat: -23.5634812, lng: -48.0090637 },
      { lat: -23.563341, lng: -48.0087767 },
      { lat: -23.5632279, lng: -48.0083985 },
      { lat: -23.5633189, lng: -48.0079184 },
      { lat: -23.5632476, lng: -48.0076045 },
      { lat: -23.5621825, lng: -48.0077172 },
      { lat: -23.5620313, lng: -48.0077561 },
      { lat: -23.5619576, lng: -48.0077347 },
      { lat: -23.5618641, lng: -48.0077709 },
      { lat: -23.5617351, lng: -48.007622 },
      { lat: -23.5615138, lng: -48.0077454 },
      { lat: -23.5617828, lng: -48.0082345 },
      { lat: -23.5619463, lng: -48.0091813 },
      { lat: -23.5619683, lng: -48.0091983 },
      { lat: -23.562192, lng: -48.0104831 },
      { lat: -23.5622289, lng: -48.0108881 },
      { lat: -23.5619413, lng: -48.011957 },
      { lat: -23.5617237, lng: -48.0127804 },
      { lat: -23.5620617, lng: -48.012885 },
      { lat: -23.562047, lng: -48.0129494 },
      { lat: -23.5622166, lng: -48.012873 },
      { lat: -23.5624728, lng: -48.0135423 },
      { lat: -23.563873, lng: -48.012912 },
      { lat: -23.5640893, lng: -48.0134886 },
      { lat: -23.5642012, lng: -48.0134149 },
      { lat: -23.5648134, lng: -48.0131507 },
      { lat: -23.565605, lng: -48.012802 },
      { lat: -23.566463, lng: -48.0124265 },
      { lat: -23.5668121, lng: -48.0123702 },
      { lat: -23.5675718, lng: -48.0124909 },
      { lat: -23.568329, lng: -48.0124909 },
      { lat: -23.5690493, lng: -48.0123487 },
      { lat: -23.5708735, lng: -48.0115601 },
      { lat: -23.5708637, lng: -48.0107421 },
      { lat: -23.5706326, lng: -48.0107501 },
      { lat: -23.5707063, lng: -48.010565 },
      { lat: -23.5706301, lng: -48.0104577 },
      { lat: -23.5703499, lng: -48.0104631 }
    ];
    const GDVRoute = new google.maps.Polyline({
      path: GDV,
      geodesic: true,
      strokeColor: '#132034', // Different color for boundary
      strokeOpacity: 1.0,
      strokeWeight: 4,
    });
    GDVRoute.setMap(map);

    // Draw boundary area if provided or use default
    const PIN = [
      { lat: -23.5662728, lng: -48.0213405 },
      { lat: -23.5662556, lng: -48.0214804 },
      { lat: -23.5662801, lng: -48.0215903 },
      { lat: -23.5663121, lng: -48.0217566 },
      { lat: -23.5663957, lng: -48.022108 },
      { lat: -23.5664522, lng: -48.0223736 },
      { lat: -23.5665481, lng: -48.0227652 },
      { lat: -23.5666391, lng: -48.0231889 },
      { lat: -23.5667104, lng: -48.0234679 },
      { lat: -23.5667522, lng: -48.0236691 },
      { lat: -23.5667891, lng: -48.0238488 },
      { lat: -23.5668677, lng: -48.0241706 },
      { lat: -23.566939, lng: -48.0244737 },
      { lat: -23.5669833, lng: -48.0246588 },
      { lat: -23.5670349, lng: -48.024817 },
      { lat: -23.5671209, lng: -48.0250289 },
      { lat: -23.5671947, lng: -48.0251791 },
      { lat: -23.567293, lng: -48.0253615 },
      { lat: -23.5674086, lng: -48.0255359 },
      { lat: -23.5675586, lng: -48.0257156 },
      { lat: -23.5677036, lng: -48.025898 },
      { lat: -23.5680134, lng: -48.0262762 },
      { lat: -23.56851, lng: -48.0268877 },
      { lat: -23.568569, lng: -48.0268904 },
      { lat: -23.5687927, lng: -48.0267885 },
      { lat: -23.5686649, lng: -48.0264505 },
      { lat: -23.5694835, lng: -48.0261206 },
      { lat: -23.5695745, lng: -48.0263566 },
      { lat: -23.5699605, lng: -48.0261635 },
      { lat: -23.5704227, lng: -48.0259811 },
      { lat: -23.571584, lng: -48.025518 },
      { lat: -23.5716172, lng: -48.0254966 },
      { lat: -23.5716344, lng: -48.0254483 },
      { lat: -23.571627, lng: -48.0253946 },
      { lat: -23.571541, lng: -48.0252941 },
      { lat: -23.5714636, lng: -48.0252042 },
      { lat: -23.5714061, lng: -48.0251434 },
      { lat: -23.5713791, lng: -48.025118 },
      { lat: -23.5713435, lng: -48.0250778 },
      { lat: -23.5709895, lng: -48.0246727 },
      { lat: -23.5702606, lng: -48.0238614 },
      { lat: -23.5697676, lng: -48.0232458 },
      { lat: -23.5695599, lng: -48.0231667 },
      { lat: -23.5695906, lng: -48.0231399 },
      { lat: -23.5694198, lng: -48.0229146 },
      { lat: -23.5694665, lng: -48.0228529 },
      { lat: -23.5690203, lng: -48.0222842 },
      { lat: -23.5686847, lng: -48.0218417 },
      { lat: -23.5686269, lng: -48.0218189 },
      { lat: -23.5685655, lng: -48.0218216 },
      { lat: -23.5684696, lng: -48.0216982 },
      { lat: -23.5684856, lng: -48.021674 },
      { lat: -23.5684966, lng: -48.0216445 },
      { lat: -23.5684954, lng: -48.0216043 },
      { lat: -23.5684696, lng: -48.021552 },
      { lat: -23.5681684, lng: -48.0211443 },
      { lat: -23.5679028, lng: -48.0208335 },
      { lat: -23.5676397, lng: -48.0205626 },
      { lat: -23.5675512, lng: -48.020517 },
      { lat: -23.5674898, lng: -48.0205707 },
      { lat: -23.5673472, lng: -48.020619 },
      { lat: -23.5672857, lng: -48.0206404 },
      { lat: -23.5671923, lng: -48.0206163 },
      { lat: -23.5669981, lng: -48.0207477 },
      { lat: -23.5667965, lng: -48.0208845 },
      { lat: -23.566558, lng: -48.0210427 },
      { lat: -23.5664351, lng: -48.0211313 },
      { lat: -23.5663343, lng: -48.021209 },
      { lat: -23.5662728, lng: -48.0213405 }
    ];
    const PINRoute = new google.maps.Polyline({
      path: PIN,
      geodesic: true,
      strokeColor: '#132034', // Different color for boundary
      strokeOpacity: 1.0,
      strokeWeight: 4,
    });
    PINRoute.setMap(map);
  } catch (error) {
    console.error("Error drawing routes:", error);
  }
}

// Generate a custom marker for route points
function generateRoutePointMarker(index) {
  const size = config.markers.routePointSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  // Draw the circle
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI, false);
  context.fillStyle = config.markers.routePointColor;
  context.fill();

  // Draw the border
  context.lineWidth = 2;
  context.strokeStyle = config.markers.routePointBorderColor;
  context.stroke();

  // Draw the number/index
  context.fillStyle = config.markers.textColor;
  context.font = 'bold 10px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText((index + 1).toString(), size / 2, size / 2);

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(size, size),
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(size / 2, size / 2)
  };
}

// Clear any existing route point markers
function clearRoutePointMarkers() {
  routePointMarkers.forEach(marker => {
    marker.setMap(null);
  });
  routePointMarkers = [];
}

// Add markers for each step in the route
function addRoutePointMarkers(route, customRouteMarkers = null) {
  // Clear any existing route point markers
  clearRoutePointMarkers();
  
  // If we have custom route markers, use those instead of the Google Directions steps
  if (customRouteMarkers && customRouteMarkers.length > 0) {
    console.log(`Adding ${customRouteMarkers.length} custom route markers`);
    
    customRouteMarkers.forEach((marker, index) => {
      if (!marker || !marker.gps_point) {
        return;
      }
      
      // Extract coordinates from the gps_point
      const gpsPoint = marker.gps_point;
      let lat, lng;
      
      // Try various ways to extract the coordinates
      if (typeof gpsPoint.latitude === 'number') {
        lat = gpsPoint.latitude;
        lng = gpsPoint.longitude;
      } else if (typeof gpsPoint._lat === 'number') {
        lat = gpsPoint._lat;
        lng = gpsPoint._long;
      } else if (typeof gpsPoint.lat === 'function') {
        lat = gpsPoint.lat();
        lng = gpsPoint.lng();
      } else {
        console.warn(`Could not extract coordinates from gps_point for marker ${index}`);
        return;
      }
      
      // Create marker for this route point
      const position = new google.maps.LatLng(lat, lng);
      const stepMarker = new google.maps.Marker({
        position: position,
        map: map,
        icon: generateRoutePointMarker(index),
        zIndex: 100
      });
      
      // Add info window with any available information
      let infoContent = `
        <div class="route-point-info">
          <button class="route-close-button" onclick="closeRoutePointInfo()" aria-label="Close">&times;</button>
          <div class="point-number">Ponto ${index + 1}</div>
          ${marker.display_name ? `<div class="point-address">${marker.display_name}</div>` : ''}
          ${marker.user_display_name ? `
            <div class="point-resident">
              <span class="label">
                <img width="8" height="8" src="https://img.icons8.com/material-outlined/24/777777/user.png" alt="user-icon">
                Morador:
              </span>
              <span class="value">${marker.user_display_name}</span>
            </div>
          ` : ''}
          ${marker.address ? `
            <div class="point-location">
              <span class="label">
                <img width="8" height="8" src="https://img.icons8.com/material-outlined/24/777777/marker.png" alt="address-icon">
                Endereço:
              </span>
              <span class="value">${marker.address}</span>
            </div>
          ` : ''}
        </div>
        <style>
          .route-point-info {
            font-family: 'Inter', sans-serif; 
            padding: 5px 8px; 
            font-size: 12px;
            max-width: 200px;
            position: relative;
          }
          .route-close-button {
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(0,0,0,0.05);
            border: none;
            font-size: 12px;
            font-weight: bold;
            color: #555;
            cursor: pointer;
            padding: 0 2px;
            line-height: 1;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            border-radius: 50%;
            transition: background-color 0.2s, color 0.2s;
          }
          .route-close-button:hover {
            background-color: rgba(0,0,0,0.1);
            color: #000;
          }
          .point-number {
            font-weight: bold;
            margin-bottom: 5px;
            padding-right: 20px;
            color: #132034;
          }
          .point-address {
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
          }
          .point-resident, .point-location {
            margin-bottom: 5px;
            font-size: 11px;
          }
          .point-resident .label, .point-location .label {
            display: flex;
            align-items: center;
            gap: 3px;
            color: #777;
            font-size: 10px;
          }
          .point-resident .value, .point-location .value {
            display: block;
            margin-top: 2px;
            padding-left: 12px;
            color: #333;
          }
        </style>
      `;
      
      const infoWindow = new google.maps.InfoWindow({
        content: infoContent,
        disableAutoPan: true
      });
      
      stepMarker.addListener('click', () => {
        // Close any open info windows
        routePointMarkers.forEach(m => {
          if (m.infoWindow) m.infoWindow.close();
        });
        
        // Open this info window
        infoWindow.open(map, stepMarker);
      });
      
      stepMarker.infoWindow = infoWindow;
      routePointMarkers.push(stepMarker);
    });
    
    return; // Skip the Google Directions markers
  }
  
  // If no custom route markers were provided, use the Google Directions steps
  if (!route || !route.routes || route.routes.length === 0) {
    return;
  }
  
  const legs = route.routes[0].legs;
  
  legs.forEach(leg => {
    // Add marker for start location if it's the first leg
    if (routePointMarkers.length === 0) {
      const startMarker = new google.maps.Marker({
        position: leg.start_location,
        map: map,
        icon: generateRoutePointMarker(0),
        zIndex: 100
      });
      routePointMarkers.push(startMarker);
    }
    
    // Add markers for each step
    leg.steps.forEach((step, index) => {
      const stepMarker = new google.maps.Marker({
        position: step.end_location,
        map: map,
        icon: generateRoutePointMarker(routePointMarkers.length),
        zIndex: 100
      });
      
      // Add info window with instructions
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div class="route-step-info">
            ${step.instructions}
          </div>
          <style>
            .route-step-info {
              font-family: 'Inter', sans-serif; 
              padding: 5px 8px; 
              font-size: 12px;
              max-width: 200px;
            }
          </style>
        `,
        disableAutoPan: true
      });
      
      stepMarker.addListener('click', () => {
        // Close any open info windows
        routePointMarkers.forEach(m => {
          if (m.infoWindow) m.infoWindow.close();
        });
        
        // Open this info window
        infoWindow.open(map, stepMarker);
      });
      
      stepMarker.infoWindow = infoWindow;
      routePointMarkers.push(stepMarker);
    });
  });
}

// Add animation function for route arrows
let arrowOffset = 0;
let animationActive = false;
window.animateRouteArrows = function() {
  if (!animationActive) return;
  arrowOffset -= 0.5; // Slower animation
  if (directionsRenderer.get('directions')) {
    const icons = directionsRenderer.get('polylineOptions').icons;
    icons[0].offset = arrowOffset + '%';
    directionsRenderer.set('polylineOptions', {
      ...directionsRenderer.get('polylineOptions'),
      icons: icons
    });
    requestAnimationFrame(window.animateRouteArrows);
  } else {
    animationActive = false;
  }
};

function calculateAndDisplayRoute(origin, destination, routeMarkers = null, isMultipleRoute = false) {
  try {
    // Ensure we have valid coordinates
    if (!origin || !destination) {
      console.error("Invalid origin or destination for route:", { origin, destination });
      return;
    }
    
    // Make sure directionsRenderer is associated with the map
    if (!directionsRenderer.getMap()) {
      directionsRenderer.setMap(map);
    }
    
    // Clear any existing route
    directionsRenderer.set('directions', null);
    
    // Clear any existing route point markers
    clearRoutePointMarkers();

    // If we have route markers, add visual markers for them first
    if (routeMarkers && routeMarkers.length > 0) {
      console.log(`Found ${routeMarkers.length} custom route markers to display`);
    }
    
    // Create the route request
    const request = {
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING,
    };

    // Add waypoints if routeMarkers are provided
    if (routeMarkers && routeMarkers.length > 0) {
      // Convert route_markers to waypoints
      const waypoints = [];
      // Coords do DESTINO — um routeMarker igual ao destino NÃO vira waypoint
      // (senão a última perna tem tamanho zero e a rota sai meia-traçada). Ele
      // ainda ganha marcador numerado (addRoutePointMarkers usa routeMarkers).
      const _dLat = (destination && typeof destination.lat === 'function') ? destination.lat() : (destination && destination.lat);
      const _dLng = (destination && typeof destination.lng === 'function') ? destination.lng() : (destination && destination.lng);

      for (let i = 0; i < routeMarkers.length; i++) {
        const marker = routeMarkers[i];

        if (!marker || !marker.gps_point) {
          continue;
        }

        // The gps_point might be a GeoPoint object, which can have different formats
        const gpsPoint = marker.gps_point;
        let lat, lng;

        // Try various ways to extract the coordinates
        if (typeof gpsPoint.latitude === 'number') {
          lat = gpsPoint.latitude;
          lng = gpsPoint.longitude;
        } else if (typeof gpsPoint._lat === 'number') {
          lat = gpsPoint._lat;
          lng = gpsPoint._long;
        } else if (typeof gpsPoint.lat === 'function') {
          lat = gpsPoint.lat();
          lng = gpsPoint.lng();
        } else {
          console.warn(`Could not extract coordinates from gps_point for marker ${i}`);
          continue;
        }

        if (isFinite(_dLat) && isFinite(_dLng) &&
            Math.abs(lat - _dLat) < 1e-7 && Math.abs(lng - _dLng) < 1e-7) {
          continue; // é o destino — já entra como `destination`, não como waypoint
        }

        waypoints.push({
          location: new google.maps.LatLng(lat, lng),
          stopover: true
        });
      }
      
      if (waypoints.length > 0) {
        console.log(`Added ${waypoints.length} waypoints to route`);
        request.waypoints = waypoints;
        request.optimizeWaypoints = false; // Keep waypoints in the order they are specified
      }
    }

    // Request the route from Google Directions Service
    directionsService.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK) {
        // Display the route on the map
        directionsRenderer.setDirections(result);
        console.log("Route displayed successfully");
        
        // Add a second, wider polyline underneath for a "glow" effect
        if (result.routes && result.routes.length > 0) {
          // Remove any existing glow effect
          if (window.glowPolyline) {
            window.glowPolyline.setMap(null);
          }
          
          // Create a new glow effect
          window.glowPolyline = new google.maps.Polyline({
            path: result.routes[0].overview_path,
            geodesic: true,
            strokeColor: '#FF5722', // Atualizando para laranja vibrante
            strokeOpacity: 0.4,
            strokeWeight: 10, // Wider than the main line
            zIndex: 1 // Ensure it's under the main line
          });
          
          // Add it to the map
          window.glowPolyline.setMap(map);
        }
        
        // Setas/círculos ficam ESTÁTICOS (já vêm do polylineOptions do renderer).
        // A animação (set('polylineOptions') a ~60fps) re-renderizava a polyline
        // inteira no Directions API atual (depreciado) e a deixava MEIA-TRAÇADA
        // (bug reportado). Decoração permanece; sem o flicker/re-render.
        animationActive = false;
        
        // Only add route point markers if isMultipleRoute is true
        if (isMultipleRoute) {
          console.log("Token has is_multiple_route: true, adding route point markers");
          // Add markers at each point of the route with custom route markers
          addRoutePointMarkers(result, routeMarkers);
        } else {
          console.log("Token has is_multiple_route: false, not adding route point markers");
        }
      } else {
        console.error("Failed to calculate route:", status);
        showError("Não foi possível calcular a rota");
      }
    });
  } catch (error) {
    console.error("Error calculating route:", error);
  }
}

// Collision circles
function addCollisionCircles(marker) {
  const collisionRadius = getQueryParam("collisionRadius") || 20;
  const deviationRadius = getQueryParam("deviationRadius") || 20;

  new google.maps.Circle({
    map: map,
    radius: Number(collisionRadius),
    center: marker.getPosition(),
    strokeColor: "#14A44D",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#14A44D",
    fillOpacity: 0.2,
  });

  new google.maps.Circle({
    map: map,
    radius: Number(deviationRadius),
    center: marker.getPosition(),
    strokeColor: "#FF0000",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FF0000",
    fillOpacity: 0.2,
  });
}

// Utility Functions
function closeInfoWindow() {
  // O caminho VIVO abre um infoWindow de MÓDULO compartilhado (openLiveMarkerInfo)
  // que não fica em markers[].infoWindow — sem fechá-lo aqui, o "X" (onclick=
  // closeInfoWindow) não fechava o popup do operador. Fecha os dois.
  if (infoWindow) infoWindow.close();
  // Close all info windows
  markers.forEach(markerObj => {
    if (markerObj.infoWindow) {
      markerObj.infoWindow.close();
    }
  });
  
  // Close all route point info windows
  routePointMarkers.forEach(marker => {
    if (marker.infoWindow) {
      marker.infoWindow.close();
    }
  });
  
  // Clear the route
  directionsRenderer.set('directions', null);
  
  // Remove the glow effect if it exists
  if (window.glowPolyline) {
    window.glowPolyline.setMap(null);
    window.glowPolyline = null;
  }
  
  // Clear route point markers
  clearRoutePointMarkers();
  
  // Stop arrow animation by clearing any animations
  animationActive = false;
  arrowOffset = 0;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp.seconds * 1000);
  return date.toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '');
}

function getElapsedTime(created_at, updated_at) {
  if (!created_at || !updated_at) return '0m';

  const start = created_at.seconds * 1000;
  const end = updated_at.seconds * 1000;
  const elapsed = end - start;

  // Convert to minutes
  const minutes = Math.floor(elapsed / (1000 * 60));

  return `${minutes}m`;
}

// UI Helpers
function showLoading() {
  if (loadingElement) {
    loadingElement.style.display = 'flex';
  }
}

function hideLoading() {
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
}

function showError(message) {
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add('visible');

    // Auto-hide after 5 seconds
    setTimeout(() => {
      errorElement.classList.remove('visible');
    }, 5000);
  } else {
    console.error(message);
  }
}

// Make these functions available globally
window.closeInfoWindow = closeInfoWindow;
window.toggleInfoDetails = function(button) {
  const detailsElement = button.closest('.info-window-content').querySelector('.info-details');
  const buttonText = button.querySelector('span');
  
  if (detailsElement.style.display === 'none') {
    // Expand
    detailsElement.style.display = 'block';
    setTimeout(() => {
      detailsElement.classList.add('expanded');
    }, 10);
    button.classList.add('expanded');
    button.title = 'Esconder detalhes';
    buttonText.textContent = '- Ocultar';
  } else {
    // Collapse
    detailsElement.classList.remove('expanded');
    button.classList.remove('expanded');
    button.title = 'Mostrar detalhes';
    buttonText.textContent = '+ Detalhes';
    setTimeout(() => {
      detailsElement.style.display = 'none';
    }, 300); // Match the transition duration
  }
};

// Adicione esta função para fechar as janelas de informação dos pontos de rota
window.closeRoutePointInfo = function() {
  routePointMarkers.forEach(marker => {
    if (marker.infoWindow) {
      marker.infoWindow.close();
    }
  });
}; 
// ── Observabilidade do roster vivo (operador/e2e) ──────────────────────────
// Handle read-only p/ depurar "por que não atualiza ao vivo" pelo console e p/
// abrir o popup+rota de um token sem depender de clique por pixel. Same-origin,
// só dado que já está na página do operador.
if (typeof window !== 'undefined') {
  // __aegisRoster (não __aegisLive, que startLive reserva p/ a instância AegisLive).
  window.__aegisRoster = {
    get markers() { return markers; },
    get map() { return map; },
    list() { return markers.map((m) => ({ id: m.id, subject: (m.data && m.data.subject) || '' })); },
    open(tokenId) {
      const e = markers.find((m) => m.id === tokenId);
      if (e) openLiveMarkerInfo(e);
      return !!e;
    },
  };
}
