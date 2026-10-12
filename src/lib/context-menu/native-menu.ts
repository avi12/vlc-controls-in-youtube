import { functionSchema } from "@/lib/player";
import {
  findOwnMethodName,
  hasClassSourceMarkers,
  hasOwnMethods,
  hasSourceMarkers,
  onPlayerNamespace,
  type PlayerNamespace,
  readMethod,
  readOwnFunction,
  writeMethod
} from "@/lib/player-namespace";
import { createTypeGuard, z } from "@/lib/zod";

// YouTube's own right-click menu, the panel stack it lives in, and the row list of whichever panel is open
const CONTEXT_MENU_SELECTOR = ".ytp-contextmenu";
const POPUP_SELECTOR = ".ytp-popup";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";

// What each of YouTube's menu components is made of, since the compiler renames them all on every release:
// the row list builds the panel-menu element, the row class keeps its icon and value setters, the row that opens
// a sub-panel keeps open/enable and marks itself as a popup opener, and the row template names the icon cell
const PANEL_MENU_MARKERS = [PANEL_MENU_SELECTOR.slice(1)] as const;
const CHOICE_ITEM_OWN_METHODS = ["open", "enable"] as const;
const CHOICE_ITEM_MARKERS = ["aria-haspopup"] as const;
const MENU_ITEM_OWN_METHODS = ["setIcon", "updateValue"] as const;
const ITEM_TEMPLATE_MARKERS = ["ytp-menuitem-icon"] as const;
// The row list appends and removes the row elements it is given; the choice row writes the picked option into its
// own value and checks its radio, and rebuilds its option rows from an array
const ADD_ITEM_MARKERS = ["appendChild"] as const;
const REMOVE_ITEM_MARKERS = ["removeChild"] as const;
const SELECT_OPTION_MARKERS = ["aria-checked", "setContent"] as const;
const SET_OPTIONS_MARKERS = [".length", "options"] as const;

const SELECT_EVENT = "select";
const CLICK_EVENT = "click";
// YouTube appends each of its own context-menu rows in order, so ours sit after them whatever their priority
const APPEND_TO_END = true;

interface NativeComponent {
  element: HTMLElement;
  dispose(): void;
}

export interface NativeMenuItem extends NativeComponent {
  listen(eventType: string, handler: () => void): void;
  setContent(value: string): void;
  setIcon(icon: SVGElement): void;
}

interface NativeChoiceItem extends NativeMenuItem {
  open(): void;
  enable(isEnabled: boolean): void;
  subscribe(event: string, handler: (option: string) => void): void;
}

interface NativePanelMenu extends NativeComponent {
  menuItems: NativeComponent;
}

interface NativePopup extends NativeComponent {
  hide(): void;
}

type MenuItemClass = new (template: unknown, priority: number, label: string) => NativeMenuItem;

type ChoiceItemClass = new (
  label: string,
  priority: number,
  player: HTMLElement,
  popup: NativePopup
) => NativeChoiceItem;

type ItemTemplateFactory = () => unknown;

interface MenuClasses {
  MenuItem: MenuItemClass;
  ChoiceItem: ChoiceItemClass;
  createItemTemplate: ItemTemplateFactory;
  addItemName: string;
  removeItemName: string;
  setOptionsName: string;
  selectOptionName: string;
}

interface PanelMenuRegistry {
  panelMenusByElement: WeakMap<Element, NativePanelMenu>;
  classes: MenuClasses | null;
}

declare global {

  var vlcControlsPanelMenuRegistry: PanelMenuRegistry | undefined;
}

const componentSchema = z.object({
  element: z.instanceof(HTMLElement),
  dispose: functionSchema
});

const isPanelMenu = createTypeGuard<NativePanelMenu>(componentSchema.extend({ menuItems: componentSchema }));
const isPopup = createTypeGuard<NativePopup>(componentSchema.extend({ hide: functionSchema }));

const isMenuItemClass = createTypeGuard<MenuItemClass>(
  z.custom(value => hasOwnMethods({
    value,
    methodNames: MENU_ITEM_OWN_METHODS
  }))
);

const isChoiceItemClass = createTypeGuard<ChoiceItemClass>(
  z.custom(value => hasOwnMethods({
    value,
    methodNames: CHOICE_ITEM_OWN_METHODS
  }) && hasClassSourceMarkers({
    value,
    markers: CHOICE_ITEM_MARKERS
  }))
);

const isItemTemplateFactory = createTypeGuard<ItemTemplateFactory>(
  z.custom(value => hasSourceMarkers({
    value,
    markers: ITEM_TEMPLATE_MARKERS
  }))
);

const isPanelMenuClass = createTypeGuard<{ prototype: object }>(
  z.custom(value => hasClassSourceMarkers({
    value,
    markers: PANEL_MENU_MARKERS
  }))
);

// Kept on the page rather than in this script: a newer copy of this script (the extension reloaded or updated into
// an open tab) inherits the menus YouTube has already built, and never wraps YouTube's row list a second time
const registry = globalThis.vlcControlsPanelMenuRegistry ??= {
  panelMenusByElement: new WeakMap(),
  classes: null
};

function rememberPanelMenu(panelMenu: unknown) {
  if (isPanelMenu(panelMenu)) {
    registry.panelMenusByElement.set(panelMenu.menuItems.element, panelMenu);
  }
}

function findMenuClasses({ namespace, panelMenuPrototype }: {
  namespace: PlayerNamespace;
  panelMenuPrototype: object;
}) {
  const values = Object.values(namespace);
  const MenuItem = values.find(isMenuItemClass);
  const ChoiceItem = values.find(isChoiceItemClass);
  const createItemTemplate = values.find(isItemTemplateFactory);
  const addItemName = findOwnMethodName({
    prototype: panelMenuPrototype,
    markers: ADD_ITEM_MARKERS
  });
  const removeItemName = findOwnMethodName({
    prototype: panelMenuPrototype,
    markers: REMOVE_ITEM_MARKERS
  });
  if (!MenuItem || !ChoiceItem || !createItemTemplate || !addItemName || !removeItemName) {
    return null;
  }

  const selectOptionName = findOwnMethodName({
    prototype: ChoiceItem.prototype,
    markers: SELECT_OPTION_MARKERS
  });
  const setOptionsName = selectOptionName && findOwnMethodName({
    prototype: ChoiceItem.prototype,
    markers: SET_OPTIONS_MARKERS,
    excluded: [selectOptionName]
  });
  if (!selectOptionName || !setOptionsName) {
    return null;
  }

  return {
    MenuItem,
    ChoiceItem,
    createItemTemplate,
    addItemName,
    removeItemName,
    selectOptionName,
    setOptionsName
  };
}

// Every row list records itself as YouTube fills it, so the right-click menu can be found by its element later.
// The original method still runs, with the same arguments and result
function recordPanelMenus(namespace: PlayerNamespace) {
  const PanelMenuClass = Object.values(namespace).find(isPanelMenuClass);
  if (!PanelMenuClass) {
    return;
  }

  const panelMenuPrototype = PanelMenuClass.prototype;
  const classes = findMenuClasses({
    namespace,
    panelMenuPrototype
  });
  if (!classes) {
    return;
  }

  const addItem = readOwnFunction({
    target: panelMenuPrototype,
    name: classes.addItemName
  });
  if (!addItem) {
    return;
  }

  registry.classes = classes;
  writeMethod({
    target: panelMenuPrototype,
    name: classes.addItemName,
    method(...parameters) {
      rememberPanelMenu(this);
      return addItem.apply(this, parameters);
    }
  });
}

export function installNativeMenuRegistry() {
  if (registry.classes) {
    return;
  }

  onPlayerNamespace(recordPanelMenus);
}

function findOwnValue({ owner, predicate }: {
  owner: object;
  predicate: (value: unknown) => boolean;
}) {
  return Object.values(owner).find(predicate);
}

export interface NativeContextMenu {
  element: HTMLElement;
  popup: NativePopup;
  addItem: (item: NativeMenuItem) => void;
  removeItem: (item: NativeMenuItem) => void;
  close: () => void;
}

// YouTube keeps one right-click menu per player and shows its root panel on every open, so the row list in the
// document is that menu's own
export function getNativeContextMenu(): NativeContextMenu | null {
  const { classes } = registry;
  const elPanelMenu = document.querySelector(`${CONTEXT_MENU_SELECTOR} ${PANEL_MENU_SELECTOR}`);
  const panelMenu = elPanelMenu ? registry.panelMenusByElement.get(elPanelMenu) : undefined;
  const elPopup = elPanelMenu?.closest(POPUP_SELECTOR);
  if (!classes || !panelMenu || !elPopup) {
    return null;
  }

  const popup = findOwnValue({
    owner: panelMenu,
    predicate: value => isPopup(value) && value.element === elPopup
  });
  const addItem = readMethod({
    target: panelMenu,
    name: classes.addItemName
  });
  const removeItem = readMethod({
    target: panelMenu,
    name: classes.removeItemName
  });
  if (!isPopup(popup) || !addItem || !removeItem) {
    return null;
  }

  return {
    element: panelMenu.element,
    popup,
    addItem(item) {
      addItem.call(panelMenu, item, APPEND_TO_END);
    },
    removeItem(item) {
      removeItem.call(panelMenu, item);
    },
    close: () => popup.hide()
  };
}

export interface NativeChoiceRow {
  item: NativeMenuItem;
  setOptions: (options: string[]) => void;
  setSelected: (option: string) => void;
}

// YouTube's own row that opens a sub-panel of radio options, the way its quality and speed rows do: it builds the
// panel, its back button and its rows, shows the picked option beside the label, and reports every pick
export function createNativeChoiceRow({ label, icon, priority, player, popup, onSelect }: {
  label: string;
  icon: SVGElement;
  priority: number;
  player: HTMLElement;
  popup: NativePopup;
  onSelect: (option: string) => void;
}): NativeChoiceRow | null {
  const { classes } = registry;
  if (!classes) {
    return null;
  }

  const item = new classes.ChoiceItem(label, priority, player, popup);
  item.setIcon(icon);
  const setOptions = readMethod({
    target: item,
    name: classes.setOptionsName
  });
  const selectOption = readMethod({
    target: item,
    name: classes.selectOptionName
  });
  if (!setOptions || !selectOption) {
    item.dispose();
    return null;
  }

  item.subscribe(SELECT_EVENT, onSelect);
  return {
    item,
    setOptions(options) {
      setOptions.call(item, options);
    },
    setSelected(option) {
      selectOption.call(item, option);
    }
  };
}

export function createNativeCommandRow({ label, icon, priority, onClick }: {
  label: string;
  icon: SVGElement;
  priority: number;
  onClick: () => void;
}) {
  const { classes } = registry;
  if (!classes) {
    return null;
  }

  const item = new classes.MenuItem(classes.createItemTemplate(), priority, label);
  item.setIcon(icon);
  item.listen(CLICK_EVENT, onClick);
  return item;
}
