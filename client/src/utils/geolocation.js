// Helpers for the browser's GPS: one-off position, continuous tracking and friendly error messages.

// getUserLocation() - one-time GPS reading wrapped in a Promise. 1) browser without geolocation ->
// reject with a message 2) otherwise ask for a fresh high-accuracy position (10 s timeout, never reuse
// an old reading) 3) resolve with the position or reject with the error.
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })
}

// geolocationMessage(err) - turns a browser location error into friendly text: permission denied,
// position unavailable, timeout, or the error's own message.
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

let watchId = null;

// startTracking(onPosition, onError, options) - starts continuous GPS watching. 1) stop any watch
// already running 2) call watchPosition so onPosition runs on every new fix and onError on failures 3)
// remember and return the watch id.
export function startTracking(onPosition, onError, options = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }) {
  if (watchId !== null) {
    stopTracking();
  }

  watchId = navigator.geolocation.watchPosition(onPosition, onError, options);
  return watchId;
}

// stopTracking() - 1) if a watch is running, clear it 2) forget the id.
export function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
