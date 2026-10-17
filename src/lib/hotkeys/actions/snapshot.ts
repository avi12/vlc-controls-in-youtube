import { showStatusInNativeBezel } from "@/lib/hotkeys/native/status-bezel";
import { formatFileTimestamp } from "@/lib/hotkeys/time-format";
import { getVideo, getVideoTitle, isPlaying, type YoutubePlayer } from "@/lib/player";
import { z } from "@/lib/zod";

const FORBIDDEN_FILENAME_CHARACTERS = /[/\\:*?"<>|]/g;
const SNAPSHOT_MIME_TYPE = "image/png";
const SNAPSHOT_SAVED_STATUS = "Snapshot saved";
const QUALITY_SWITCH_TIMEOUT_MS = 5000;
const SEEK_TOLERANCE_SECONDS = 0.001;

// YouTube lists the qualities best first; a paywalled one is listed but not playable
const qualityDataSchema = z.array(
  z.looseObject({
    quality: z.string().min(1),
    isPlayable: z.boolean().optional()
  })
);

let isCapturing = false;

function findBestQuality(player: YoutubePlayer) {
  const parsed = qualityDataSchema.safeParse(player.getAvailableQualityData?.());
  if (!parsed.success) {
    return null;
  }

  return parsed.data.find(level => level.isPlayable !== false)?.quality ?? null;
}

function captureFrame(player: YoutubePlayer) {
  const elVideo = getVideo(player);
  const isFrameAvailable = elVideo !== null && elVideo.videoWidth > 0;
  if (!isFrameAvailable) {
    return null;
  }

  const elCanvas = document.createElement("canvas");
  elCanvas.width = elVideo.videoWidth;
  elCanvas.height = elVideo.videoHeight;
  elCanvas.getContext("2d")?.drawImage(elVideo, 0, 0);
  try {
    return elCanvas.toDataURL(SNAPSHOT_MIME_TYPE);
  } catch {
    return null;
  }
}

function isFrameShown(player: YoutubePlayer) {
  const elVideo = getVideo(player);
  return elVideo !== null && elVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !elVideo.seeking;
}

function isFrameShownAt({ player, time }: {
  player: YoutubePlayer;
  time: number;
}) {
  const elVideo = getVideo(player);
  return isFrameShown(player)
    && elVideo !== null
    && Math.abs(elVideo.currentTime - time) < SEEK_TOLERANCE_SECONDS;
}

// Switching quality reloads the video, so the new stream's frame shows a beat later - or never, if the switch stalls
function waitFor(isDone: () => boolean) {
  const startedAt = performance.now();
  return new Promise<void>(resolve => {
    function check() {
      const isTimedOut = performance.now() - startedAt > QUALITY_SWITCH_TIMEOUT_MS;
      if (isTimedOut || isDone()) {
        resolve();
        return;
      }

      requestAnimationFrame(check);
    }

    check();
  });
}

// YouTube's auto quality often streams below the video's best, so the frame is grabbed at the best quality,
// paused on the same moment, and the viewer's own quality setting is put back afterwards
async function captureBestFrame(player: YoutubePlayer) {
  const bestQuality = findBestQuality(player);
  const preferredQuality = player.getPreferredQuality?.();
  const isBestQualityShown = bestQuality === null || player.getPlaybackQuality?.() === bestQuality;
  if (isBestQualityShown || !preferredQuality || !player.setPlaybackQualityRange) {
    return captureFrame(player);
  }

  const wasPlaying = isPlaying(player);
  player.pauseVideo();
  const pausedAt = player.getCurrentTime();
  player.setPlaybackQualityRange(bestQuality, bestQuality);
  await waitFor(() => player.getPlaybackQuality?.() === bestQuality && isFrameShown(player));

  // YouTube reloads the new stream a little before the paused moment
  const isAtPausedFrame = isFrameShownAt({
    player,
    time: pausedAt
  });
  if (!isAtPausedFrame) {
    player.seekTo(pausedAt, true);
    await waitFor(() => isFrameShownAt({
      player,
      time: pausedAt
    }));
  }

  const frameUrl = captureFrame(player);
  player.setPlaybackQualityRange(preferredQuality, preferredQuality);

  if (wasPlaying) {
    player.playVideo();
  }

  return frameUrl;
}

function downloadFile({ url, filename }: {
  url: string;
  filename: string;
}) {
  const elLink = document.createElement("a");
  elLink.href = url;
  elLink.download = filename;
  elLink.click();
}

export async function takeSnapshot(player: YoutubePlayer) {
  if (isCapturing) {
    return;
  }

  isCapturing = true;
  const capturedAt = player.getCurrentTime();
  const frameUrl = await captureBestFrame(player).finally(() => {
    isCapturing = false;
  });
  if (!frameUrl) {
    return;
  }

  const title = getVideoTitle(player).replaceAll(FORBIDDEN_FILENAME_CHARACTERS, "_");
  downloadFile({
    url: frameUrl,
    filename: `${title} - ${formatFileTimestamp(capturedAt)}.png`
  });
  showStatusInNativeBezel({
    player,
    text: SNAPSHOT_SAVED_STATUS
  });
}
