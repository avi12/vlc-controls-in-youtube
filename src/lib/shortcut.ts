// YouTube's own Shift+/ dialog categories, so every key sits where YouTube users expect it
export enum KeymapSection {
  Playback = "Playback",
  General = "General",
  Subtitles = "Subtitles and closed captions"
}

export interface KeyCombo {
  key: string;
  isShift?: boolean;
  isCtrl?: boolean;
  isAlt?: boolean;
}

// YouTube's two notations: tooltips write "SHIFT+n", the Shift+/ dialog writes "N (SHIFT+n)"
export enum ShortcutStyle {
  Tooltip = "tooltip",
  Dialog = "dialog"
}

// Spelled the way YouTube's own dialog spells them
const KEY_DISPLAY_NAMES: Record<string, string> = {
  " ": "SPACE",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "ESCAPE",
  Home: "HOME",
  End: "END",
  PageUp: "PAGE UP",
  PageDown: "PAGE DOWN"
};

// YouTube writes a shifted symbol next to the key it is typed on (US layout): "< (SHIFT+,)"
const SHIFTED_SYMBOL_BASE_KEYS: Record<string, string> = {
  "<": ",",
  ">": ".",
  "+": "="
};

// The physical key each unshifted symbol sits on (US layout), so a combo matches on any keyboard layout and the
// numpad's + and - stay keys of their own
const SYMBOL_CODES: Record<string, string> = {
  " ": "Space",
  ",": "Comma",
  ".": "Period",
  "-": "Minus",
  "=": "Equal",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight"
};

export function getShiftedSymbolBaseKey(key: string) {
  return SHIFTED_SYMBOL_BASE_KEYS[key];
}

// The English notation of YouTube's dialog; the help dialog learns the viewer's own from YouTube's rows
export const MODIFIER_NAMES = {
  control: "CONTROL",
  alt: "ALT",
  shift: "SHIFT"
} as const;

export const MODIFIER_JOINER = " + ";

const COMBO_SEPARATOR = " or ";

function isNamedKey(key: string) {
  return key.length > 1;
}

// A shifted symbol ("+") is typed with Shift on its base key ("=")
function isComboShifted(combo: KeyCombo) {
  return Boolean(combo.isShift) || getShiftedSymbolBaseKey(combo.key) !== undefined;
}

function getCharacterCode(key: string) {
  const typedOnKey = getShiftedSymbolBaseKey(key) ?? key;
  return isLetter(typedOnKey) ? `Key${typedOnKey.toUpperCase()}` : SYMBOL_CODES[typedOnKey];
}

// Named keys (arrows, Page Up) keep their name on every layout, and on the numpad with Num Lock off
function isSameKey({ combo, e }: {
  combo: KeyCombo;
  e: KeyboardEvent;
}) {
  return isNamedKey(combo.key) ? e.key === combo.key : e.code === getCharacterCode(combo.key);
}

function isCtrlAltMatch({ combo, e }: {
  combo: KeyCombo;
  e: KeyboardEvent | WheelEvent;
}) {
  return e.ctrlKey === Boolean(combo.isCtrl) && e.altKey === Boolean(combo.isAlt) && !e.metaKey;
}

export function isComboMatch({ combo, e }: {
  combo: KeyCombo;
  e: KeyboardEvent;
}) {
  const isShiftMatch = e.shiftKey === isComboShifted(combo);
  return isSameKey({
    combo,
    e
  }) && isShiftMatch && isCtrlAltMatch({
    combo,
    e
  });
}

// A wheel combo's key is the wheel itself, so only its modifiers need matching
export function isWheelComboMatch({ combo, e }: {
  combo: KeyCombo;
  e: WheelEvent;
}) {
  return e.shiftKey === Boolean(combo.isShift) && isCtrlAltMatch({
    combo,
    e
  });
}

export function isLetter(key: string) {
  return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

export function formatKeyName(key: string) {
  return KEY_DISPLAY_NAMES[key] ?? key.toLowerCase();
}

function formatCombo({ combo, style }: {
  combo: KeyCombo;
  style: ShortcutStyle;
}) {
  const key = formatKeyName(combo.key);
  const shiftedSymbolBaseKey = getShiftedSymbolBaseKey(combo.key);
  const typedOnKey = isLetter(combo.key) ? key : shiftedSymbolBaseKey;
  const isShiftOnly = isComboShifted(combo) && !combo.isCtrl && !combo.isAlt;
  if (isShiftOnly && typedOnKey) {
    const shiftedKey = `${MODIFIER_NAMES.shift}+${typedOnKey}`;
    return style === ShortcutStyle.Dialog ? `${combo.key.toUpperCase()} (${shiftedKey})` : shiftedKey;
  }

  const modifiers = [
    combo.isCtrl && MODIFIER_NAMES.control,
    combo.isAlt && MODIFIER_NAMES.alt,
    combo.isShift && MODIFIER_NAMES.shift
  ];
  return [...modifiers, key].filter(Boolean).join(MODIFIER_JOINER);
}

export function formatCombos({ combos, style }: {
  combos: readonly KeyCombo[];
  style: ShortcutStyle;
}) {
  return combos.map(combo => formatCombo({
    combo,
    style
  })).join(COMBO_SEPARATOR);
}
