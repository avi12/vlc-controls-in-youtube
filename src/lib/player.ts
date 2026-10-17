import { isMusicSite } from "@/lib/site";
import { createTypeGuard, z } from "@/lib/zod";

// Every YouTube player shares this class: the watch page's, Shorts' and the embed's
export const PLAYER_SELECTOR = ".html5-video-player";
const MAIN_VIDEO_SELECTOR = "video.html5-main-video";
const SHORTS_PLAYER_ID = "shorts-player";
const EMBED_PATH_PREFIX = "/embed/";

// YouTube's player variants differ in which of YouTube's own keys they honor; YouTube Music's honors none
export enum PlayerKind {
  Watch = "watch",
  Shorts = "shorts",
  Embed = "embed",
  Music = "music"
}

enum PlayerState {
  Unstarted = -1,
  Ended = 0,
  Playing = 1,
  Paused = 2,
  Buffering = 3,
  Cued = 5
}

export interface YoutubePlayer extends HTMLElement {
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): PlayerState;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  nextVideo?(): void;
  previousVideo?(): void;
  getOption?(module: string, option: string, parameters?: Record<string, unknown>): unknown;
  setOption?(module: string, option: string, value: unknown): void;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
  getAudioTrack?(): unknown;
  getAvailableAudioTracks?(): unknown;
  setAudioTrack?(track: unknown): unknown;
  setLoopVideo?(isLoop: boolean): void;
  getVideoData?(): unknown;
  getPlayerResponse?(): unknown;
  hideControls?(): void;
  showControls?(): void;
  getSphericalProperties?(): unknown;
  getPlaybackQuality?(): string;
  getPreferredQuality?(): string;
  getAvailableQualityData?(): unknown;
  setPlaybackQualityRange?(minimumQuality: string, maximumQuality: string): void;
}

function isFunctionValue(value: unknown) {
  return typeof value === "function";
}

export const functionSchema = z.custom<(...parameters: unknown[]) => unknown>(isFunctionValue);

const playerApiSchema = z.object({
  playVideo: functionSchema,
  pauseVideo: functionSchema,
  getPlayerState: functionSchema,
  seekTo: functionSchema,
  getCurrentTime: functionSchema,
  getDuration: functionSchema,
  getVolume: functionSchema,
  setVolume: functionSchema,
  isMuted: functionSchema,
  mute: functionSchema,
  unMute: functionSchema,
  getPlaybackRate: functionSchema,
  setPlaybackRate: functionSchema,
  getAvailablePlaybackRates: functionSchema
});

const isPlayerApi = createTypeGuard<Omit<YoutubePlayer, keyof HTMLElement>>(playerApiSchema);

function isYoutubePlayer(element: Element | null): element is YoutubePlayer {
  return element instanceof HTMLElement && isPlayerApi(element);
}

const videoDataSchema = z.object({ title: z.string() });

// A 360° video reports its view; any other video reports an empty object
const sphericalPropertiesSchema = z.object({ fov: z.number() });

// Re-queried on every call: YouTube's SPA swaps players and <video> sources without a reload, and keeps the
// watch page's player mounted but hidden while Shorts plays in its own
export function getPlayer() {
  for (const elPlayer of document.querySelectorAll(PLAYER_SELECTOR)) {
    if (isYoutubePlayer(elPlayer) && elPlayer.checkVisibility()) {
      return elPlayer;
    }
  }
  return null;
}

export function getVideo(player: YoutubePlayer) {
  const elVideo = player.querySelector(MAIN_VIDEO_SELECTOR);
  return elVideo instanceof HTMLVideoElement ? elVideo : null;
}

export function getPlayerKind(player: YoutubePlayer) {
  if (isMusicSite()) {
    return PlayerKind.Music;
  }

  if (player.id === SHORTS_PLAYER_ID) {
    return PlayerKind.Shorts;
  }

  return location.pathname.startsWith(EMBED_PATH_PREFIX) ? PlayerKind.Embed : PlayerKind.Watch;
}

export function isShortsPlayer(player: YoutubePlayer) {
  return getPlayerKind(player) === PlayerKind.Shorts;
}

export function isMainVideo(target: EventTarget | null) {
  return target instanceof HTMLVideoElement && target.matches(`${PLAYER_SELECTOR} ${MAIN_VIDEO_SELECTOR}`);
}

export function getVideoTitle(player: YoutubePlayer) {
  const parsed = videoDataSchema.safeParse(player.getVideoData?.());
  return parsed.success && parsed.data.title ? parsed.data.title : document.title;
}

export function isSphericalVideo(player: YoutubePlayer) {
  return sphericalPropertiesSchema.safeParse(player.getSphericalProperties?.()).success;
}

export function isPlaying(player: YoutubePlayer) {
  const state = player.getPlayerState();
  return state === PlayerState.Playing || state === PlayerState.Buffering;
}

// A song, episode or video is playing or paused, as opposed to nothing loaded or a finished queue
export function isMediaActive(player: YoutubePlayer) {
  return isPlaying(player) || player.getPlayerState() === PlayerState.Paused;
}
