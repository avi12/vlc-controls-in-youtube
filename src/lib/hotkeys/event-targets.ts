import { isMediaActive, type YoutubePlayer } from "@/lib/player";
import { isMusicSite } from "@/lib/site";
import { isPlayerFocusKey } from "@/lib/youtube-keymap";

const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='combobox']"
].join(", ");
const OVERLAY_SELECTOR = "dialog, [role='dialog'], [role='menu'], [role='listbox'], .ytp-popup, tp-yt-iron-dropdown";
const ACTIVATABLE_SELECTOR = "button, a[href], summary, [role='button'], [role='link'], [role='checkbox'], [role='tab'], [role='option']";

function getEventElement(e: Event) {
  const [target] = e.composedPath();
  return target instanceof Element ? target : null;
}

function isEditableElement(element: Element) {
  const isContentEditable = element instanceof HTMLElement && element.isContentEditable;
  return isContentEditable || element.matches(EDITABLE_SELECTOR);
}

function getFocusedElement() {
  let elFocused = document.activeElement;
  while (elFocused?.shadowRoot?.activeElement) {
    elFocused = elFocused.shadowRoot.activeElement;
  }
  return elFocused;
}

// Keys typed into a text box (search, comments, live chat) stay the text box's. The whole event path is checked,
// since a field inside a web component's shadow root is invisible to closest() from the event's target
function isTypingInTextBox(e: KeyboardEvent) {
  const isPathEditable = e.composedPath().some(target => target instanceof Element && isEditableElement(target));
  const elFocused = getFocusedElement();
  return isPathEditable || elFocused !== null && isEditableElement(elFocused);
}

// Space on a focused page control (Subscribe, a link) keeps activating it, as on YouTube
function isActivatableOutsidePlayer({ element, elPlayer }: {
  element: Element;
  elPlayer: HTMLElement;
}) {
  return element.closest(ACTIVATABLE_SELECTOR) !== null && !elPlayer.contains(element);
}

function isModifiedKey(e: KeyboardEvent) {
  return e.ctrlKey || e.altKey || e.metaKey;
}

// The volume keys scroll the page and Ctrl/Alt combos double as browser shortcuts (Ctrl+H history, Alt+Left back),
// so they stay the page's unless the player has focus. YouTube Music's player can't take focus while its player
// page is closed, so there they act while something is playing or paused instead
function isPlayerOnlyKey(e: KeyboardEvent) {
  return isPlayerFocusKey(e) || isModifiedKey(e);
}

function isPlayerOutOfUse({ element, elPlayer }: {
  element: Element;
  elPlayer: YoutubePlayer;
}) {
  return isMusicSite() ? !isMediaActive(elPlayer) : !elPlayer.contains(element);
}

export function isKeyForPage({ e, elPlayer }: {
  e: KeyboardEvent;
  elPlayer: YoutubePlayer;
}) {
  const element = getEventElement(e);
  if (!element) {
    return false;
  }

  const isSpace = e.key === " ";
  return isTypingInTextBox(e) ||
    element.closest(OVERLAY_SELECTOR) !== null ||
    isPlayerOnlyKey(e) && isPlayerOutOfUse({
      element,
      elPlayer
    }) ||
    isSpace && isActivatableOutsidePlayer({
      element,
      elPlayer
    });
}

// A Ctrl/Alt combo left to the browser outside a text box, which YouTube's own handler reads as the bare key
// (Alt+Right as Right, seeking 5 seconds)
export function isBrowserShortcutOutsideTextBox(e: KeyboardEvent) {
  return isModifiedKey(e) && !isTypingInTextBox(e);
}

export function isEventInside({ e, elContainer }: {
  e: Event;
  elContainer: HTMLElement;
}) {
  const element = getEventElement(e);
  return element !== null && elContainer.contains(element);
}
