import { toggleRepeat } from "@/lib/hotkeys/actions/music-queue";
import { showStatusInNativeBezel } from "@/lib/hotkeys/native/status-bezel";
import { dispatchYoutubeHotkey } from "@/lib/hotkeys/youtube-hotkey-dispatch";
import { getVideo, isPlaying, isShortsPlayer, type YoutubePlayer } from "@/lib/player";
import { isMusicSite } from "@/lib/site";
import { YOUTUBE_HOTKEYS } from "@/lib/youtube-keymap";

const START_SECONDS = 0;

enum LoopStatus {
  On = "Loop on",
  Off = "Loop off"
}

// Shorts' own next/previous buttons; its player swallows the arrow keys Shorts otherwise moves with
enum ShortsNavigationButton {
  Next = "#navigation-button-down button",
  Previous = "#navigation-button-up button"
}

export function togglePlayPause(player: YoutubePlayer) {
  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.playPause
  });
}

// VLC's stop: YouTube's own pause (with its bezel), then back to the start
export function stop(player: YoutubePlayer) {
  if (isPlaying(player)) {
    togglePlayPause(player);
  }

  player.seekTo(START_SECONDS, true);
}

function clickShortsNavigation(button: ShortsNavigationButton) {
  document.querySelector<HTMLElement>(button)?.click();
}

// On Shorts the next and previous video are the next and previous short
export function playNext(player: YoutubePlayer) {
  if (isShortsPlayer(player)) {
    clickShortsNavigation(ShortsNavigationButton.Next);
    return;
  }

  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.next
  });
}

export function playPrevious(player: YoutubePlayer) {
  if (isShortsPlayer(player)) {
    clickShortsNavigation(ShortsNavigationButton.Previous);
    return;
  }

  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.previous
  });
}

// On YouTube Music the loop is Music's own repeat, so its player bar shows it
export function toggleLoop(player: YoutubePlayer) {
  if (isMusicSite()) {
    toggleRepeat(player);
    return;
  }

  const elVideo = getVideo(player);
  if (!elVideo) {
    return;
  }

  elVideo.loop = !elVideo.loop;
  player.setLoopVideo?.(elVideo.loop);
  showStatusInNativeBezel({
    player,
    text: elVideo.loop ? LoopStatus.On : LoopStatus.Off
  });
}

export function toggleFullscreen(player: YoutubePlayer) {
  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.fullscreen
  });
}

export function toggleMiniplayer(player: YoutubePlayer) {
  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.miniplayer
  });
}

export function showMoreVideos(player: YoutubePlayer) {
  dispatchYoutubeHotkey({
    player,
    hotkey: YOUTUBE_HOTKEYS.moreVideos
  });
}
