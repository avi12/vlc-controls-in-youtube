import { isVlcControlsEnabled, onEnabledChange } from "@/lib/enabled-flag";
import { installAspectRatioReset, resetAspectRatio } from "@/lib/hotkeys/actions/aspect-ratio";
import { showAllControls } from "@/lib/hotkeys/actions/controls-visibility";
import { installPlayerEntryTracking, isEventInside, isKeyForPage, isModifiedKey } from "@/lib/hotkeys/event-targets";
import { installBezelRegistry } from "@/lib/hotkeys/native/bezel-component";
import { runAction } from "@/lib/hotkeys/run-action";
import { resetVolumeBoost } from "@/lib/hotkeys/volume-boost";
import { installWheelVolume } from "@/lib/hotkeys/wheel-volume";
import { isDispatchedYoutubeHotkey } from "@/lib/hotkeys/youtube-hotkey-dispatch";
import { getPlayer, isShortsPlayer, isSphericalVideo, type YoutubePlayer } from "@/lib/player";
import { getSite, isMusicSite } from "@/lib/site";
import { findBindings, type VlcBinding } from "@/lib/vlc-keymap";
import { isReplacedYoutubeKey, isShortsNavigationKey } from "@/lib/youtube-keymap";
import { isMusicNavigationPrefix } from "@/lib/youtube-music-keymap";

// Swallowed on keydown, so the matching keypress/keyup never reach YouTube either. Each keydown decides afresh,
// since a keyup can be lost (Ctrl+H opening the history tab) and the key may next be typed into a text box
const swallowedKeyCodes = new Set<string>();
// YouTube keys held down for as long as the viewer holds the VLC key that pressed them
const releaseByKeyCode = new Map<string, () => void>();
// The key after YouTube Music's "g" completes one of Music's navigation keys
let isAfterMusicNavigationPrefix = false;

function releaseHeldKey(code: string) {
  releaseByKeyCode.get(code)?.();
  releaseByKeyCode.delete(code);
}

// A keyup lost to another window or tab would leave YouTube's key held
function releaseAllHeldKeys() {
  for (const code of releaseByKeyCode.keys()) {
    releaseHeldKey(code);
  }
}

function swallow(e: KeyboardEvent) {
  e.stopImmediatePropagation();
  swallowedKeyCodes.add(e.code);
}

function getTargetPlayer(e: KeyboardEvent) {
  const player = isVlcControlsEnabled() && !e.isComposing ? getPlayer() : null;
  if (!player || isKeyForPage({
    e,
    elPlayer: player
  })) {
    return null;
  }

  return player;
}

// YouTube's player reads Alt+Arrow as a plain arrow, so a VLC combo left to the browser (Alt+Left goes back) is kept
// from the focused player, or it would also seek 5 seconds
function isVlcComboLeftToBrowser(e: KeyboardEvent) {
  const player = isVlcControlsEnabled() ? getPlayer() : null;
  const isPlayerFocused = player !== null && isEventInside({
    e,
    elContainer: player
  });
  return isPlayerFocused && isModifiedKey(e) && findBindings(e).length > 0;
}

function isBindingActive({ binding, player, e }: {
  binding: VlcBinding;
  player: YoutubePlayer;
  e: KeyboardEvent;
}) {
  const isSiteSupported = !binding.site || binding.site === getSite();
  const isVideoSupported = !binding.isSphericalOnly || isSphericalVideo(player);
  const isFocusSupported = !binding.isPlayerFocusOnly || isEventInside({
    e,
    elContainer: player
  });
  return isSiteSupported && isVideoSupported && isFocusSupported;
}

function findActiveBinding({ e, player }: {
  e: KeyboardEvent;
  player: YoutubePlayer;
}) {
  const activeBindings = findBindings(e).filter(binding => isBindingActive({
    binding,
    player,
    e
  }));
  return activeBindings.find(binding => binding.isSphericalOnly) ?? activeBindings[0];
}

function onKeyDown(e: KeyboardEvent) {
  if (isDispatchedYoutubeHotkey(e)) {
    return;
  }

  swallowedKeyCodes.delete(e.code);
  const isMusicNavigation = isAfterMusicNavigationPrefix;
  isAfterMusicNavigationPrefix = isMusicSite() && isMusicNavigationPrefix(e);
  const player = getTargetPlayer(e);
  const isShortsNavigation = player !== null && isShortsPlayer(player) && isShortsNavigationKey(e);
  if (!player && isVlcComboLeftToBrowser(e)) {
    swallow(e);
    return;
  }

  if (!player || isShortsNavigation || isMusicNavigation) {
    return;
  }

  const binding = findActiveBinding({
    e,
    player
  });
  if (binding) {
    e.preventDefault();
    swallow(e);
    const release = runAction({
      binding,
      player,
      isRepeat: e.repeat
    });
    if (typeof release === "function") {
      releaseByKeyCode.set(e.code, release);
    }

    return;
  }

  // YouTube Music's own keys that VLC doesn't bind keep working there
  const isReplacedKey = !isMusicSite() && isReplacedYoutubeKey(e);
  if (isReplacedKey) {
    swallow(e);
  }
}

function onKeyPress(e: KeyboardEvent) {
  if (swallowedKeyCodes.has(e.code)) {
    e.stopImmediatePropagation();
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (!swallowedKeyCodes.delete(e.code)) {
    return;
  }

  e.stopImmediatePropagation();
  releaseHeldKey(e.code);
}

function undoSideEffects(isEnabled: boolean) {
  if (isEnabled) {
    return;
  }

  resetAspectRatio();
  showAllControls();
  resetVolumeBoost();
}

export function installHotkeys() {
  installBezelRegistry();
  addEventListener("keydown", onKeyDown, {
    capture: true
  });
  addEventListener("keypress", onKeyPress, {
    capture: true
  });
  addEventListener("keyup", onKeyUp, {
    capture: true
  });
  addEventListener("blur", releaseAllHeldKeys);
  installPlayerEntryTracking();
  installWheelVolume();
  installAspectRatioReset();
  onEnabledChange(undoSideEffects);
}
