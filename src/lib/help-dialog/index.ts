import { isVlcControlsEnabled, onEnabledChange, unlessRetired } from "@/lib/enabled-flag";
import { isRendererDialog, syncDialogData } from "@/lib/help-dialog/data-override";
import { applyDomFallback, removeDomFallback } from "@/lib/help-dialog/dom-fallback";
import { getSite, Site } from "@/lib/site";

// YouTube Music renders the same dialog data in its own elements, and mounts its dialogs straight in <body>
const DIALOG_ELEMENTS_BY_SITE: Record<Site, {
  dialogSelector: string;
  hostSelector: string;
}> = {
  [Site.Youtube]: {
    dialogSelector: "ytd-hotkey-dialog-renderer",
    hostSelector: "ytd-popup-container"
  },
  [Site.Music]: {
    dialogSelector: "ytmusic-hotkey-dialog-renderer",
    hostSelector: "body"
  }
};

function getDialogElements() {
  return DIALOG_ELEMENTS_BY_SITE[getSite()];
}

function syncDialog(elDialog: Element) {
  const isEnabled = isVlcControlsEnabled();
  const isDataOverridden = isRendererDialog(elDialog) && syncDialogData({
    elDialog,
    isEnabled
  });
  if (!isEnabled || isDataOverridden) {
    removeDomFallback(elDialog);
    return;
  }

  applyDomFallback(elDialog);
}

function syncAllDialogs() {
  for (const elDialog of document.querySelectorAll(getDialogElements().dialogSelector)) {
    syncDialog(elDialog);
  }
}

function waitForDialogHost(onFound: (elHost: Element) => void) {
  const { hostSelector } = getDialogElements();
  const elExisting = document.querySelector(hostSelector);
  if (elExisting) {
    onFound(elExisting);
    return;
  }

  const observer = new MutationObserver(() => {
    const elHost = document.querySelector(hostSelector);
    if (!elHost) {
      return;
    }

    observer.disconnect();
    onFound(elHost);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

// YouTube mounts the dialog lazily on the first Shift+/ and may reassign its data on reopen
export function installHelpDialogOverride() {
  waitForDialogHost(elHost => {
    new MutationObserver(unlessRetired(syncAllDialogs)).observe(elHost, {
      childList: true,
      subtree: true
    });
    syncAllDialogs();
  });
  onEnabledChange(syncAllDialogs);
}
