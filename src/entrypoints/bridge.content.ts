import { ENABLED_ATTRIBUTE, EnabledState } from "@/lib/enabled-flag";
import "@/lib/help-dialog/help-dialog.css";
import "@/lib/hotkeys/player-effects.css";
import { YOUTUBE_PAGE_MATCHES } from "@/lib/page-matches";
import { isEnabledItem } from "@/lib/storage";
import { clearTabEnabled, readTabEnabled, setTabEnabled } from "@/lib/tab-enabled";
import { WorldMessage, worldMessenger } from "@/lib/world-messaging";
import { defineContentScript } from "#imports";

function mirrorEnabledState(isEnabled: boolean) {
  document.documentElement.setAttribute(ENABLED_ATTRIBUTE, isEnabled ? EnabledState.On : EnabledState.Off);
}

// Isolated world: the MAIN-world script has no extension APIs, so the toggle reaches it through an attribute on
// <html> (see enabled-flag.ts) and writes come back over the world channel. The toggle has two switches: the
// context menu's, which holds for this tab (see tab-enabled.ts), and the toolbar's, which is stored and global,
// so a flip of it takes this tab back over. The player-effect and help-dialog stylesheets ride along here
// because only manifest content scripts can inject CSS
export default defineContentScript({
  matches: YOUTUBE_PAGE_MATCHES,
  allFrames: true,
  runAt: "document_start",
  cssInjectionMode: "manifest",
  async main() {
    worldMessenger.onMessage(WorldMessage.SetTabEnabled, ({ data }) => {
      setTabEnabled(data);
      mirrorEnabledState(data);
    });
    isEnabledItem.watch(isEnabled => {
      clearTabEnabled();
      mirrorEnabledState(isEnabled);
    });
    mirrorEnabledState(readTabEnabled() ?? await isEnabledItem.getValue());
  }
});
