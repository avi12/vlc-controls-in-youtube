// The isolated-world bridge mirrors the stored toggle onto <html> so the MAIN-world script
// (no extension APIs there) can read it synchronously and observe changes
export const ENABLED_ATTRIBUTE = "data-vlc-controls";

export enum EnabledState {
  On = "on",
  Off = "off"
}

type EnabledChangeCallback = (isEnabled: boolean) => void;

const enabledChangeCallbacks: EnabledChangeCallback[] = [];
const enabledAttributeObserver = new MutationObserver(notifyEnabledChange);
// A newer copy of this script took over the page (the extension was reloaded or updated without reloading the tab)
let isRetired = false;

export function isVlcControlsEnabled() {
  return !isRetired && document.documentElement.getAttribute(ENABLED_ATTRIBUTE) !== EnabledState.Off;
}

// A retired copy is not the same as one switched off: it leaves YouTube's page as YouTube's own, while a copy the
// viewer switched off still offers the row that switches it back on
export function isCopyRetired() {
  return isRetired;
}

function notifyEnabledChange() {
  const isEnabled = isVlcControlsEnabled();
  for (const callback of enabledChangeCallbacks) {
    callback(isEnabled);
  }
}

export function onEnabledChange(callback: EnabledChangeCallback) {
  enabledChangeCallbacks.push(callback);
  enabledAttributeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ENABLED_ATTRIBUTE]
  });
}

// Wraps a page observer's callback so it falls silent once this copy retires. Left running, a retired copy's
// observer undoes each change the newer copy makes, which wakes the newer copy's observer to redo it - forever
export function unlessRetired<T extends unknown[]>(callback: (...parameters: T) => void) {
  return (...parameters: T) => {
    if (isRetired) {
      return;
    }

    callback(...parameters);
  };
}

// From then on this copy acts as switched off for good: it undoes everything it changed, as switching off does,
// and its listeners go inert, so the newer copy starts from YouTube's own page
export function retire() {
  isRetired = true;
  enabledAttributeObserver.disconnect();
  notifyEnabledChange();
}
