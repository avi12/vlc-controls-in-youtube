import { PlayerKind } from "@/lib/player";
import {
  formatCombos,
  isComboMatch,
  type KeyCombo,
  KeymapSection,
  ShortcutStyle
} from "@/lib/shortcut";

export interface YoutubeShortcut {
  section: KeymapSection;
  combos: readonly KeyCombo[];
  hotkeyLabel?: string;
}

export const YOUTUBE_CHAPTER_COMBOS = {
  previous: {
    key: "ArrowLeft",
    isCtrl: true
  },
  next: {
    key: "ArrowRight",
    isCtrl: true
  }
} as const satisfies Record<string, KeyCombo>;

const DIGIT_COMBOS = Array.from({ length: 10 }, (_, digit) => ({ key: String(digit) }));

// Controls only YouTube's player has - VLC has no equivalent, so YouTube keeps handling its own keys. The help
// dialog lists one only where YouTube's own dialog does, in YouTube's (localized) wording
export const YOUTUBE_NATIVE_SHORTCUTS = {
  theaterMode: {
    section: KeymapSection.General,
    combos: [{ key: "t" }]
  },
  closeMiniplayerOrDialog: {
    section: KeymapSection.General,
    combos: [{ key: "Escape" }]
  },
  seekToPercentage: {
    section: KeymapSection.Playback,
    combos: DIGIT_COMBOS,
    hotkeyLabel: "0..9"
  },
  previousChapter: {
    section: KeymapSection.Playback,
    combos: [YOUTUBE_CHAPTER_COMBOS.previous]
  },
  nextChapter: {
    section: KeymapSection.Playback,
    combos: [YOUTUBE_CHAPTER_COMBOS.next]
  }
} as const satisfies Record<string, YoutubeShortcut>;

export interface YoutubeHotkey {
  key: string;
  code: string;
  keyCode: number;
  shiftKey?: boolean;
}

// YouTube's own keys for the controls VLC also has. VLC's keys trigger these (dispatched to YouTube),
// so every action shows YouTube's native bezel, seek overlay or caption card - never an overlay of ours
export const YOUTUBE_HOTKEYS = {
  playPause: {
    key: "k",
    code: "KeyK",
    keyCode: 75
  },
  mute: {
    key: "m",
    code: "KeyM",
    keyCode: 77
  },
  fullscreen: {
    key: "f",
    code: "KeyF",
    keyCode: 70
  },
  next: {
    key: "N",
    code: "KeyN",
    keyCode: 78,
    shiftKey: true
  },
  previous: {
    key: "P",
    code: "KeyP",
    keyCode: 80,
    shiftKey: true
  },
  seekBackwardShort: {
    key: "ArrowLeft",
    code: "ArrowLeft",
    keyCode: 37
  },
  seekForwardShort: {
    key: "ArrowRight",
    code: "ArrowRight",
    keyCode: 39
  },
  seekBackwardLong: {
    key: "j",
    code: "KeyJ",
    keyCode: 74
  },
  seekForwardLong: {
    key: "l",
    code: "KeyL",
    keyCode: 76
  },
  volumeUp: {
    key: "ArrowUp",
    code: "ArrowUp",
    keyCode: 38
  },
  volumeDown: {
    key: "ArrowDown",
    code: "ArrowDown",
    keyCode: 40
  },
  faster: {
    key: ">",
    code: "Period",
    keyCode: 190,
    shiftKey: true
  },
  slower: {
    key: "<",
    code: "Comma",
    keyCode: 188,
    shiftKey: true
  },
  previousFrame: {
    key: ",",
    code: "Comma",
    keyCode: 188
  },
  nextFrame: {
    key: ".",
    code: "Period",
    keyCode: 190
  },
  captions: {
    key: "c",
    code: "KeyC",
    keyCode: 67
  },
  // I pans up on 360° videos, so there the miniplayer is on Shift+I
  miniplayer: {
    key: "i",
    code: "KeyI",
    keyCode: 73
  }
} as const satisfies Record<string, YoutubeHotkey>;

// YouTube's keys for moving around a 360° video, each acting for as long as it is held. They are not swallowed: W
// is also a caption styling key on other videos
export const YOUTUBE_360_HOTKEYS = {
  zoomIn: {
    key: "]",
    code: "BracketRight",
    keyCode: 221
  },
  zoomOut: {
    key: "[",
    code: "BracketLeft",
    keyCode: 219
  },
  lookUp: {
    key: "w",
    code: "KeyW",
    keyCode: 87
  },
  lookLeft: {
    key: "a",
    code: "KeyA",
    keyCode: 65
  },
  lookDown: {
    key: "s",
    code: "KeyS",
    keyCode: 83
  },
  lookRight: {
    key: "d",
    code: "KeyD",
    keyCode: 68
  }
} as const satisfies Record<string, YoutubeHotkey>;

// YouTube's seek keys move by these many seconds
export const YOUTUBE_SEEK_SECONDS = {
  short: 5,
  long: 10
} as const;

// YouTube's volume keys step by this many percent, as VLC's do
export const YOUTUBE_VOLUME_STEP = 5;

// Shorts moves between shorts on the keys the watch page uses for volume, so there they stay YouTube's
const YOUTUBE_SHORTS_NAVIGATION_HOTKEYS = [YOUTUBE_HOTKEYS.volumeUp, YOUTUBE_HOTKEYS.volumeDown];

// The YouTube keys each player variant honors. Shorts ignores seek, speed, frame and caption keys (its Up/Down
// change the short); the embed ignores volume, speed and frame keys and seeks 10s on the arrows. The watch
// page honors every key, and YouTube Music's player none (Music has keys of its own, see youtube-music-keymap.ts)
const HONORED_HOTKEYS_BY_PLAYER_KIND: Record<PlayerKind, ReadonlySet<YoutubeHotkey> | null> = {
  [PlayerKind.Music]: new Set(),
  [PlayerKind.Watch]: null,
  [PlayerKind.Shorts]: new Set([YOUTUBE_HOTKEYS.playPause, YOUTUBE_HOTKEYS.mute, YOUTUBE_HOTKEYS.fullscreen]),
  [PlayerKind.Embed]: new Set([
    YOUTUBE_HOTKEYS.playPause,
    YOUTUBE_HOTKEYS.mute,
    YOUTUBE_HOTKEYS.fullscreen,
    YOUTUBE_HOTKEYS.next,
    YOUTUBE_HOTKEYS.previous,
    YOUTUBE_HOTKEYS.seekBackwardLong,
    YOUTUBE_HOTKEYS.seekForwardLong,
    YOUTUBE_HOTKEYS.captions
  ])
};

export function isHotkeyHonored({ playerKind, hotkey }: {
  playerKind: PlayerKind;
  hotkey: YoutubeHotkey;
}) {
  return HONORED_HOTKEYS_BY_PLAYER_KIND[playerKind]?.has(hotkey) ?? true;
}

export function toHotkeyCombo({ key, shiftKey }: YoutubeHotkey): KeyCombo {
  return {
    key,
    isShift: shiftKey
  };
}

// In the notation of YouTube's own Shift+/ dialog, so it finds YouTube's (localized) row for that key
export function formatYoutubeHotkey(hotkey: YoutubeHotkey) {
  return formatCombos({
    combos: [toHotkeyCombo(hotkey)],
    style: ShortcutStyle.Dialog
  });
}

// YouTube's shortcuts for controls VLC also has - VLC's keys replace them, so these are swallowed
const YOUTUBE_REPLACED_COMBOS = Object.values(YOUTUBE_HOTKEYS).map(toHotkeyCombo);

// YouTube listens for its volume keys on the player itself, so they work only while focus is inside it - elsewhere
// they stay the page's and scroll it. Every other YouTube key is also handled page-wide
const PLAYER_FOCUS_KEYS = new Set<string>([YOUTUBE_HOTKEYS.volumeUp.key, YOUTUBE_HOTKEYS.volumeDown.key]);

export function isPlayerFocusKey(e: KeyboardEvent) {
  return PLAYER_FOCUS_KEYS.has(e.key);
}

export function isShortsNavigationKey(e: KeyboardEvent) {
  return YOUTUBE_SHORTS_NAVIGATION_HOTKEYS.some(hotkey => isComboMatch({
    combo: toHotkeyCombo(hotkey),
    e
  }));
}

export function isReplacedYoutubeKey(e: KeyboardEvent) {
  return YOUTUBE_REPLACED_COMBOS.some(combo => isComboMatch({
    combo,
    e
  }));
}

export function formatYoutubeShortcut({ combos, hotkeyLabel }: YoutubeShortcut) {
  return hotkeyLabel ?? formatCombos({
    combos,
    style: ShortcutStyle.Dialog
  });
}

// A key YouTube always lists in each dialog section, so its localized section title can be found in any language
export const YOUTUBE_SECTION_ANCHOR_KEYS: Record<KeymapSection, string> = {
  [KeymapSection.Playback]: YOUTUBE_HOTKEYS.playPause.key,
  [KeymapSection.General]: YOUTUBE_HOTKEYS.fullscreen.key,
  [KeymapSection.Subtitles]: YOUTUBE_HOTKEYS.captions.key
};
