import { functionSchema } from "@/lib/player";
import { hasOwnMethods, onPlayerNamespace, type PlayerNamespace } from "@/lib/player-namespace";
import { createTypeGuard, z } from "@/lib/zod";

interface BezelRegistry {
  bezelsByLayer: WeakMap<Element, BezelComponent>;
  bezelPrototype: BezelComponent | null;
}

declare global {

  var vlcControlsBezelRegistry: BezelRegistry | undefined;
}
// Methods only YouTube's bezel class declares itself - how it is told apart from its minified siblings
const BEZEL_OWN_METHODS = ["show", "hide", "showPlaybackIcon"] as const;
// Hides the bezel's icon circle, so only YouTube's text pill shows - YouTube has no icon for VLC's statuses
export const TEXT_ONLY_BEZEL_CLASS = "vlc-controls-text-bezel";

export enum BezelValue {
  Label = "label",
  Title = "title"
}

interface BezelComponent {
  element: HTMLElement;
  updateValue(key: BezelValue, value: string): void;
  show(): void;
  hide(): void;
}

interface BezelTimer {
  isActive(): boolean;
  start(): void;
  stop(): void;
}

type BezelClass = new () => BezelComponent;

const isBezelComponent = createTypeGuard<BezelComponent>(
  z.object({
    element: z.instanceof(HTMLElement),
    updateValue: functionSchema,
    show: functionSchema,
    hide: functionSchema
  })
);

const isBezelTimer = createTypeGuard<BezelTimer>(
  z.object({
    isActive: functionSchema,
    start: functionSchema,
    stop: functionSchema
  })
);

const isBezelClass = createTypeGuard<BezelClass>(
  z.custom(value => hasOwnMethods({
    value,
    methodNames: BEZEL_OWN_METHODS
  }))
);

// Kept on the page rather than in this script: a newer copy of the script (the extension reloaded or updated into an
// open tab) inherits the bezels YouTube has already shown, and never wraps YouTube's bezel methods a second time
const registry = globalThis.vlcControlsBezelRegistry ??= {
  bezelsByLayer: new WeakMap(),
  bezelPrototype: null
};
const { bezelsByLayer } = registry;

function rememberBezel(bezel: unknown) {
  if (isBezelComponent(bezel)) {
    bezelsByLayer.set(bezel.element, bezel);
  }
}

// Every hide ends a status, and YouTube hides the bezel before each of its own icon bezels
function endTextOnlyStatus(bezel: unknown) {
  if (isBezelComponent(bezel)) {
    bezel.element.classList.remove(TEXT_ONLY_BEZEL_CLASS);
  }
}

// Each bezel is recorded as it hides (its constructor's first call) or shows. The original method still
// runs, with the same arguments and result
function recordBezelInstances(namespace: PlayerNamespace) {
  const BezelClass = Object.values(namespace).find(isBezelClass);
  if (!BezelClass) {
    return;
  }

  const { prototype } = BezelClass;
  const { show, hide } = prototype;
  prototype.show = function (this: unknown) {
    rememberBezel(this);
    show.call(this);
  };
  prototype.hide = function (this: unknown) {
    rememberBezel(this);
    endTextOnlyStatus(this);
    hide.call(this);
  };
  registry.bezelPrototype = prototype;
}

// A newer copy of this script (the extension reloaded into an open tab) inherits the registry, so YouTube's
// bezel methods are never wrapped a second time
export function installBezelRegistry() {
  if (registry.bezelPrototype) {
    return;
  }

  onPlayerNamespace(recordBezelInstances);
}

// The embedded player has no bezel
export function getBezel(player: HTMLElement) {
  for (const elLayer of player.children) {
    const bezel = bezelsByLayer.get(elLayer);
    if (bezel) {
      return bezel;
    }
  }
  return null;
}

// The bezel's own timers: one shows it a beat after a change, the other hides it once it has been up long enough
export function getBezelTimers(bezel: BezelComponent) {
  const { bezelPrototype } = registry;
  if (!bezelPrototype) {
    return null;
  }

  const timers = Object.values(bezel).filter(isBezelTimer);
  const showTimer = timers.find(timer => Object.values(timer).includes(bezelPrototype?.show));
  const hideTimer = timers.find(timer => Object.values(timer).includes(bezelPrototype?.hide));
  return showTimer && hideTimer ? {
    showTimer,
    hideTimer
  } : null;
}
