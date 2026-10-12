import { cycleAspectRatio } from "@/lib/hotkeys/actions/aspect-ratio";
import { cycleAudioTrack } from "@/lib/hotkeys/actions/audio-tracks";
import { toggleControls } from "@/lib/hotkeys/actions/controls-visibility";
import { stepFrame } from "@/lib/hotkeys/actions/frame-step";
import { shuffle } from "@/lib/hotkeys/actions/music-queue";
import {
  playNext,
  playPrevious,
  stop,
  toggleFullscreen,
  toggleLoop,
  toggleMiniplayer,
  togglePlayPause
} from "@/lib/hotkeys/actions/playback";
import { takeSnapshot } from "@/lib/hotkeys/actions/snapshot";
import { resetSpeed, SpeedDirection, stepFineSpeed, stepPresetSpeed } from "@/lib/hotkeys/actions/speed";
import { CycleDirection, cycleSubtitles } from "@/lib/hotkeys/actions/subtitles";
import { stepVolume, toggleMute, VolumeDirection } from "@/lib/hotkeys/actions/volume";
import { seekNatively } from "@/lib/hotkeys/native/seek";
import { holdYoutubeHotkey } from "@/lib/hotkeys/youtube-hotkey-dispatch";
import type { YoutubePlayer } from "@/lib/player";
import { JUMP_SECONDS_BY_ACTION, VLC_BINDINGS, VlcAction, type VlcBinding } from "@/lib/vlc-keymap";

// An action YouTube performs for as long as its key is held hands back the release of that key
type ReleaseKey = () => void;
// An action that has to wait for YouTube (switching a subtitle track waits for YouTube's own caption key) runs on
type ActionHandler = (player: YoutubePlayer) => ReleaseKey | Promise<void> | void;

// Holds the binding's YouTube key down until the viewer lets go of the VLC key
function createHoldHandler(action: VlcAction): ActionHandler {
  const hotkey = VLC_BINDINGS.find(binding => binding.action === action)?.youtubeEquivalent;
  return player => hotkey && holdYoutubeHotkey({
    player,
    hotkey
  });
}

function createJumpHandler(action: VlcAction): ActionHandler {
  return player => seekNatively({
    player,
    seconds: JUMP_SECONDS_BY_ACTION.get(action) ?? 0
  });
}

function createVolumeHandler(direction: VolumeDirection): ActionHandler {
  return player => stepVolume({
    player,
    direction
  });
}

function createSubtitlesHandler(direction: CycleDirection): ActionHandler {
  return player => cycleSubtitles({
    player,
    direction
  });
}

function createSpeedHandler({ step, direction }: {
  step: typeof stepPresetSpeed;
  direction: SpeedDirection;
}): ActionHandler {
  return player => step({
    player,
    direction
  });
}

const ACTION_HANDLERS: Record<VlcAction, ActionHandler> = {
  [VlcAction.PlayPause]: togglePlayPause,
  [VlcAction.Stop]: stop,
  [VlcAction.ToggleFullscreen]: toggleFullscreen,
  [VlcAction.Next]: playNext,
  [VlcAction.Previous]: playPrevious,
  [VlcAction.JumpBackwardExtraShort]: createJumpHandler(VlcAction.JumpBackwardExtraShort),
  [VlcAction.JumpForwardExtraShort]: createJumpHandler(VlcAction.JumpForwardExtraShort),
  [VlcAction.JumpBackwardArrow]: createJumpHandler(VlcAction.JumpBackwardArrow),
  [VlcAction.JumpForwardArrow]: createJumpHandler(VlcAction.JumpForwardArrow),
  [VlcAction.JumpBackwardShort]: createJumpHandler(VlcAction.JumpBackwardShort),
  [VlcAction.JumpForwardShort]: createJumpHandler(VlcAction.JumpForwardShort),
  [VlcAction.JumpBackwardMedium]: createJumpHandler(VlcAction.JumpBackwardMedium),
  [VlcAction.JumpForwardMedium]: createJumpHandler(VlcAction.JumpForwardMedium),
  [VlcAction.JumpBackwardLong]: createJumpHandler(VlcAction.JumpBackwardLong),
  [VlcAction.JumpForwardLong]: createJumpHandler(VlcAction.JumpForwardLong),
  [VlcAction.NextFrame]: stepFrame,
  [VlcAction.VolumeUp]: createVolumeHandler(VolumeDirection.Louder),
  [VlcAction.VolumeDown]: createVolumeHandler(VolumeDirection.Quieter),
  [VlcAction.ToggleMute]: toggleMute,
  [VlcAction.Faster]: createSpeedHandler({
    step: stepPresetSpeed,
    direction: SpeedDirection.Faster
  }),
  [VlcAction.Slower]: createSpeedHandler({
    step: stepPresetSpeed,
    direction: SpeedDirection.Slower
  }),
  [VlcAction.FasterFine]: createSpeedHandler({
    step: stepFineSpeed,
    direction: SpeedDirection.Faster
  }),
  [VlcAction.SlowerFine]: createSpeedHandler({
    step: stepFineSpeed,
    direction: SpeedDirection.Slower
  }),
  [VlcAction.NormalSpeed]: resetSpeed,
  [VlcAction.CycleSubtitles]: createSubtitlesHandler(CycleDirection.Forward),
  [VlcAction.CycleSubtitlesReverse]: createSubtitlesHandler(CycleDirection.Backward),
  [VlcAction.CycleAudioTrack]: cycleAudioTrack,
  [VlcAction.CycleAspectRatio]: cycleAspectRatio,
  [VlcAction.ToggleLoop]: toggleLoop,
  [VlcAction.Shuffle]: shuffle,
  [VlcAction.Snapshot]: takeSnapshot,
  [VlcAction.ToggleControls]: toggleControls,
  [VlcAction.ToggleMiniplayer]: toggleMiniplayer,
  [VlcAction.ZoomIn360]: createHoldHandler(VlcAction.ZoomIn360),
  [VlcAction.ZoomOut360]: createHoldHandler(VlcAction.ZoomOut360),
  [VlcAction.PanUp360]: createHoldHandler(VlcAction.PanUp360),
  [VlcAction.PanLeft360]: createHoldHandler(VlcAction.PanLeft360),
  [VlcAction.PanDown360]: createHoldHandler(VlcAction.PanDown360),
  [VlcAction.PanRight360]: createHoldHandler(VlcAction.PanRight360)
};

// Held keys keep stepping like VLC; toggles fire once per press
export function runAction({ binding, player, isRepeat }: {
  binding: VlcBinding;
  player: YoutubePlayer;
  isRepeat: boolean;
}) {
  if (isRepeat && !binding.isRepeatable) {
    return;
  }

  return ACTION_HANDLERS[binding.action](player);
}
