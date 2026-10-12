import { VLC_WHEEL_VOLUME, VlcAction } from "@/lib/vlc-keymap";
import { YOUTUBE_NATIVE_SHORTCUTS } from "@/lib/youtube-keymap";
import { YOUTUBE_MUSIC_NATIVE_SHORTCUTS } from "@/lib/youtube-music-keymap";

type YoutubeNativeShortcut = typeof YOUTUBE_NATIVE_SHORTCUTS[keyof typeof YOUTUBE_NATIVE_SHORTCUTS];
type MusicNativeShortcut = typeof YOUTUBE_MUSIC_NATIVE_SHORTCUTS[keyof typeof YOUTUBE_MUSIC_NATIVE_SHORTCUTS];
type DialogRowSource = VlcAction | typeof VLC_WHEEL_VOLUME | YoutubeNativeShortcut | MusicNativeShortcut;

// The help dialog lists related shortcuts side by side - VLC's and YouTube's own alike - in this order
const DIALOG_ROW_ORDER: DialogRowSource[] = [
  VlcAction.PlayPause,
  VlcAction.Stop,
  VlcAction.JumpBackwardExtraShort,
  VlcAction.JumpForwardExtraShort,
  VlcAction.JumpBackwardArrow,
  VlcAction.JumpForwardArrow,
  VlcAction.JumpBackwardShort,
  VlcAction.JumpForwardShort,
  VlcAction.JumpBackwardMedium,
  VlcAction.JumpForwardMedium,
  VlcAction.JumpBackwardLong,
  VlcAction.JumpForwardLong,
  YOUTUBE_NATIVE_SHORTCUTS.seekToPercentage,
  YOUTUBE_NATIVE_SHORTCUTS.previousChapter,
  YOUTUBE_NATIVE_SHORTCUTS.nextChapter,
  VlcAction.Previous,
  VlcAction.Next,
  VlcAction.PreviousFrame,
  VlcAction.NextFrame,
  VlcAction.Slower,
  VlcAction.Faster,
  VlcAction.SlowerFine,
  VlcAction.FasterFine,
  VlcAction.NormalSpeed,
  VlcAction.ToggleLoop,
  VlcAction.Shuffle,
  VlcAction.ToggleFullscreen,
  YOUTUBE_NATIVE_SHORTCUTS.theaterMode,
  VlcAction.ToggleMiniplayer,
  YOUTUBE_NATIVE_SHORTCUTS.closeMiniplayerOrDialog,
  YOUTUBE_MUSIC_NATIVE_SHORTCUTS.toggleQueue,
  VlcAction.ToggleMute,
  VlcAction.VolumeUp,
  VlcAction.VolumeDown,
  VLC_WHEEL_VOLUME,
  YOUTUBE_MUSIC_NATIVE_SHORTCUTS.like,
  YOUTUBE_MUSIC_NATIVE_SHORTCUTS.dislike,
  VlcAction.CycleAudioTrack,
  VlcAction.CycleAspectRatio,
  VlcAction.ZoomIn360,
  VlcAction.ZoomOut360,
  VlcAction.PanUp360,
  VlcAction.PanLeft360,
  VlcAction.PanDown360,
  VlcAction.PanRight360,
  VlcAction.Snapshot,
  VlcAction.ToggleControls,
  VlcAction.CycleSubtitles,
  VlcAction.CycleSubtitlesReverse
];

// A row left out of the order still shows, after the ordered ones
export function getDialogRowRank(source: DialogRowSource) {
  const rank = DIALOG_ROW_ORDER.indexOf(source);
  return rank === -1 ? DIALOG_ROW_ORDER.length : rank;
}
