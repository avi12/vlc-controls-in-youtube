import { formatRate, showRateInNativeBezel } from "@/lib/hotkeys/native/speed-bezel";
import { showStatusInNativeBezel } from "@/lib/hotkeys/native/status-bezel";
import { dispatchYoutubeHotkey } from "@/lib/hotkeys/youtube-hotkey-dispatch";
import { getVideo, type YoutubePlayer } from "@/lib/player";
import { FINE_SPEED_STEP, NORMAL_SPEED } from "@/lib/vlc-keymap";
import { YOUTUBE_HOTKEYS } from "@/lib/youtube-keymap";

const RATE_PRECISION = 100;
const RATE_EPSILON = 0.001;

export enum SpeedDirection {
  Faster = 1,
  Slower = -1
}

function roundRate(rate: number) {
  return Math.round(rate * RATE_PRECISION) / RATE_PRECISION;
}

// Presets go through the API; YouTube may snap off-preset rates, so those fall back to the <video>
function applyRate({ player, rate }: {
  player: YoutubePlayer;
  rate: number;
}) {
  player.setPlaybackRate(rate);
  const isRateApplied = Math.abs(player.getPlaybackRate() - rate) < RATE_EPSILON;
  const elVideo = getVideo(player);
  if (!isRateApplied && elVideo) {
    elVideo.playbackRate = rate;
  }

  return rate;
}

function getCurrentRate(player: YoutubePlayer) {
  return getVideo(player)?.playbackRate ?? player.getPlaybackRate();
}

function stepPresetSpeedSilently({ player, direction }: {
  player: YoutubePlayer;
  direction: SpeedDirection;
}) {
  const rates = player.getAvailablePlaybackRates();
  const currentRate = player.getPlaybackRate();
  const nextRate = direction === SpeedDirection.Faster ?
    rates.find(rate => rate > currentRate) :
    rates.findLast(rate => rate < currentRate);
  if (nextRate === undefined) {
    return;
  }

  player.setPlaybackRate(nextRate);
  showStatusInNativeBezel({
    player,
    text: formatRate(nextRate)
  });
}

// VLC's preset steps map onto YouTube's own speed keys, which walk the same preset list
export function stepPresetSpeed({ player, direction }: {
  player: YoutubePlayer;
  direction: SpeedDirection;
}) {
  dispatchYoutubeHotkey({
    player,
    hotkey: direction === SpeedDirection.Faster ? YOUTUBE_HOTKEYS.faster : YOUTUBE_HOTKEYS.slower,
    fallback: () => stepPresetSpeedSilently({
      player,
      direction
    })
  });
}

export function stepFineSpeed({ player, direction }: {
  player: YoutubePlayer;
  direction: SpeedDirection;
}) {
  const rates = player.getAvailablePlaybackRates();
  const targetRate = roundRate(getCurrentRate(player) + direction * FINE_SPEED_STEP);
  const slowestRate = Math.min(...rates);
  const fastestRate = Math.max(...rates);
  const rate = Math.min(Math.max(targetRate, slowestRate), fastestRate);
  showRateInNativeBezel({
    player,
    applyRate: () => applyRate({
      player,
      rate
    })
  });
}

// The right-click menu offers YouTube's own preset rates, named the way YouTube's speed bezel names them
export function getSpeedLabels(player: YoutubePlayer) {
  return player.getAvailablePlaybackRates().map(formatRate);
}

export function getSpeedLabel(player: YoutubePlayer) {
  return formatRate(roundRate(getCurrentRate(player)));
}

export function selectSpeedLabel({ player, label }: {
  player: YoutubePlayer;
  label: string;
}) {
  const rate = player.getAvailablePlaybackRates().find(candidate => formatRate(candidate) === label);
  if (rate === undefined) {
    return;
  }

  showRateInNativeBezel({
    player,
    applyRate: () => applyRate({
      player,
      rate
    })
  });
}

export function resetSpeed(player: YoutubePlayer) {
  showRateInNativeBezel({
    player,
    applyRate: () => applyRate({
      player,
      rate: NORMAL_SPEED
    })
  });
}
