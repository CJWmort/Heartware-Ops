
// one-time request for the user's location
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, // use GPS if available
      timeout: 10000,
      maximumAge: 0, // always fetch fresh location
    })
  })
}

export function geolocationMessage(err) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission was denied. Allow it in your browser settings and reload.'
    case err.POSITION_UNAVAILABLE:
      return 'Location information is unavailable.'
    case err.TIMEOUT:
      return 'Getting your location timed out. Try again.'
    default:
      return err.message || 'Could not get your location.'
  }
}

// Continuously tracks changes over time
let watchId = null;

export function startTracking(onPosition, onError, options = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }) {
  // Clear any existing watch before starting a new one
  if (watchId !== null) {
    stopTracking();
  }

  watchId = navigator.geolocation.watchPosition(onPosition, onError, options);
  return watchId;
}

// Stop watching the user's location.
export function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
