// --- State ---
let journalEntries = []; // Array to hold { id, timestamp, coordinates, address, notes, photoUrl }
let currentLocation = null; // { latitude, longitude }
let map; // Leaflet map instance
let currentPositionMarker; // Leaflet marker for current position

// --- DOM Elements ---
let mapContainerElement;
let addEntryFormElement;
let notesInputElement;
let photoInputElement;
let photoPreviewElement;
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
    // Get DOM elements
    mapContainerElement = document.getElementById('map');
    addEntryFormElement = document.getElementById('addEntryForm');
    notesInputElement = document.getElementById('notes');
    photoInputElement = document.getElementById('photo');
    photoPreviewElement = document.getElementById('photoPreview');
    entriesListElement = document.getElementById('entriesList');
    currentLocationDisplayElement = document.getElementById('currentLocationDisplay');
    errorDisplayElement = document.getElementById('errorDisplay');
    loadingDisplayElement = document.getElementById('loadingDisplay');
    addEntryButtonElement = document.getElementById('addEntryButton');
    requestPermissionButtonElement = document.getElementById('requestPermissionButton');

    // Initialize map
    initMap();

    // Get initial location
    requestLocationPermission();

    // Setup event listeners
    addEntryFormElement.addEventListener('submit', handleAddEntry);
    photoInputElement.addEventListener('change', handlePhotoPreview);
    if (requestPermissionButtonElement) {
      requestPermissionButtonElement.addEventListener('click', requestLocationPermission);
    }

    // Load entries from localStorage
    loadEntriesFromLocalStorage();
    renderJournalEntries();
    updateMapMarkers();
});

// --- LocalStorage Persistence ---
function saveEntriesToLocalStorage() {
    try {
        localStorage.setItem('geoJournalEntries', JSON.stringify(journalEntries));
    } catch (e) {
        console.error("Error saving to localStorage:", e);
        showErrorMessage("Could not save entries. LocalStorage might be full or disabled.");
    }
}

function loadEntriesFromLocalStorage() {
    try {
        const storedEntries = localStorage.getItem('geoJournalEntries');
        if (storedEntries) {
            journalEntries = JSON.parse(storedEntries);
        }
    } catch (e) {
        console.error("Error loading from localStorage:", e);
        journalEntries = []; // Reset if parsing fails
        showErrorMessage("Could not load previous entries. Data might be corrupted.");
    }
}

// --- Map Functions ---
function initMap() {
    map = L.map(mapContainerElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    // Clear existing markers (except current position)
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== currentPositionMarker) {
            map.removeLayer(layer);
        }
    });

    // Add/Update current location marker
    if (currentLocation) {
        const currentLatLng = [currentLocation.latitude, currentLocation.longitude];
        if (currentPositionMarker) {
            currentPositionMarker.setLatLng(currentLatLng);
        } else {
            currentPositionMarker = L.marker(currentLatLng, {
                icon: L.divIcon({
                    html: '📍', // Simple pin emoji
                    className: 'current-location-icon', // For potential specific styling
                    iconSize: [24, 24],
                    iconAnchor: [12, 24], // Anchor point of the icon
                    popupAnchor: [0, -24] // Popup anchor relative to iconAnchor
                })
            }).addTo(map);
            currentPositionMarker.bindPopup("<b>Your current location</b>");
        }
    }

    // Add journal entry markers
    journalEntries.forEach(entry => {
        const entryLatLng = [entry.coordinates.latitude, entry.coordinates.longitude];
        const marker = L.marker(entryLatLng).addTo(map);
        
        let popupContent = `<b>${entry.address || 'Location Entry'}</b><br>${new Date(entry.timestamp).toLocaleString()}`;
        if (entry.notes) {
            const truncatedNotes = entry.notes.length > 100 ? entry.notes.substring(0, 100) + '...' : entry.notes;
            popupContent += `<br><em>${truncatedNotes.replace(/\n/g, '<br>')}</em>`;
        }
        if (entry.photoUrl) {
            popupContent += `<br><img src="${entry.photoUrl}" alt="Entry photo" style="width:100px; height:auto; margin-top:5px; border-radius:3px;">`;
        }
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
            timeout: 15000, // Increased timeout
            maximumAge: 0  // Force fresh location
        });
    } else {
        showErrorMessage("Geolocation is not supported by your browser.");
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

        // Reverse geocode for area name
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`)
            .then(res => res.json())
            .then(data => {
                const name = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.display_name;
                currentLocationDisplayElement.textContent = `📍 ${name}`;
                currentLocation.address = name; // Add address field to currentLocation
                addEntryButtonElement.disabled = false;
            })
            .catch(err => {
                console.error("Reverse geocoding failed:", err);
                currentLocationDisplayElement.textContent = `Lat: ${currentLocation.latitude.toFixed(4)}, Lon: ${currentLocation.longitude.toFixed(4)}`;
                addEntryButtonElement.disabled = false;
            });
    }
}

function handleLocationError(error) {
    hideLoadingMessage();
    let message = "Error fetching location: ";
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message += "Permission denied. Please enable location services in your browser settings.";
            if (requestPermissionButtonElement) requestPermissionButtonElement.style.display = 'inline-block';
            break;
        case error.POSITION_UNAVAILABLE:
            message += "Location information is unavailable at the moment.";
            break;
        case error.TIMEOUT:
            message += "The request to get user location timed out.";
            break;
        default:
            message += "An unknown error occurred.";
            break;
    }
    showErrorMessage(message);
    addEntryButtonElement.disabled = true;
}

// --- Journal Entry Functions ---
function handleAddEntry(event) {
    event.preventDefault();
    if (!currentLocation) {
        showErrorMessage("Current location not available. Cannot add entry.");
        return;
    }

    const notes = notesInputElement.value.trim();
    const photoFile = photoInputElement.files[0]; // This is used to check if a photo was selected

    // Photo URL is derived from the preview source which is set by handlePhotoPreview
    const photoUrl = (photoPreviewElement.src && photoPreviewElement.src !== document.location.href + "#" && photoPreviewElement.style.display !== 'none') 
                     ? photoPreviewElement.src 
                     : null;

    if (!notes && !photoUrl) {
        showErrorMessage("Please add notes or a photo to create an entry.");
        return;
    }

    const newEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        coordinates: { ...currentLocation },
        address: currentLocation.address || "Unnamed location",

        notes: notes,
        photoUrl: photoUrl
    };

    journalEntries.unshift(newEntry); // Add to the beginning of the array
    saveEntriesToLocalStorage();
    renderJournalEntries();
    updateMapMarkers(); // Update map with the new entry

    // Reset form
    addEntryFormElement.reset(); // Resets text inputs and file input
    photoPreviewElement.src = '#'; // Clear preview
    photoPreviewElement.style.display = 'none';
    notesInputElement.focus();
}

function handlePhotoPreview() {
    const file = photoInputElement.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showErrorMessage("Photo size exceeds 5MB limit. Please choose a smaller file.");
            photoInputElement.value = ""; // Clear the file input
            photoPreviewElement.src = '#';
            photoPreviewElement.style.display = 'none';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            photoPreviewElement.src = e.target.result;
            photoPreviewElement.style.display = 'block';
        }
        reader.onerror = () => {
            showErrorMessage("Error reading photo file.");
            photoPreviewElement.src = '#';
            photoPreviewElement.style.display = 'none';
        }
        reader.readAsDataURL(file);
    } else {
        photoPreviewElement.src = '#';
        photoPreviewElement.style.display = 'none';
    }
}

function renderJournalEntries() {
    entriesListElement.innerHTML = ''; // Clear existing entries
    if (journalEntries.length === 0) {
        entriesListElement.innerHTML = '<p class="muted">No entries yet. Add your first one!</p>';
        return;
    }

    journalEntries.forEach(entry => {
        const entryCard = document.createElement('div');
        entryCard.className = 'entry-card';

        let photoHtml = '';
        if (entry.photoUrl) {
            // Use the existing data-ai-hint from the previous React component
            photoHtml = `<img src="${entry.photoUrl}" alt="${entry.notes || 'Journal photo'}" data-ai-hint="travel landscape">`;
        }

        let notesHtml = '';
        if (entry.notes) {
            // Sanitize notes slightly by replacing < and > to prevent basic HTML injection
            const sanitizedNotes = entry.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            notesHtml = `<p><strong>Notes:</strong> ${sanitizedNotes.replace(/\n/g, '<br>')}</p>`;
        }
        
        const addressDisplay = entry.address || `${entry.coordinates.latitude.toFixed(4)}, ${entry.coordinates.longitude.toFixed(4)}`;

        entryCard.innerHTML = `
            <h4>${addressDisplay}</h4>
            <p class="timestamp">${new Date(entry.timestamp).toLocaleString()}</p>
            ${photoHtml}
            ${notesHtml}
            ${!entry.notes && !entry.photoUrl ? '<p class="muted"><em>No notes or photo for this entry.</em></p>' : ''}
        `;
        entriesListElement.appendChild(entryCard);
    });
}

// --- UI Helper Functions ---
function showErrorMessage(message) {
    if (errorDisplayElement) {
        errorDisplayElement.textContent = message;
        errorDisplayElement.style.display = 'block';
    }
    console.error(message); // Also log to console
}

function hideErrorMessage() {
    if (errorDisplayElement) {
        errorDisplayElement.style.display = 'none';
    }
}

function showLoadingMessage(message) {
    if (loadingDisplayElement) {
        loadingDisplayElement.textContent = message;
        loadingDisplayElement.style.display = 'block';
    }
}

function hideLoadingMessage() {
    if (loadingDisplayElement) {
        loadingDisplayElement.style.display = 'none';
    }
}
