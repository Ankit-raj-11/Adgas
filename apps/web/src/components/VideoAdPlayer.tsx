'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  CheckCircle2,
  ShieldCheck,
  X,
  ExternalLink,
  Sparkles,
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
  kind: 'youtube' | 'direct' | 'generic';
  embedUrl: string;
  originalUrl: string;
  videoId?: string;
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
    const videoId = ytMatch[1];
    // Loop with playlist=videoId so even if the sponsor video is shorter than 30s, it loops smoothly
    // enablejsapi=1 allows controlling mute via postMessage
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${encodeURIComponent(
        typeof window !== 'undefined' ? window.location.origin : ''
      )}`,
      originalUrl: url,
      videoId,
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
  durationSeconds = 30, // Default to strict 30-second requirement
  autoStart = true,
  onPlayStateChange,
  onAdComplete,
  isUnlocked = false,
  onClose,
}: VideoAdPlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(autoStart);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationSeconds);
  const [isCompleted, setIsCompleted] = useState<boolean>(isUnlocked);

  const trackerRef = useRef<AdSessionTracker | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!trackerRef.current) {
    trackerRef.current = new AdSessionTracker({ campaignId, brandName, durationSeconds });
  }

  const onAdCompleteRef = useRef(onAdComplete);
  onAdCompleteRef.current = onAdComplete;

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  onPlayStateChangeRef.current = onPlayStateChange;

  const media = parseMediaSource(videoUrl);

  // If already unlocked from parent
  useEffect(() => {
    if (isUnlocked && !isCompleted) {
      setIsCompleted(true);
      setRemainingSeconds(0);
    }
  }, [isUnlocked, isCompleted]);

  // Reverse countdown timer loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying && !isCompleted) {
      interval = setInterval(() => {
        const tracker = trackerRef.current;
        if (!tracker) return;

        tracker.tick(1);
        const rem = Math.max(0, durationSeconds - tracker.watchedSeconds);
        setRemainingSeconds(rem);

        if (tracker.isComplete || rem === 0) {
          setIsPlaying(false);
          setIsCompleted(true);
          try {
            const proof = tracker.generateCompletionProof();
            onAdCompleteRef.current(proof);
          } catch (err) {
            console.error('Failed to issue completion proof:', err);
          }
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, isCompleted, durationSeconds]);

  // Audio mute/unmute control (single control button)
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (media.kind === 'youtube' && iframeRef.current?.contentWindow) {
      const func = nextMuted ? 'mute' : 'unMute';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args: [] }),
        '*'
      );
    } else if (media.kind === 'direct' && videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleClaimAndClose = () => {
    if (!isCompleted && remainingSeconds > 0) return;
    try {
      if (trackerRef.current) {
        if (!trackerRef.current.isComplete) {
          trackerRef.current.tick(durationSeconds);
        }
        const proof = trackerRef.current.generateCompletionProof();
        onAdCompleteRef.current(proof);
      }
    } catch {
      // Ignore if already generated
    }
    onClose?.();
  };

  const progressPercent = Math.min(
    100,
    Math.round(((durationSeconds - remainingSeconds) / durationSeconds) * 100)
  );

  return (
    /* Modal Backdrop Overlay: centered, non-fixed positioning on page */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sponsor-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200"
    >
      {/* 70% Viewport Modal Container */}
      <div className="relative w-[92vw] md:w-[70vw] max-w-4xl h-[70vh] min-h-[460px] max-h-[640px] bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden select-none">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-900/90 border-b border-neutral-800/80 z-20">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-naka-orange animate-pulse" />
            <span id="sponsor-modal-title" className="text-xs font-mono font-bold tracking-wider uppercase text-white">
              SPONSOR SPOTLIGHT
            </span>
            <div className="hidden sm:flex items-center space-x-1.5 text-[11px] font-mono text-neutral-300 bg-neutral-800/80 px-2.5 py-0.5 rounded-full border border-neutral-700">
              <ShieldCheck className="w-3.5 h-3.5 text-naka-orange" />
              <span>{brandName}</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Reverse Countdown Indicator (30 -> 1 -> 0) */}
            {remainingSeconds > 0 ? (
              <div className="flex items-center space-x-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full font-mono text-xs text-amber-300 shadow-inner">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="font-bold">{remainingSeconds}s</span>
                <span className="text-[10px] text-amber-200/70 hidden xs:inline">remaining</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/40 rounded-full font-mono text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-bold">Verified ($0 Gas)</span>
              </div>
            )}

            {/* Cross Button: Strictly hidden until timer hits 0 */}
            {remainingSeconds === 0 ? (
              <button
                type="button"
                onClick={handleClaimAndClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                title="Claim Gas Subsidy and Close"
                aria-label="Close sponsor ad"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <div
                className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-600 flex items-center justify-center cursor-not-allowed"
                title="Watch at least 30 seconds to close"
              >
                <X className="w-4 h-4 opacity-40" />
              </div>
            )}
          </div>
        </div>

        {/* Video Canvas Viewport */}
        <div className="relative flex-1 w-full bg-black text-white flex flex-col items-center justify-center overflow-hidden">
          {media.kind === 'youtube' ? (
            <iframe
              ref={iframeRef}
              src={media.embedUrl}
              title={adTitle}
              className="w-full h-full border-0 pointer-events-auto"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : media.kind === 'direct' ? (
            <video
              ref={videoRef}
              src={media.embedUrl}
              autoPlay
              muted={isMuted}
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-6 text-neutral-400 font-sans">
              <p className="text-sm">Video media loading...</p>
            </div>
          )}

          {/* Single Audio Control Button (Unmute / Mute) */}
          <div className="absolute top-4 left-4 z-30">
            <button
              type="button"
              onClick={handleToggleMute}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all text-xs font-sans font-medium cursor-pointer active:scale-95 shadow-lg"
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-amber-400" />
                  <span>Unmute Audio</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>Mute Audio</span>
                </>
              )}
            </button>
          </div>

          {/* Reverse Timer Badge floating over video */}
          {remainingSeconds > 0 && (
            <div className="absolute bottom-5 right-5 z-30 pointer-events-none">
              <div className="flex items-center space-x-2 px-4 py-2 rounded-2xl bg-black/75 border border-white/15 backdrop-blur-md text-white font-mono text-xs shadow-xl">
                <span className="text-neutral-400">Unlock Gas in:</span>
                <span className="text-naka-orange font-bold text-sm tracking-wide">
                  {remainingSeconds}s
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar & Completion Action Footer */}
        <div className="bg-neutral-900 border-t border-neutral-800 z-20">
          {/* Reverse Progress Strip */}
          <div className="relative w-full h-1 bg-neutral-800">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                remainingSeconds === 0 ? 'bg-emerald-500' : 'bg-naka-orange'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-400">
              {remainingSeconds > 0 ? (
                <span>
                  Must watch <strong className="text-white">30 seconds</strong> for Arc gas sponsorship
                </span>
              ) : (
                <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>30s requirement satisfied! Gas sponsorship active.</span>
                </span>
              )}
            </div>

            {remainingSeconds === 0 ? (
              <button
                type="button"
                onClick={handleClaimAndClose}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs font-sans tracking-wide transition-all cursor-pointer shadow-lg active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 fill-black" />
                <span>Claim $0 Gas & Close</span>
              </button>
            ) : (
              <div className="text-[11px] font-mono text-neutral-500">
                Close button unlocks at 0s
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
