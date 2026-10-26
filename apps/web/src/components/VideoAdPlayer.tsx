'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, CheckCircle, Sparkles, RefreshCw, ShieldCheck } from 'lucide-react';
import { AdSessionTracker, AdCompletionProof } from '../lib/adSession';

export interface VideoAdPlayerProps {
  campaignId: string;
  brandName: string;
  adTitle: string;
  durationSeconds?: number;
  onAdComplete: (proof: AdCompletionProof) => void;
  isUnlocked?: boolean;
}

export function VideoAdPlayer({
  campaignId,
  brandName,
  adTitle,
  durationSeconds = 5,
  onAdComplete,
  isUnlocked = false,
}: VideoAdPlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [watchedSeconds, setWatchedSeconds] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(isUnlocked);

  const trackerRef = useRef<AdSessionTracker>(
    new AdSessionTracker({ campaignId, brandName, durationSeconds })
  );

  // Sync completion when external state specifies isUnlocked
  useEffect(() => {
    if (isUnlocked && !isCompleted) {
      setIsCompleted(true);
    }
  }, [isUnlocked, isCompleted]);

  // Timer loop for unskippable ad playback
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
  const remainingSeconds = Math.max(0, durationSeconds - watchedSeconds);

  return (
    <div className="w-full bg-[#111827] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-[#0B0F19]/80 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider uppercase text-blue-400">
            Sponsored Gas Subsidy
          </span>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-gray-400 bg-gray-900/80 px-2.5 py-1 rounded-full border border-gray-800">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Sponsored by <strong className="text-white font-medium">{brandName}</strong></span>
        </div>
      </div>

      {/* Main player display canvas */}
      <div className="relative aspect-video w-full bg-gradient-to-br from-[#0B0F19] via-[#111827] to-[#1E293B] flex flex-col items-center justify-center p-6 select-none overflow-hidden group">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-blue-600/5 group-hover:bg-blue-600/10 transition-colors pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {isCompleted ? (
          <div className="flex flex-col items-center text-center z-10 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">
              Gas Subsidy Unlocked!
            </h3>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">
              Your gas fee on Arc mainnet is 100% sponsored by <span className="text-white font-semibold">{brandName}</span>.
            </p>
            <div className="mt-4 flex items-center space-x-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                $0 Arc USDC Gas Fee Applied
              </span>
              <button
                onClick={handleRestart}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
                title="Replay Video"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Replay
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center z-10">
            {/* Visual simulation content */}
            <div className="w-16 h-16 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4 text-blue-400 group-hover:scale-105 transition-transform">
              <button
                onClick={handleTogglePlay}
                className="w-full h-full flex items-center justify-center cursor-pointer focus:outline-none"
                aria-label={isPlaying ? 'Pause Ad' : 'Play Ad'}
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 translate-x-0.5" />}
              </button>
            </div>
            <h4 className="text-base font-semibold text-white tracking-tight">
              {adTitle}
            </h4>
            <p className="text-xs text-gray-400 mt-1">
              Watch this brief {durationSeconds}-second spotlight to waive your transfer gas fee.
            </p>

            {isPlaying && (
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-2 animate-ping" />
                {remainingSeconds}s remaining to unlock $0 gas
              </div>
            )}
          </div>
        )}

        {/* Video Player overlay controls bottom bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 flex flex-col space-y-2">
          {/* Progress bar */}
          <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ease-linear ${
                isCompleted ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleTogglePlay}
                disabled={isCompleted}
                className={`transition-colors ${
                  isCompleted ? 'opacity-40 cursor-not-allowed' : 'hover:text-white'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsMuted((prev) => !prev)}
                className="hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span className="font-mono text-[11px]">
                0:0{watchedSeconds} / 0:0{durationSeconds}
              </span>
            </div>

            <span className="text-[11px] font-medium tracking-wide uppercase text-gray-500">
              {isCompleted ? 'Verified Complete' : 'Non-skippable'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
