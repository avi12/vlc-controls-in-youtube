import { isVlcControlsEnabled } from "@/lib/enabled-flag";
import { ASPECT_RATIOS, getAspectRatioLabel, selectAspectRatio } from "@/lib/hotkeys/actions/aspect-ratio";
import { getActiveAudioTrackName, getAudioTrackNames, selectAudioTrack } from "@/lib/hotkeys/actions/audio-tracks";
import { toggleControls } from "@/lib/hotkeys/actions/controls-visibility";
import { takeSnapshot } from "@/lib/hotkeys/actions/snapshot";
import { getSpeedLabel, getSpeedLabels, selectSpeedLabel } from "@/lib/hotkeys/actions/speed";
import { getActiveSubtitleLabel, getSubtitleLabels, selectSubtitleLabel } from "@/lib/hotkeys/actions/subtitles";
import type { YoutubePlayer } from "@/lib/player";
import { ShortcutStyle } from "@/lib/shortcut";
import { findBinding, formatActionShortcut, VlcAction } from "@/lib/vlc-keymap";
import { WorldMessage, worldMessenger } from "@/lib/world-messaging";

// VLC's own right-click sections: what plays, what it sounds like, how it looks and what it reads
export enum MenuRow {
  Speed = "speed",
  AudioTrack = "audio-track",
  SubtitleTrack = "subtitle-track",
  AspectRatio = "aspect-ratio",
  Snapshot = "snapshot",
  Controls = "controls",
  Toggle = "toggle"
}

// What the toggle row shows beside its label, since YouTube's rows have no switch of their own
enum ToggleValue {
  On = "On",
  Off = "Off"
}

// A row that opens a sub-panel of the choices VLC offers for that control, with the current one checked
export interface ChoiceRowModel {
  id: MenuRow;
  label: string;
  readOptions: (player: YoutubePlayer) => string[];
  readSelected: (player: YoutubePlayer) => string | null;
  select: (parameters: {
    player: YoutubePlayer;
    option: string;
  }) => Promise<void> | void;
}

// A row that acts at once, labelled and keyed by the VLC binding it runs
export interface CommandRowModel {
  id: MenuRow;
  label: string;
  shortcut: string;
  run: (player: YoutubePlayer) => Promise<void> | void;
}

const TOGGLE_LABEL = "VLC shortcuts";
const NO_SHORTCUT = "";

export const CHOICE_ROWS: ChoiceRowModel[] = [
  {
    id: MenuRow.Speed,
    label: "Speed",
    readOptions: getSpeedLabels,
    readSelected: getSpeedLabel,
    select: ({ player, option }) => selectSpeedLabel({
      player,
      label: option
    })
  },
  {
    id: MenuRow.AudioTrack,
    label: "Audio track",
    readOptions: getAudioTrackNames,
    readSelected: getActiveAudioTrackName,
    select: ({ player, option }) => selectAudioTrack({
      player,
      name: option
    })
  },
  {
    id: MenuRow.SubtitleTrack,
    label: "Subtitle track",
    readOptions: getSubtitleLabels,
    readSelected: getActiveSubtitleLabel,
    select: ({ player, option }) => selectSubtitleLabel({
      player,
      label: option
    })
  },
  {
    id: MenuRow.AspectRatio,
    label: "Aspect ratio",
    readOptions: () => ASPECT_RATIOS.map(aspectRatio => aspectRatio.label),
    readSelected: getAspectRatioLabel,
    select: ({ player, option }) => selectAspectRatio({
      player,
      label: option
    })
  }
];

// The binding is the single source of both the row's wording and the key beside it
function createActionRow({ id, action, run }: {
  id: MenuRow;
  action: VlcAction;
  run: (player: YoutubePlayer) => void;
}): CommandRowModel {
  return {
    id,
    label: findBinding(action)?.label ?? "",
    shortcut: formatActionShortcut({
      action,
      style: ShortcutStyle.Tooltip
    }) ?? NO_SHORTCUT,
    run
  };
}

export const COMMAND_ROWS: CommandRowModel[] = [
  createActionRow({
    id: MenuRow.Snapshot,
    action: VlcAction.Snapshot,
    run: takeSnapshot
  }),
  createActionRow({
    id: MenuRow.Controls,
    action: VlcAction.ToggleControls,
    run: toggleControls
  })
];

// The one row that stays whichever way the controls are switched, so the menu that turned them off is also the
// one that turns them back on. It switches this tab alone, and only the isolated world reaches storage, so the
// switch travels over the world channel
export const TOGGLE_ROW = {
  id: MenuRow.Toggle,
  label: TOGGLE_LABEL,
  readValue: () => isVlcControlsEnabled() ? ToggleValue.On : ToggleValue.Off,
  flip: () => worldMessenger.sendMessage(WorldMessage.SetTabEnabled, !isVlcControlsEnabled())
};
