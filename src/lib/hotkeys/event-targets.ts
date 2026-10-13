import { isMediaActive, PLAYER_SELECTOR, type YoutubePlayer } from "@/lib/player";
import { isMusicSite } from "@/lib/site";
import { isPlayerFocusKey } from "@/lib/youtube-keymap";

const TAB_KEY = "Tab";

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

// Whether the viewer's last click or Tab landed inside a player, as opposed to YouTube focusing it on its own
let isPlayerEnteredByViewer = false;

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

function isInsideAnyPlayer(element: Element | null) {
  return element !== null && element.closest(PLAYER_SELECTOR) !== null;
}

function onPointerDown(e: PointerEvent) {
  isPlayerEnteredByViewer = isInsideAnyPlayer(getEventElement(e));
}

function onTabKeyUp(e: KeyboardEvent) {
  if (e.key !== TAB_KEY) {
    return;
  }

  isPlayerEnteredByViewer = isInsideAnyPlayer(getFocusedElement());
}

export function isModifiedKey(e: KeyboardEvent) {
  return e.ctrlKey || e.altKey || e.metaKey;
}

// The volume keys scroll the page and Ctrl/Alt combos double as browser shortcuts (Ctrl+H history, Alt+Left back),
// so they stay the page's unless the viewer is in the player. YouTube Music's player can't take focus while its
// player page is closed, so there they act while something is playing or paused instead
function isPlayerOnlyKey(e: KeyboardEvent) {
  return isPlayerFocusKey(e) || isModifiedKey(e);
}

// YouTube focuses its player by itself whenever a video loads, so a browser shortcut also needs the viewer to have
// clicked or tabbed into the player
function isViewerInPlayer({ e, element, elPlayer }: {
  e: KeyboardEvent;
  element: Element;
  elPlayer: YoutubePlayer;
}) {
  const isFocusInPlayer = elPlayer.contains(element);
  return isModifiedKey(e) ? isFocusInPlayer && isPlayerEnteredByViewer : isFocusInPlayer;
}

function isPlayerOutOfUse({ e, element, elPlayer }: {
  e: KeyboardEvent;
  element: Element;
  elPlayer: YoutubePlayer;
}) {
  return isMusicSite() ? !isMediaActive(elPlayer) : !isViewerInPlayer({
    e,
    element,
    elPlayer
  });
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
      e,
      element,
      elPlayer
    }) ||
    isSpace && isActivatableOutsidePlayer({
      element,
      elPlayer
    });
}

export function installPlayerEntryTracking() {
  addEventListener("pointerdown", onPointerDown, {
    capture: true
  });
  addEventListener("keyup", onTabKeyUp, {
    capture: true
  });
}

export function isEventInside({ e, elContainer }: {
  e: Event;
  elContainer: HTMLElement;
}) {
  const element = getEventElement(e);
  return element !== null && elContainer.contains(element);
}
