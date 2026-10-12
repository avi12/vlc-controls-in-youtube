import { installContextMenu } from "@/lib/context-menu";
import { retire } from "@/lib/enabled-flag";
import { installHelpDialogOverride } from "@/lib/help-dialog";
import { installHotkeys } from "@/lib/hotkeys";
import { YOUTUBE_PAGE_MATCHES } from "@/lib/page-matches";
import { installTooltipOverrides } from "@/lib/tooltips";
import { ContentScriptContext, defineContentScript } from "#imports";

const CONTENT_SCRIPT_NAME = "vlc-controls";

export default defineContentScript({
  matches: YOUTUBE_PAGE_MATCHES,
  world: "MAIN",
  runAt: "document_start",
  allFrames: true,
  main() {
    // WXT hands MAIN-world scripts no context, so this one's own retires the copy already running when the extension
    // is reloaded or updated into an open tab
    new ContentScriptContext(CONTENT_SCRIPT_NAME).onInvalidated(retire);
    installHotkeys();
    installTooltipOverrides();
    installHelpDialogOverride();
    installContextMenu();
  }
});
