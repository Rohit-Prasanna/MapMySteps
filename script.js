// --- State ---
let journalEntries = [];
let currentLocation = null;
let map;
let currentPositionMarker;

// --- DOM Elements ---
let mapContainerElement;
let entriesListElement;
let currentLocationDisplayElement;
let errorDisplayElement;
let loadingDisplayElement;
let addEntryButtonElement;
let requestPermissionButtonElement;

// --- Constants ---
const DEFAULT_CENTER = [34.0522, -118.2437]; // Los Angeles
const DEFAULT_ZOOM = 13;
const INITIAL_ZOOM_CURRENT_LOCATION = 15;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    mapContainerElement = document.getElementById('map');
    entriesListElement = document.getElementById('entriesList');
    currentLocationDisplayElement = document.getElementById('currentLocationDisplay');
    errorDisplayElement = document.getElementById('errorDisplay');
    loadingDisplayElement = document.getElementById('loadingDisplay');
    addEntryButtonElement = document.getElementById('addEntryButton');
    requestPermissionButtonElement = document.getElementById('requestPermissionButton');

    initMap();
    requestLocationPermission();

    if (addEntryButtonElement) {
        addEntryButtonElement.addEventListener('click', handleAddEntry);
    }

    if (requestPermissionButtonElement) {
        requestPermissionButtonElement.addEventListener('click', requestLocationPermission);
    }

    loadEntriesFromLocalStorage();
    renderJournalEntries();
    updateMapMarkers();
});

// --- LocalStorage ---
function saveEntriesToLocalStorage() {
    try {
        localStorage.setItem('geoJournalEntries', JSON.stringify(journalEntries));
    } catch (e) {
        console.error("Error saving to localStorage:", e);
        showErrorMessage("Could not save entries.");
    }
}

function loadEntriesFromLocalStorage() {
    try {
        const stored = localStorage.getItem('geoJournalEntries');
        if (stored) journalEntries = JSON.parse(stored);
    } catch (e) {
        console.error("Error loading from localStorage:", e);
        journalEntries = [];
        showErrorMessage("Could not load entries.");
    }
}

// --- Map Functions ---
function initMap() {
    map = L.map(mapContainerElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(map);
}

function updateMapCenter(zoomLevel = DEFAULT_ZOOM) {
    if (currentLocation) {
        map.setView([currentLocation.latitude, currentLocation.longitude], zoomLevel);
    } else if (journalEntries.length > 0) {
        map.setView([journalEntries[0].coordinates.latitude, journalEntries[0].coordinates.longitude], DEFAULT_ZOOM);
    } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
}

function updateMapMarkers() {
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== currentPositionMarker) {
            map.removeLayer(layer);
        }
    });

    if (currentLocation) {
        const currentLatLng = [currentLocation.latitude, currentLocation.longitude];
        if (currentPositionMarker) {
            currentPositionMarker.setLatLng(currentLatLng);
        } else {
            currentPositionMarker = L.marker(currentLatLng, {
                icon: L.divIcon({
                    html: '📍',
                    className: 'current-location-icon',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24],
                    popupAnchor: [0, -24]
                })
            }).addTo(map);
            currentPositionMarker.bindPopup("<b>Your current location</b>");
        }
    }

    journalEntries.forEach(entry => {
        const entryLatLng = [entry.coordinates.latitude, entry.coordinates.longitude];
        const marker = L.marker(entryLatLng).addTo(map);
        const popupContent = `<b>${entry.address || 'Location Entry'}</b><br>${new Date(entry.timestamp).toLocaleString()}`;
        marker.bindPopup(popupContent);
    });
}

// --- Location Functions ---
function requestLocationPermission() {
    if (navigator.geolocation) {
        showLoadingMessage("Fetching your location...");
        hideErrorMessage();
        if (requestPermissionButtonElement) requestPermissionButtonElement.style.display = 'none';

        navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        });
    } else {
        showErrorMessage("Geolocation not supported.");
        hideLoadingMessage();
    }
}

function handleLocationSuccess(position) {
    hideLoadingMessage();
    hideErrorMessage();

    const newLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
    };

    const locationChanged =
        !currentLocation ||
        Math.abs(currentLocation.latitude - newLocation.latitude) > 0.00001 ||
        Math.abs(currentLocation.longitude - newLocation.longitude) > 0.00001;

    if (locationChanged) {
        const isFirstFix = !currentLocation;
        currentLocation = newLocation;
        updateMapCenter(isFirstFix ? INITIAL_ZOOM_CURRENT_LOCATION : map.getZoom());
        updateMapMarkers();

        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`)
            .then(res => res.json())
            .then(data => {
                const name = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.display_name;
                currentLocationDisplayElement.textContent = `📍 ${name}`;
                currentLocation.address = name;
                handleAddEntry();

            })
            .catch(err => {
                console.error("Reverse geocoding failed:", err);
                currentLocationDisplayElement.textContent = `Lat: ${currentLocation.latitude.toFixed(4)}, Lon: ${currentLocation.longitude.toFixed(4)}`;

                handleAddEntry();

            });
    }
}

function handleLocationError(error) {
    hideLoadingMessage();
    let message = "Location error: ";
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message += "Permission denied.";
            if (requestPermissionButtonElement) requestPermissionButtonElement.style.display = 'inline-block';
            break;
        case error.POSITION_UNAVAILABLE:
            message += "Position unavailable.";
            break;
        case error.TIMEOUT:
            message += "Timeout getting location.";
            break;
        default:
            message += "Unknown error.";
    }
    showErrorMessage(message);
    addEntryButtonElement.disabled = true;
}

// --- Journal Entry Logic ---
function handleAddEntry() {
    if (!currentLocation) {
        showErrorMessage("Current location not available.");
        return;
    }
    

    const newEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        coordinates: { ...currentLocation },
        address: currentLocation.address || "Unnamed location"
    };

    if (isDuplicateEntry(newEntry)) {
        showErrorMessage("Duplicate entry: same location recently added.");
        return;
    }

    journalEntries.unshift(newEntry);
    saveEntriesToLocalStorage();
    renderJournalEntries();
    updateMapMarkers();
}

function renderJournalEntries() {
    entriesListElement.innerHTML = '';
    if (journalEntries.length === 0) {
        entriesListElement.innerHTML = '<p class="muted">No entries yet.</p>';
        return;
    }

    journalEntries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        const address = entry.address || `${entry.coordinates.latitude.toFixed(4)}, ${entry.coordinates.longitude.toFixed(4)}`;
        card.innerHTML = `
            <h4>${address}</h4>
            <p class="timestamp">${new Date(entry.timestamp).toLocaleString()}</p>
        `;
        entriesListElement.appendChild(card);
    });
}

// --- UI Helpers ---
function showErrorMessage(msg) {
    if (errorDisplayElement) {
        errorDisplayElement.textContent = msg;
        errorDisplayElement.style.display = 'block';
    }
    console.error(msg);
}

function hideErrorMessage() {
    if (errorDisplayElement) errorDisplayElement.style.display = 'none';
}

function showLoadingMessage(msg) {
    if (loadingDisplayElement) {
        loadingDisplayElement.textContent = msg;
        loadingDisplayElement.style.display = 'block';
    }
}

function hideLoadingMessage() {
    if (loadingDisplayElement) loadingDisplayElement.style.display = 'none';
}

function isDuplicateEntry(newEntry) {
    const TIME_WINDOW_MS = 600 * 1000;
    const DISTANCE_THRESHOLD_METERS = 100;

    return journalEntries.some(entry => {
        const timeDiff = Math.abs(entry.timestamp - newEntry.timestamp);
        const distance = getDistanceInMeters(entry.coordinates, newEntry.coordinates);
        return timeDiff <= TIME_WINDOW_MS && distance <= DISTANCE_THRESHOLD_METERS;
    });
}


function getDistanceInMeters(coord1, coord2) {
    const R = 6371000; // Earth radius in meters
    const toRad = deg => deg * Math.PI / 180;

    const lat1 = coord1.latitude;
    const lon1 = coord1.longitude;
    const lat2 = coord2.latitude;
    const lon2 = coord2.longitude;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

// async function handleAddEntry() {
//     if (!navigator.geolocation) {
//         showErrorMessage("Geolocation is not supported by your browser.");
//         return;
//     }

//     navigator.geolocation.getCurrentPosition(async position => {
//         const { latitude, longitude } = position.coords;

//         try {
//             const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
//             const data = await response.json();

//             const locality = data.address.city || data.address.town || data.address.village || data.address.suburb || "Unknown area";

//             const newEntry = {
//                 id: Date.now().toString(),
//                 timestamp: Date.now(),
//                 locality
//             };

//             journalEntries.push(newEntry);
//             localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
//             renderJournalEntries();
//             updateMapMarkers();

//         } catch (error) {
//             showErrorMessage("Failed to fetch locality. Try again.");
//         }
//     }, () => {
//         showErrorMessage("Unable to retrieve your location.");
//     }, { enableHighAccuracy: true });
// }

