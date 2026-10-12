import { EnabledState } from "@/lib/enabled-flag";

// The context menu's own switch holds for this tab alone: the videos that follow in it keep whatever the viewer
// picked, other tabs keep the stored one, and the toolbar's switch - the global one - clears it
const TAB_ENABLED_KEY = "vlc-controls-enabled";

// The page's own store, which is the one scoped to a single tab. Reaching for it throws where the viewer has
// blocked the page's storage, and then this tab simply has no switch of its own
function getTabStore() {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readTabEnabled() {
  const stored = getTabStore()?.getItem(TAB_ENABLED_KEY) ?? null;
  if (stored === null) {
    return null;
  }

  return stored === EnabledState.On;
}

export function setTabEnabled(isEnabled: boolean) {
  getTabStore()?.setItem(TAB_ENABLED_KEY, isEnabled ? EnabledState.On : EnabledState.Off);
}

export function clearTabEnabled() {
  getTabStore()?.removeItem(TAB_ENABLED_KEY);
}
