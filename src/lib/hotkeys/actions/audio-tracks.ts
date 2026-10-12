import { showStatusInNativeBezel } from "@/lib/hotkeys/native/status-bezel";
import type { YoutubePlayer } from "@/lib/player";
import { z } from "@/lib/zod";

const AUDIO_TRACK_SCHEMA = z.looseObject({ id: z.string() });
// getLanguageInfo() carries YouTube's own localized track name ("English (US) original")
const NAMED_AUDIO_TRACK_SCHEMA = z.looseObject({
  getLanguageInfo: z.custom<() => unknown>(value => typeof value === "function")
});
const LANGUAGE_INFO_SCHEMA = z.looseObject({ name: z.string() });

const MULTIPLE_TRACKS_MIN = 2;
const AUDIO_TRACK_STATUS_PREFIX = "Audio track: ";

function readTrackId(track: unknown) {
  const parsed = AUDIO_TRACK_SCHEMA.safeParse(track);
  return parsed.success ? parsed.data.id : undefined;
}

function isSameTrack({ track, activeTrack }: {
  track: unknown;
  activeTrack: unknown;
}) {
  if (track === activeTrack) {
    return true;
  }

  const trackId = readTrackId(track);
  return trackId !== undefined && trackId === readTrackId(activeTrack);
}

function readTrackName(track: unknown) {
  const parsedTrack = NAMED_AUDIO_TRACK_SCHEMA.safeParse(track);
  if (!parsedTrack.success) {
    return;
  }

  const parsedInfo = LANGUAGE_INFO_SCHEMA.safeParse(parsedTrack.data.getLanguageInfo.call(track));
  return parsedInfo.success ? parsedInfo.data.name : undefined;
}

function showTrack({ player, track }: {
  player: YoutubePlayer;
  track: unknown;
}) {
  const name = readTrackName(track);
  if (!name) {
    return;
  }

  showStatusInNativeBezel({
    player,
    text: `${AUDIO_TRACK_STATUS_PREFIX}${name}`
  });
}

// Only a track YouTube names can be told apart in a menu or a bezel, so the unnamed ones are left out
function readNamedTracks(player: YoutubePlayer) {
  const parsedTracks = z.array(z.unknown()).safeParse(player.getAvailableAudioTracks?.());
  const tracks = parsedTracks.success ? parsedTracks.data : [];
  return tracks.flatMap(track => {
    const name = readTrackName(track);
    return name ? [{
      track,
      name
    }] : [];
  });
}

export function getAudioTrackNames(player: YoutubePlayer) {
  return readNamedTracks(player).map(({ name }) => name);
}

export function getActiveAudioTrackName(player: YoutubePlayer) {
  return readTrackName(player.getAudioTrack?.()) ?? null;
}

export function selectAudioTrack({ player, name }: {
  player: YoutubePlayer;
  name: string;
}) {
  const namedTrack = readNamedTracks(player).find(candidate => candidate.name === name);
  if (!namedTrack || !player.setAudioTrack) {
    return;
  }

  player.setAudioTrack(namedTrack.track);
  showTrack({
    player,
    track: namedTrack.track
  });
}

export function cycleAudioTrack(player: YoutubePlayer) {
  const tracks = readNamedTracks(player).map(({ track }) => track);
  const activeTrack = player.getAudioTrack?.();
  if (!player.setAudioTrack || tracks.length < MULTIPLE_TRACKS_MIN) {
    showTrack({
      player,
      track: activeTrack
    });
    return;
  }

  const iActive = tracks.findIndex(track => isSameTrack({
    track,
    activeTrack
  }));
  const nextTrack = tracks[(iActive + 1) % tracks.length];
  player.setAudioTrack(nextTrack);
  showTrack({
    player,
    track: nextTrack
  });
}
