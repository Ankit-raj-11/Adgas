'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  Film,
} from 'lucide-react';
import { AdSessionTracker, AdCompletionProof } from '../lib/adSession';

export interface VideoAdPlayerProps {
  campaignId: string;
  brandName: string;
  adTitle: string;
  videoUrl?: string;
  durationSeconds?: number;
  autoStart?: boolean;
  isPlayingOverride?: boolean;
  onPlayStateChange?: (isPlaying: boolean, remainingSeconds: number) => void;
  onAdComplete: (proof: AdCompletionProof) => void;
  isUnlocked?: boolean;
  onClose?: () => void;
}

/**
 * Helper to identify and parse YouTube, direct MP4, or generic video links
 */
function parseMediaSource(rawUrl?: string): {
  kind: 'youtube' | 'instagram' | 'direct' | 'generic';
  embedUrl: string;
  originalUrl: string;
} {
  if (!rawUrl || !rawUrl.trim()) {
    return { kind: 'generic', embedUrl: '', originalUrl: '' };
  }

  const url = rawUrl.trim();

  // YouTube match: youtu.be/<id> or youtube.com/watch?v=<id> or embed/<id>
  const ytMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=1&playsinline=1&modestbranding=1&rel=0`,
      originalUrl: url,
    };
  }

  // Instagram match: instagram.com/reel/<id> or instagram.com/p/<id>
  const instaMatch = url.match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i);
  if (instaMatch && instaMatch[1]) {
    return {
      kind: 'instagram',
      embedUrl: `https://www.instagram.com/reel/${instaMatch[1]}/embed/`,
      originalUrl: url,
    };
  }

  // Direct MP4 / WebM
  if (url.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) {
    return { kind: 'direct', embedUrl: url, originalUrl: url };
  }

  return { kind: 'generic', embedUrl: url, originalUrl: url };
}

export function VideoAdPlayer({
  campaignId,
  brandName,
  adTitle,
  videoUrl,
  durationSeconds = 10,
  autoStart = false,
  isPlayingOverride,
  onPlayStateChange,
  onAdComplete,
  isUnlocked = false,
  onClose,
}: VideoAdPlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(autoStart);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [watchedSeconds, setWatchedSeconds] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(isUnlocked);

  const trackerRef = useRef<AdSessionTracker>(
    new AdSessionTracker({ campaignId, brandName, durationSeconds })
  );

  const media = parseMediaSource(videoUrl);

  useEffect(() => {
    if (isPlayingOverride !== undefined && !isCompleted) {
      setIsPlaying(isPlayingOverride);
    }
  }, [isPlayingOverride, isCompleted]);

  useEffect(() => {
    if (isUnlocked && !isCompleted) {
      setIsCompleted(true);
    }
  }, [isUnlocked, isCompleted]);

  const remainingSeconds = Math.max(0, durationSeconds - watchedSeconds);

  useEffect(() => {
    onPlayStateChange?.(isPlaying, remainingSeconds);
  }, [isPlaying, remainingSeconds, onPlayStateChange]);

  // Handle timer countdown during active playback
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying && !isCompleted) {
      interval = setInterval(() => {
        const tracker = trackerRef.current;
        tracker.tick(1);
        setWatchedSeconds(tracker.watchedSeconds);

        if (tracker.isComplete) {
          setIsPlaying(false);
          setIsCompleted(true);
          try {
            const proof = tracker.generateCompletionProof();
            onAdComplete(proof);
          } catch (err) {
            console.error('Failed to issue completion proof:', err);
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, isCompleted, onAdComplete]);

  const handleTogglePlay = () => {
    if (isCompleted) return;
    setIsPlaying((prev) => !prev);
  };

  const handleRestart = () => {
    trackerRef.current.reset();
    setWatchedSeconds(0);
    setIsCompleted(false);
    setIsPlaying(true);
  };

  const progressPercent = Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100));

  // If completed, render verified subsidy badge
  if (isCompleted) {
    return (
      <div className="w-full bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-naka-green text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-naka-dark flex items-center gap-1.5 font-sans">
                <span>Gas Fee Sponsored</span>
                <span className="text-[10px] font-mono text-naka-green bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  $0.00 GAS
                </span>
              </div>
              <p className="text-[11px] text-naka-muted font-sans mt-0.5">
                Arc gas subsidized by <strong className="text-naka-dark font-medium">{brandName}</strong>. Ready to sign.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleRestart}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-[11px] font-mono text-naka-muted hover:text-naka-dark bg-white border border-naka-border hover:border-naka-dark/30 transition-all cursor-pointer shadow-2xs"
              title="Replay Video"
            >
              <RefreshCw className="w-3 h-3 text-naka-muted" />
              <span>Replay</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white border border-naka-border rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
      {/* Spotlight Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-naka-border bg-naka-surface">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-naka-orange animate-pulse" />
          <span className="text-[10px] font-mono font-semibold tracking-wider uppercase text-naka-dark">
            SPONSOR SPOTLIGHT
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-[10px] font-mono text-naka-muted bg-white px-2.5 py-0.5 rounded-full border border-naka-border">
            <ShieldCheck className="w-3 h-3 text-naka-orange" />
            <span>{brandName.toUpperCase()}</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-naka-muted hover:text-naka-dark font-mono px-1.5"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport / Canvas */}
      <div className="relative aspect-video w-full bg-naka-dark text-white flex flex-col items-center justify-center select-none overflow-hidden">
        {/* Render Real Media if Available */}
        {media.kind === 'youtube' && isPlaying ? (
          <iframe
            src={media.embedUrl}
            title={adTitle}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : media.kind === 'instagram' && isPlaying ? (
          <iframe
            src={media.embedUrl}
            title={adTitle}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
          />
        ) : media.kind === 'direct' && isPlaying ? (
          <video
            src={media.embedUrl}
            autoPlay
            muted={isMuted}
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          /* Sleek Styled Spotlight Canvas */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-30 pointer-events-none" />

            <button
              type="button"
              onClick={handleTogglePlay}
              className="w-14 h-14 rounded-full bg-naka-orange hover:bg-naka-orange-hover text-white shadow-xl flex items-center justify-center mb-3 cursor-pointer transform hover:scale-105 active:scale-95 transition-all duration-200"
              aria-label={isPlaying ? 'Pause Video' : 'Play Video'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-white" />
              ) : (
                <Play className="w-6 h-6 translate-x-0.5 fill-white" />
              )}
            </button>

            <h4 className="text-sm sm:text-base font-bold text-white tracking-tight font-display max-w-sm">
              {adTitle}
            </h4>

            <p className="mt-1 text-xs text-neutral-400 font-sans">
              Watch sponsor spotlight to unlock $0 gas fees
            </p>

            {videoUrl && (
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-[10px] font-mono text-neutral-400 hover:text-white flex items-center space-x-1 underline"
              >
                <span>YouTube Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Video Overlay Progress Bar & Countdown (Always visible while playing) */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent p-3 flex flex-col space-y-1.5 z-20">
          <div className="relative w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500 ease-linear bg-naka-orange"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-300 pt-0.5 font-mono">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              </button>
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <span>
                {progressPercent}% watched
              </span>
            </div>

            <span className="font-semibold text-naka-orange animate-pulse">
              {progressPercent < 100 ? 'Watching Sponsor Video...' : 'Verified!'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
