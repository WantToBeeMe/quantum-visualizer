import { useState, useEffect, useMemo, useRef } from 'react';
import './AnimationPlayer.css';

export default function AnimationPlayer({
    barrierCount,
    currentFrame,
    isPlaying,
    segmentDurations = [],
    onFrameChange,
    onPlayPause,
    onReset
}) {
    // Total frames = barrierCount + 2 (frame 0 = no gates, frame 1..n+1 = gates up to barrier)
    const totalFrames = barrierCount + 2;
    const [displayFrame, setDisplayFrame] = useState(currentFrame);

    // Update display frame, but skip frame 0 during play
    useEffect(() => {
        if (currentFrame > 0) {
            setDisplayFrame(currentFrame);
        }
    }, [currentFrame]);

    // Compute timing per segment (ms) - same for all (animation time + pause)
    const segmentTimings = useMemo(() => {
        const baseDuration = 800; // ms for 1 unit of animation
        const pauseAfter = 400; // ms pause after each segment
        return segmentDurations.map(d => ({
            animation: Math.max(d * baseDuration, 100), // Animation time (min 100ms)
            pause: pauseAfter // Pause after animation
        }));
    }, [segmentDurations]);

    useEffect(() => {
        if (!isPlaying) return;

        // If we're at frame 0, immediately move to frame 1 (no visible wait)
        if (currentFrame === 0) {
            // Use requestAnimationFrame for immediate transition
            const id = requestAnimationFrame(() => onFrameChange(1));
            return () => cancelAnimationFrame(id);
        }

        // Fixed timing for all segments: 1000ms animation + 500ms pause = 1500ms per segment
        const duration = 1500;

        const timer = setTimeout(() => {
            if (currentFrame < totalFrames - 1) {
                onFrameChange(currentFrame + 1);
            } else {
                onPlayPause(false);
            }
        }, duration);

        return () => clearTimeout(timer);
    }, [isPlaying, currentFrame, totalFrames, onFrameChange, onPlayPause]);

    const handlePlay = () => {
        if (!isPlaying) {
            onFrameChange(0); // Reset to 0, useEffect will immediately move to 1
            onPlayPause(true);
        } else {
            onPlayPause(false);
        }
    };

    // Segment progress for timeline - use displayFrame (not currentFrame) to avoid flicker
    const totalDuration = segmentDurations.reduce((a, b) => a + b, 0) || 1;
    const segmentWidths = segmentDurations.map(d => (d / totalDuration) * 100);

    // Use displayFrame for visual state (skips frame 0)
    const visualFrame = displayFrame;

    return (
        <div className="animation-player">
            <div className="player-controls">
                <button
                    className="player-btn step"
                    onClick={() => currentFrame > 0 && onFrameChange(currentFrame - 1)}
                    disabled={currentFrame <= 0 || isPlaying}
                    title="Previous"
                >
                    <svg viewBox="0 0 24 24" width="10" height="10">
                        <path fill="currentColor" d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" />
                    </svg>
                </button>
                <button className="player-btn play" onClick={handlePlay} title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>
                    )}
                </button>
                <button
                    className="player-btn step"
                    onClick={() => currentFrame < totalFrames - 1 && onFrameChange(currentFrame + 1)}
                    disabled={currentFrame >= totalFrames - 1 || isPlaying}
                    title="Next"
                >
                    <svg viewBox="0 0 24 24" width="10" height="10">
                        <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                    </svg>
                </button>
            </div>

            {/* Segmented timeline - use visualFrame to avoid flicker */}
            <div className="player-progress">
                {segmentWidths.map((width, i) => (
                    <div
                        key={i}
                        className={`segment ${i < visualFrame ? 'completed' : i === visualFrame - 1 && isPlaying ? 'animating' : ''}`}
                        style={{ width: `${width}%` }}
                    />
                ))}
            </div>

            <span className="frame-label">{visualFrame}/{totalFrames - 1}</span>
        </div>
    );
}
