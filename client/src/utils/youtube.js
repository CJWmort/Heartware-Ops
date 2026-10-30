// Loads the YouTube iframe API script once so the video players can use it.

export const HEARTWARE_VIDEO_ID = 'pSg-DubiZK0'
export const HEARTWARE_SHORT_ID = 'UxlLOv2rBpM'

export const PLAYER_STATE = Object.freeze({
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
})

let apiPromise = null

// loadYouTubeApi() - loads the YouTube iframe script once and returns a promise for the YT object; if
// the script is already there it returns at once, and if loading fails the next call tries again.
export function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    // onYouTubeIframeAPIReady - YouTube calls this when ready: run any earlier handler too, then
    // resolve the promise.
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    // tag.onerror - the script could not load: clear the saved promise so a retry works, and reject
    // with an error.
    tag.onerror = () => {
      apiPromise = null
      reject(new Error('The YouTube player could not be loaded.'))
    }
    document.head.appendChild(tag)
  })
  return apiPromise
}