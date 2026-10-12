import { createMenuIcon } from "@/lib/context-menu/menu-icons";
import {
  CHOICE_ROWS,
  type ChoiceRowModel,
  COMMAND_ROWS,
  type CommandRowModel,
  MenuRow,
  TOGGLE_ROW
} from "@/lib/context-menu/menu-model";
import {
  createNativeChoiceRow,
  createNativeCommandRow,
  getNativeContextMenu,
  installNativeMenuRegistry,
  type NativeChoiceRow,
  type NativeContextMenu,
  type NativeMenuItem
} from "@/lib/context-menu/native-menu";
import { isCopyRetired, isVlcControlsEnabled, onEnabledChange } from "@/lib/enabled-flag";
import { getPlayer, type YoutubePlayer } from "@/lib/player";

interface MenuRows {
  choices: Map<MenuRow, NativeChoiceRow>;
  commands: Map<MenuRow, NativeMenuItem>;
  toggle: NativeMenuItem | null;
}

// YouTube appends its own rows in order and sorts the rest by priority, so ours stay below them, in the order
// they are added: the toggle leads our own block, the controls follow it
const ROW_ORDER = [TOGGLE_ROW, ...CHOICE_ROWS, ...COMMAND_ROWS].map(model => model.id);

const rowsByMenu = new WeakMap<Element, MenuRows>();

function getRowPriority(id: MenuRow) {
  return -(ROW_ORDER.indexOf(id) + 1);
}

function dropRow({ menu, item }: {
  menu: NativeContextMenu;
  item: NativeMenuItem;
}) {
  menu.removeItem(item);
  item.dispose();
}

// Switched off, the menu keeps nothing but the row that switches the controls back on
function dropControlRows({ menu, rows }: {
  menu: NativeContextMenu;
  rows: MenuRows;
}) {
  for (const { item } of rows.choices.values()) {
    dropRow({
      menu,
      item
    });
  }
  for (const item of rows.commands.values()) {
    dropRow({
      menu,
      item
    });
  }
  rows.choices.clear();
  rows.commands.clear();
}

function dropAllRows({ menu, rows }: {
  menu: NativeContextMenu;
  rows: MenuRows;
}) {
  dropControlRows({
    menu,
    rows
  });

  if (!rows.toggle) {
    return;
  }

  dropRow({
    menu,
    item: rows.toggle
  });
  rows.toggle = null;
}

// Every pick acts on whichever player is on screen now, not the one the row was built for, since YouTube swaps
// players without rebuilding its menu
function createChoiceRow({ model, menu, player }: {
  model: ChoiceRowModel;
  menu: NativeContextMenu;
  player: YoutubePlayer;
}) {
  return createNativeChoiceRow({
    label: model.label,
    icon: createMenuIcon(model.id),
    priority: getRowPriority(model.id),
    player,
    popup: menu.popup,
    async onSelect(option) {
      const pickedPlayer = getPlayer();
      menu.close();

      if (!pickedPlayer) {
        return;
      }

      await model.select({
        player: pickedPlayer,
        option
      });
    }
  });
}

// The options are read afresh on every open: the video, its tracks and its speed all change under the menu
function syncChoiceRow({ model, menu, player, rows }: {
  model: ChoiceRowModel;
  menu: NativeContextMenu;
  player: YoutubePlayer;
  rows: MenuRows;
}) {
  const options = model.readOptions(player);
  const existingRow = rows.choices.get(model.id);
  if (options.length === 0) {
    if (existingRow) {
      dropRow({
        menu,
        item: existingRow.item
      });
      rows.choices.delete(model.id);
    }

    return;
  }

  const row = existingRow ?? createChoiceRow({
    model,
    menu,
    player
  });
  if (!row) {
    return;
  }

  if (!existingRow) {
    rows.choices.set(model.id, row);
    menu.addItem(row.item);
  }

  row.setOptions(options);
  const selected = model.readSelected(player);
  if (selected !== null) {
    row.setSelected(selected);
  }
}

function syncCommandRow({ model, menu, rows }: {
  model: CommandRowModel;
  menu: NativeContextMenu;
  rows: MenuRows;
}) {
  if (rows.commands.has(model.id)) {
    return;
  }

  const item = createNativeCommandRow({
    label: model.label,
    icon: createMenuIcon(model.id),
    priority: getRowPriority(model.id),
    async onClick() {
      const clickedPlayer = getPlayer();
      menu.close();

      if (!clickedPlayer) {
        return;
      }

      await model.run(clickedPlayer);
    }
  });
  if (!item) {
    return;
  }

  item.setContent(model.shortcut);
  rows.commands.set(model.id, item);
  menu.addItem(item);
}

// The row reads the state when it is clicked, not when it is built, since the viewer may switch the controls from
// the toolbar while the menu sits open
function syncToggleRow({ menu, rows }: {
  menu: NativeContextMenu;
  rows: MenuRows;
}) {
  const item = rows.toggle ?? createNativeCommandRow({
    label: TOGGLE_ROW.label,
    icon: createMenuIcon(TOGGLE_ROW.id),
    priority: getRowPriority(TOGGLE_ROW.id),
    async onClick() {
      menu.close();
      await TOGGLE_ROW.flip();
    }
  });
  if (!item) {
    return;
  }

  if (!rows.toggle) {
    rows.toggle = item;
    menu.addItem(item);
  }

  item.setContent(TOGGLE_ROW.readValue());
}

function syncContextMenu() {
  const menu = getNativeContextMenu();
  if (!menu) {
    return;
  }

  const rows = rowsByMenu.get(menu.element) ?? {
    choices: new Map(),
    commands: new Map(),
    toggle: null
  };
  rowsByMenu.set(menu.element, rows);

  const player = getPlayer();
  // A retired copy leaves YouTube's menu as YouTube's own, for the copy that took over to fill
  if (isCopyRetired() || !player) {
    dropAllRows({
      menu,
      rows
    });
    return;
  }

  syncToggleRow({
    menu,
    rows
  });

  if (!isVlcControlsEnabled()) {
    dropControlRows({
      menu,
      rows
    });
    return;
  }

  for (const model of CHOICE_ROWS) {
    syncChoiceRow({
      model,
      menu,
      player,
      rows
    });
  }
  for (const model of COMMAND_ROWS) {
    syncCommandRow({
      model,
      menu,
      rows
    });
  }
}

// VLC's right-click submenus, built from YouTube's own menu components: the rows are read back from the player
// every time the menu opens, which is the first moment YouTube itself has finished building it
export function installContextMenu() {
  installNativeMenuRegistry();
  document.addEventListener("contextmenu", () => requestAnimationFrame(syncContextMenu), {
    capture: true,
    passive: true
  });
  onEnabledChange(syncContextMenu);
}
