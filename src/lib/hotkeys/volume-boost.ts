import { getVideo, type YoutubePlayer } from "@/lib/player";

// YouTube's player tops out at 100%; VLC's volume keys go on to 200% (AOUT_VOLUME_MAX), boosted by the browser's own
// audio gain on top of YouTube's full volume
export const MAX_PLAYER_VOLUME = 100;
const MAX_BOOSTED_VOLUME = 200;
const UNBOOSTED_GAIN = 1;
const PERCENT = 100;

const gainsByVideo = new WeakMap<HTMLVideoElement, GainNode>();

// YouTube's own volume dropping below 100% (its slider, or a key) ends the boost
function endBoostWhenYoutubeLowersVolume({ player, gain }: {
  player: YoutubePlayer;
  gain: GainNode;
}) {
  return () => {
    if (player.getVolume() < MAX_PLAYER_VOLUME) {
      gain.gain.value = UNBOOSTED_GAIN;
    }
  };
}

// The video is routed into the audio context only once the context is running: routed into a context the browser
// keeps suspended, it would go silent. Firefox starts a context a beat after creating it, Chrome right away
async function routeVideoWhenRunning({ context, elVideo, gain }: {
  context: AudioContext;
  elVideo: HTMLVideoElement;
  gain: GainNode;
}) {
  if (context.state !== "running") {
    await context.resume();
  }

  if (context.state !== "running") {
    return;
  }

  context.createMediaElementSource(elVideo).connect(gain).connect(context.destination);
}

// A media element can be routed through audio processing only once. Browsers start an audio context only on a page
// the viewer has interacted with - once they have, the wheel (not a user gesture by itself) can boost too
function connectGain({ player, elVideo }: {
  player: YoutubePlayer;
  elVideo: HTMLVideoElement;
}) {
  const existingGain = gainsByVideo.get(elVideo);
  if (existingGain) {
    return existingGain;
  }

  if (!navigator.userActivation.hasBeenActive) {
    return null;
  }

  const context = new AudioContext();
  const gain = context.createGain();
  // The gain is handed back at once and the video joins the graph as soon as the context is running, so the
  // volume this boost was asked for is already set by the time any sound goes through it
  queueMicrotask(async () => {
    await routeVideoWhenRunning({
      context,
      elVideo,
      gain
    });
  });
  gainsByVideo.set(elVideo, gain);
  elVideo.addEventListener(
    "volumechange", endBoostWhenYoutubeLowersVolume({
      player,
      gain
    })
  );
  return gain;
}

function getGain(player: YoutubePlayer) {
  const elVideo = getVideo(player);
  return elVideo ? gainsByVideo.get(elVideo) : undefined;
}

export function getBoostedVolume(player: YoutubePlayer) {
  const gain = getGain(player)?.gain.value ?? UNBOOSTED_GAIN;
  return Math.round(gain * MAX_PLAYER_VOLUME);
}

// Tells the volume actually set, or null when the boost can't be applied
export function setBoostedVolume({ player, volume }: {
  player: YoutubePlayer;
  volume: number;
}) {
  const elVideo = getVideo(player);
  const gain = elVideo ? connectGain({
    player,
    elVideo
  }) : null;
  if (!gain) {
    return null;
  }

  const boostedVolume = Math.min(Math.max(volume, MAX_PLAYER_VOLUME), MAX_BOOSTED_VOLUME);
  gain.gain.value = boostedVolume / PERCENT;
  return boostedVolume;
}

export function resetVolumeBoost() {
  for (const elVideo of document.querySelectorAll("video")) {
    const gain = gainsByVideo.get(elVideo);
    if (gain) {
      gain.gain.value = UNBOOSTED_GAIN;
    }
  }
}
