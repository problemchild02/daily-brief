// A short paper "swish" synthesized with the Web Audio API — filtered noise with a
// fast attack and a sweeping band-pass, which is what a turning page mostly is
// acoustically. Generated on the fly so there's no audio file to fetch or cache.

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

function getNoise(audio: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === audio.sampleRate) return noise
  const length = Math.floor(audio.sampleRate * 0.5)
  noise = audio.createBuffer(1, length, audio.sampleRate)
  const data = noise.getChannelData(0)
  // Pink-ish noise (Paul Kellet's economy filter) sounds like paper; white noise
  // sounds like static.
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + white * 0.0990460
    b1 = 0.96300 * b1 + white * 0.2965164
    b2 = 0.57000 * b2 + white * 1.0526913
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2
  }
  return noise
}

export function playPageTurn(): void {
  try {
    const audio = getContext()
    if (!audio) return
    if (audio.state === 'suspended') void audio.resume()

    const now = audio.currentTime
    const src = audio.createBufferSource()
    src.buffer = getNoise(audio)
    src.playbackRate.value = 0.9 + Math.random() * 0.2

    const band = audio.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.9
    band.frequency.setValueAtTime(900, now)
    band.frequency.exponentialRampToValueAtTime(3800, now + 0.16)
    band.frequency.exponentialRampToValueAtTime(1600, now + 0.38)

    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.18)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)

    src.connect(band).connect(gain).connect(audio.destination)
    src.start(now)
    src.stop(now + 0.45)
  } catch {
    // Audio is a nicety; never let it break a page turn.
  }
}
