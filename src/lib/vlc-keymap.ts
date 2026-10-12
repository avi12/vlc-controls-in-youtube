import { formatRate } from "@/lib/hotkeys/native/speed-bezel";
import {
  formatCombos,
  isComboMatch,
  type KeyCombo,
  KeymapSection,
  type ShortcutStyle
} from "@/lib/shortcut";
import { Site } from "@/lib/site";
import { YOUTUBE_360_HOTKEYS, YOUTUBE_HOTKEYS, type YoutubeHotkey } from "@/lib/youtube-keymap";
import { YOUTUBE_MUSIC_HOTKEYS } from "@/lib/youtube-music-keymap";

export enum VlcAction {
  PlayPause = "play-pause",
  Stop = "stop",
  ToggleFullscreen = "toggle-fullscreen",
  Next = "next",
  Previous = "previous",
  JumpBackwardExtraShort = "jump-backward-extra-short",
  JumpForwardExtraShort = "jump-forward-extra-short",
  JumpBackwardArrow = "jump-backward-arrow",
  JumpForwardArrow = "jump-forward-arrow",
  JumpBackwardShort = "jump-backward-short",
  JumpForwardShort = "jump-forward-short",
  JumpBackwardMedium = "jump-backward-medium",
  JumpForwardMedium = "jump-forward-medium",
  JumpBackwardLong = "jump-backward-long",
  JumpForwardLong = "jump-forward-long",
  NextFrame = "next-frame",
  VolumeUp = "volume-up",
  VolumeDown = "volume-down",
  ToggleMute = "toggle-mute",
  Slower = "slower",
  Faster = "faster",
  SlowerFine = "slower-fine",
  FasterFine = "faster-fine",
  NormalSpeed = "normal-speed",
  CycleSubtitles = "cycle-subtitles",
  CycleSubtitlesReverse = "cycle-subtitles-reverse",
  CycleAudioTrack = "cycle-audio-track",
  CycleAspectRatio = "cycle-aspect-ratio",
  ToggleLoop = "toggle-loop",
  Shuffle = "shuffle",
  Snapshot = "snapshot",
  ToggleControls = "toggle-controls",
  ToggleMiniplayer = "toggle-miniplayer",
  ZoomIn360 = "zoom-in-360",
  ZoomOut360 = "zoom-out-360",
  PanUp360 = "pan-up-360",
  PanLeft360 = "pan-left-360",
  PanDown360 = "pan-down-360",
  PanRight360 = "pan-right-360"
}

export interface VlcBinding {
  action: VlcAction;
  section: KeymapSection;
  label: string;
  combos: KeyCombo[];
  isRepeatable?: boolean;
  // Acts only on 360° videos, as VLC's viewpoint keys do, and there takes over the key from any other binding (l
  // loops other videos). On any other video the key is left to its other binding, or to the page
  isSphericalOnly?: boolean;
  // Acts only on this site: YouTube Music has no miniplayer or 360° videos and keeps + for liking a song, and only
  // Music has a queue to shuffle
  site?: Site;
  // A page scroll key, so like YouTube's volume keys it acts only while focus is inside the player
  isPlayerFocusOnly?: boolean;
  // A YouTube key that does exactly the same, so YouTube's own (localized) label describes this binding too
  youtubeEquivalent?: YoutubeHotkey;
  // A YouTube key that does the same in bigger steps: YouTube's own (localized) label plus this binding's step
  youtubeCoarserEquivalent?: {
    hotkey: YoutubeHotkey;
    step: string;
  };
  // YouTube Music's key for the same control where it isn't YouTube's (VLC's loop is Music's repeat), so Music's
  // own (localized) label describes this binding there
  musicEquivalent?: YoutubeHotkey;
}

enum JumpDirection {
  Backward = -1,
  Forward = 1
}

interface JumpSize {
  seconds: number;
  modifiers: Omit<KeyCombo, "key">;
  backwardAction: VlcAction;
  forwardAction: VlcAction;
  youtubeEquivalents?: Record<JumpDirection, YoutubeHotkey>;
}

const SECONDS_PER_MINUTE = 60;

// VLC 3.x jump lengths (key-jump-*)
const JUMP_SECONDS = {
  extraShort: 3,
  arrow: 5,
  short: 10,
  medium: SECONDS_PER_MINUTE,
  long: 5 * SECONDS_PER_MINUTE
} as const;

// Each jump length sits on the arrow keys under its own modifier. Ctrl alone stays YouTube's chapter
// navigation, so VLC's 1-minute jump moved to Ctrl+Shift
const JUMP_SIZES: JumpSize[] = [
  {
    seconds: JUMP_SECONDS.extraShort,
    modifiers: {
      isShift: true
    },
    backwardAction: VlcAction.JumpBackwardExtraShort,
    forwardAction: VlcAction.JumpForwardExtraShort
  },
  {
    seconds: JUMP_SECONDS.arrow,
    modifiers: {},
    backwardAction: VlcAction.JumpBackwardArrow,
    forwardAction: VlcAction.JumpForwardArrow,
    youtubeEquivalents: {
      [JumpDirection.Backward]: YOUTUBE_HOTKEYS.seekBackwardShort,
      [JumpDirection.Forward]: YOUTUBE_HOTKEYS.seekForwardShort
    }
  },
  {
    seconds: JUMP_SECONDS.short,
    modifiers: {
      isAlt: true
    },
    backwardAction: VlcAction.JumpBackwardShort,
    forwardAction: VlcAction.JumpForwardShort,
    youtubeEquivalents: {
      [JumpDirection.Backward]: YOUTUBE_HOTKEYS.seekBackwardLong,
      [JumpDirection.Forward]: YOUTUBE_HOTKEYS.seekForwardLong
    }
  },
  {
    seconds: JUMP_SECONDS.medium,
    modifiers: {
      isCtrl: true,
      isShift: true
    },
    backwardAction: VlcAction.JumpBackwardMedium,
    forwardAction: VlcAction.JumpForwardMedium
  },
  {
    seconds: JUMP_SECONDS.long,
    modifiers: {
      isCtrl: true,
      isAlt: true
    },
    backwardAction: VlcAction.JumpBackwardLong,
    forwardAction: VlcAction.JumpForwardLong
  }
];

const JUMP_DIRECTION_KEYS: Record<JumpDirection, string> = {
  [JumpDirection.Backward]: "ArrowLeft",
  [JumpDirection.Forward]: "ArrowRight"
};

const JUMP_DIRECTION_WORDS: Record<JumpDirection, string> = {
  [JumpDirection.Backward]: "back",
  [JumpDirection.Forward]: "forward"
};

export const FINE_SPEED_STEP = 0.1;
export const NORMAL_SPEED = 1;
// YouTube's English labels for its speed keys, used until its own (localized) dialog is read
const SLOWER_LABEL = "Decrease playback rate";
const FASTER_LABEL = "Increase playback rate";
const FINE_SPEED_STEP_LABEL = formatRate(FINE_SPEED_STEP);

function formatDuration(seconds: number) {
  const isWholeMinutes = seconds >= SECONDS_PER_MINUTE && seconds % SECONDS_PER_MINUTE === 0;
  const [amount, unit] = isWholeMinutes ? [seconds / SECONDS_PER_MINUTE, "minute"] : [seconds, "second"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

function createJumpBinding({ jumpSize, direction }: {
  jumpSize: JumpSize;
  direction: JumpDirection;
}): VlcBinding {
  return {
    action: direction === JumpDirection.Forward ? jumpSize.forwardAction : jumpSize.backwardAction,
    section: KeymapSection.Playback,
    label: `Jump ${JUMP_DIRECTION_WORDS[direction]} ${formatDuration(jumpSize.seconds)}`,
    combos: [{
      key: JUMP_DIRECTION_KEYS[direction],
      ...jumpSize.modifiers
    }],
    isRepeatable: true,
    youtubeEquivalent: jumpSize.youtubeEquivalents?.[direction]
  };
}

const JUMP_DIRECTIONS = [JumpDirection.Backward, JumpDirection.Forward];

const JUMP_BINDINGS = JUMP_SIZES.flatMap(jumpSize => JUMP_DIRECTIONS.map(direction => createJumpBinding({
  jumpSize,
  direction
})));

export const JUMP_SECONDS_BY_ACTION = new Map<VlcAction, number>();
for (const { seconds, backwardAction, forwardAction } of JUMP_SIZES) {
  JUMP_SECONDS_BY_ACTION.set(backwardAction, JumpDirection.Backward * seconds);
  JUMP_SECONDS_BY_ACTION.set(forwardAction, JumpDirection.Forward * seconds);
}

// YouTube moves a 360° view for as long as its key is held, so these keep moving while held too
const VIEW_360_BINDING_BASE = {
  section: KeymapSection.General,
  isRepeatable: true,
  isSphericalOnly: true,
  site: Site.Youtube
} as const satisfies Partial<VlcBinding>;

export const VLC_BINDINGS: VlcBinding[] = [
  {
    action: VlcAction.PlayPause,
    section: KeymapSection.Playback,
    label: "Play/pause",
    combos: [{ key: " " }],
    youtubeEquivalent: YOUTUBE_HOTKEYS.playPause
  },
  ...JUMP_BINDINGS,
  {
    action: VlcAction.Previous,
    section: KeymapSection.Playback,
    label: "Previous video",
    combos: [{ key: "p" }],
    youtubeEquivalent: YOUTUBE_HOTKEYS.previous
  },
  {
    action: VlcAction.Next,
    section: KeymapSection.Playback,
    label: "Next video",
    combos: [{ key: "n" }],
    youtubeEquivalent: YOUTUBE_HOTKEYS.next
  },
  {
    action: VlcAction.NextFrame,
    section: KeymapSection.Playback,
    label: "Next frame",
    combos: [{ key: "e" }],
    isRepeatable: true,
    youtubeEquivalent: YOUTUBE_HOTKEYS.nextFrame
  },
  {
    action: VlcAction.Slower,
    section: KeymapSection.Playback,
    label: SLOWER_LABEL,
    combos: [{ key: "-" }],
    isRepeatable: true,
    youtubeEquivalent: YOUTUBE_HOTKEYS.slower
  },
  {
    action: VlcAction.Faster,
    section: KeymapSection.Playback,
    label: FASTER_LABEL,
    combos: [{ key: "+" }],
    isRepeatable: true,
    // YouTube Music's + likes the song
    site: Site.Youtube,
    youtubeEquivalent: YOUTUBE_HOTKEYS.faster
  },
  {
    action: VlcAction.SlowerFine,
    section: KeymapSection.Playback,
    label: `${SLOWER_LABEL} (${FINE_SPEED_STEP_LABEL})`,
    combos: [{ key: "[" }],
    isRepeatable: true,
    youtubeCoarserEquivalent: {
      hotkey: YOUTUBE_HOTKEYS.slower,
      step: FINE_SPEED_STEP_LABEL
    }
  },
  {
    action: VlcAction.FasterFine,
    section: KeymapSection.Playback,
    label: `${FASTER_LABEL} (${FINE_SPEED_STEP_LABEL})`,
    combos: [{ key: "]" }],
    isRepeatable: true,
    youtubeCoarserEquivalent: {
      hotkey: YOUTUBE_HOTKEYS.faster,
      step: FINE_SPEED_STEP_LABEL
    }
  },
  {
    action: VlcAction.NormalSpeed,
    section: KeymapSection.Playback,
    label: "Normal speed",
    combos: [{ key: "=" }]
  },
  {
    action: VlcAction.Stop,
    section: KeymapSection.Playback,
    label: "Stop",
    combos: [{ key: "s" }]
  },
  {
    action: VlcAction.ToggleLoop,
    section: KeymapSection.Playback,
    label: "Toggle loop",
    combos: [{ key: "l" }],
    musicEquivalent: YOUTUBE_MUSIC_HOTKEYS.repeat
  },
  {
    action: VlcAction.Shuffle,
    section: KeymapSection.Playback,
    label: "Shuffle",
    combos: [{ key: "r" }],
    site: Site.Music,
    musicEquivalent: YOUTUBE_MUSIC_HOTKEYS.shuffle
  },
  {
    action: VlcAction.ToggleFullscreen,
    section: KeymapSection.General,
    label: "Toggle fullscreen",
    combos: [{ key: "f" }],
    youtubeEquivalent: YOUTUBE_HOTKEYS.fullscreen
  },
  {
    action: VlcAction.ToggleMiniplayer,
    section: KeymapSection.General,
    label: "Toggle miniplayer",
    combos: [{ key: "i" }, {
      key: "i",
      isShift: true
    }],
    site: Site.Youtube,
    youtubeEquivalent: YOUTUBE_HOTKEYS.miniplayer
  },
  {
    action: VlcAction.ToggleMute,
    section: KeymapSection.General,
    label: "Mute/unmute",
    combos: [{ key: "m" }],
    youtubeEquivalent: YOUTUBE_HOTKEYS.mute
  },
  {
    action: VlcAction.VolumeUp,
    section: KeymapSection.General,
    label: "Volume up",
    combos: [{ key: "ArrowUp" }, {
      key: "ArrowUp",
      isCtrl: true
    }],
    isRepeatable: true
  },
  {
    action: VlcAction.VolumeDown,
    section: KeymapSection.General,
    label: "Volume down",
    combos: [{ key: "ArrowDown" }, {
      key: "ArrowDown",
      isCtrl: true
    }],
    isRepeatable: true
  },
  {
    action: VlcAction.CycleAudioTrack,
    section: KeymapSection.General,
    label: "Cycle audio track",
    combos: [{ key: "b" }]
  },
  {
    action: VlcAction.CycleAspectRatio,
    section: KeymapSection.General,
    label: "Cycle aspect ratio",
    combos: [{ key: "a" }]
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.ZoomIn360,
    label: "Zoom in",
    combos: [{ key: "PageUp" }],
    isPlayerFocusOnly: true,
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.zoomIn
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.ZoomOut360,
    label: "Zoom out",
    combos: [{ key: "PageDown" }],
    isPlayerFocusOnly: true,
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.zoomOut
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.PanUp360,
    label: "Pan up",
    combos: [{ key: "i" }],
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.lookUp
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.PanLeft360,
    label: "Pan left",
    combos: [{ key: "j" }],
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.lookLeft
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.PanDown360,
    label: "Pan down",
    combos: [{ key: "k" }],
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.lookDown
  },
  {
    ...VIEW_360_BINDING_BASE,
    action: VlcAction.PanRight360,
    label: "Pan right",
    combos: [{ key: "l" }],
    youtubeEquivalent: YOUTUBE_360_HOTKEYS.lookRight
  },
  {
    action: VlcAction.Snapshot,
    section: KeymapSection.General,
    label: "Take snapshot",
    combos: [{
      key: "s",
      isShift: true
    }]
  },
  {
    action: VlcAction.ToggleControls,
    section: KeymapSection.General,
    label: "Hide/show controls",
    combos: [{
      key: "h",
      isCtrl: true
    }]
  },
  {
    action: VlcAction.CycleSubtitles,
    section: KeymapSection.Subtitles,
    label: "Cycle subtitle track",
    combos: [{ key: "v" }]
  },
  {
    action: VlcAction.CycleSubtitlesReverse,
    section: KeymapSection.Subtitles,
    label: "Cycle subtitle track in reverse",
    combos: [{
      key: "v",
      isAlt: true
    }]
  }
];

const WHEEL_KEY = "wheel";

// Shift keeps the plain wheel scrolling the page
export const VLC_WHEEL_VOLUME = {
  section: KeymapSection.General,
  label: "Volume up/down",
  combos: [{
    key: WHEEL_KEY,
    isShift: true
  }]
} as const satisfies Pick<VlcBinding, "section" | "label" | "combos">;

export const VLC_WHEEL_SHORTCUTS = [VLC_WHEEL_VOLUME];

export function findBindings(e: KeyboardEvent) {
  return VLC_BINDINGS.filter(binding => binding.combos.some(combo => isComboMatch({
    combo,
    e
  })));
}

export function findBinding(action: VlcAction) {
  return VLC_BINDINGS.find(binding => binding.action === action) ?? null;
}

export function formatActionShortcut({ action, style }: {
  action: VlcAction;
  style: ShortcutStyle;
}) {
  const binding = findBinding(action);
  if (!binding) {
    return null;
  }

  return formatCombos({
    combos: binding.combos,
    style
  });
}
