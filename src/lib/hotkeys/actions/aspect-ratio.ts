import { showStatusInNativeBezel } from "@/lib/hotkeys/native/status-bezel";
import { getVideo, isMainVideo, isSphericalVideo, type YoutubePlayer } from "@/lib/player";

const ASPECT_RATIO_CLASS = "vlc-controls-aspect-ratio";
const ASPECT_RATIO_STATUS_PREFIX = "Aspect ratio: ";
const SPHERICAL_UNAVAILABLE_LABEL = "not available on 360° videos";

enum VideoBoxProperty {
  Top = "--vlc-controls-video-top",
  Left = "--vlc-controls-video-left",
  Width = "--vlc-controls-video-width",
  Height = "--vlc-controls-video-height"
}

// VLC's aspect ratio menu, in its cycle order - the same list the right-click menu offers
export const ASPECT_RATIOS = [
  {
    label: "Default",
    ratio: null
  },
  {
    label: "16:9",
    ratio: 16 / 9
  },
  {
    label: "4:3",
    ratio: 4 / 3
  },
  {
    label: "1:1",
    ratio: 1
  },
  {
    label: "16:10",
    ratio: 16 / 10
  },
  {
    label: "2.21:1",
    ratio: 2.21
  },
  {
    label: "2.35:1",
    ratio: 2.35
  },
  {
    label: "2.39:1",
    ratio: 2.39
  },
  {
    label: "5:4",
    ratio: 5 / 4
  }
] as const;

type AspectRatio = typeof ASPECT_RATIOS[number];

const [DEFAULT_ASPECT_RATIO] = ASPECT_RATIOS;
let currentAspectRatio: AspectRatio = DEFAULT_ASPECT_RATIO;
let resizeObserver: ResizeObserver | null = null;

function toPixels(value: number) {
  return `${value}px`;
}

function fitVideoBox({ player, ratio }: {
  player: YoutubePlayer;
  ratio: number;
}) {
  const elVideo = getVideo(player);
  const elVideoParent = elVideo?.offsetParent;
  if (!elVideoParent) {
    return;
  }

  const playerRect = player.getBoundingClientRect();
  const parentRect = elVideoParent.getBoundingClientRect();
  const isPlayerWider = playerRect.width / playerRect.height > ratio;
  const width = isPlayerWider ? playerRect.height * ratio : playerRect.width;
  const height = isPlayerWider ? playerRect.height : playerRect.width / ratio;
  const boxValues = {
    [VideoBoxProperty.Top]: playerRect.top - parentRect.top + (playerRect.height - height) / 2,
    [VideoBoxProperty.Left]: playerRect.left - parentRect.left + (playerRect.width - width) / 2,
    [VideoBoxProperty.Width]: width,
    [VideoBoxProperty.Height]: height
  };
  for (const [property, value] of Object.entries(boxValues)) {
    player.style.setProperty(property, toPixels(value));
  }
}

function clearAspectRatio(elPlayer: HTMLElement) {
  elPlayer.classList.remove(ASPECT_RATIO_CLASS);
  for (const property of Object.values(VideoBoxProperty)) {
    elPlayer.style.removeProperty(property);
  }
}

export function resetAspectRatio() {
  currentAspectRatio = DEFAULT_ASPECT_RATIO;
  resizeObserver?.disconnect();
  resizeObserver = null;
  for (const elPlayer of document.querySelectorAll(`.${ASPECT_RATIO_CLASS}`)) {
    if (elPlayer instanceof HTMLElement) {
      clearAspectRatio(elPlayer);
    }
  }
}

export function getAspectRatioLabel() {
  return currentAspectRatio.label;
}

// YouTube draws a 360° video onto its own canvas with no setting for the view's shape, so there the aspect ratio
// is left alone rather than stretching the view
function applyAspectRatio({ player, aspectRatio }: {
  player: YoutubePlayer;
  aspectRatio: AspectRatio;
}) {
  if (isSphericalVideo(player)) {
    showStatusInNativeBezel({
      player,
      text: `${ASPECT_RATIO_STATUS_PREFIX}${SPHERICAL_UNAVAILABLE_LABEL}`
    });
    return;
  }

  const { label, ratio } = aspectRatio;
  resetAspectRatio();
  currentAspectRatio = aspectRatio;
  showStatusInNativeBezel({
    player,
    text: `${ASPECT_RATIO_STATUS_PREFIX}${label}`
  });

  if (ratio === null) {
    return;
  }

  player.classList.add(ASPECT_RATIO_CLASS);
  resizeObserver = new ResizeObserver(() => fitVideoBox({
    player,
    ratio
  }));
  resizeObserver.observe(player);
}

export function cycleAspectRatio(player: YoutubePlayer) {
  const iNext = (ASPECT_RATIOS.indexOf(currentAspectRatio) + 1) % ASPECT_RATIOS.length;
  applyAspectRatio({
    player,
    aspectRatio: ASPECT_RATIOS[iNext] ?? DEFAULT_ASPECT_RATIO
  });
}

export function selectAspectRatio({ player, label }: {
  player: YoutubePlayer;
  label: string;
}) {
  const aspectRatio = ASPECT_RATIOS.find(option => option.label === label);
  if (!aspectRatio) {
    return;
  }

  applyAspectRatio({
    player,
    aspectRatio
  });
}

export function installAspectRatioReset() {
  document.addEventListener("loadstart", e => {
    if (isMainVideo(e.target)) {
      resetAspectRatio();
    }
  }, {
    capture: true
  });
  document.addEventListener("yt-navigate-finish", resetAspectRatio);
}
