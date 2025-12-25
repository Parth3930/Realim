import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Upload, Link2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BoardElement } from '../../lib/store';

export function MusicElementComponent({ data, onUpdate }: { data: BoardElement, onUpdate: (updates: Partial<BoardElement>) => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [localPlaying, setLocalPlaying] = useState(false);
    const [ytReady, setYtReady] = useState(false);
    const [isLocalYTPlaying, setIsLocalYTPlaying] = useState(false);
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const isLocal = data.content.startsWith('data:audio');

    // Extract YouTube video ID
    const getYouTubeId = (link: string) => {
        if (!link.includes('youtube') && !link.includes('youtu.be')) return null;
        try {
            const url = new URL(link);
            let id = url.searchParams.get('v');
            if (!id && link.includes('youtu.be')) id = url.pathname.slice(1);
            return id;
        } catch {
            return null;
        }
    };

    const videoId = getYouTubeId(data.content);
    const isYouTube = !!videoId;

    // Load YouTube API
    useEffect(() => {
        if (!isYouTube) return;

        // Load API script if not loaded
        if (!(window as any).YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        // Wait for API to be ready
        const checkYT = () => {
            if ((window as any).YT && (window as any).YT.Player) {
                setYtReady(true);
            } else {
                setTimeout(checkYT, 100);
            }
        };
        checkYT();
    }, [isYouTube]);

    // Create YouTube player when API is ready
    useEffect(() => {
        if (!ytReady || !containerRef.current || !videoId) return;

        // Clear existing player
        if (playerRef.current) {
            try { playerRef.current.destroy(); } catch { }
        }
        containerRef.current.innerHTML = '';
        const div = document.createElement('div');
        div.id = `yt-player-${data.id}`;
        containerRef.current.appendChild(div);

        // Calculate start time from synced state
        const startSeconds = Math.floor(data.playbackTime || 0);

        playerRef.current = new (window as any).YT.Player(div.id, {
            videoId: videoId,
            width: '100%',
            height: '100%',
            playerVars: {
                autoplay: 1,
                start: startSeconds,
                rel: 0,
                modestbranding: 1,
                enablejsapi: 1,
                origin: window.location.origin,
            },
            events: {
                onReady: (event: any) => {
                    // Always seek to synced position and play for new joiners
                    const start = data.playbackTime || 0;
                    event.target.seekTo(start, true);
                    if (start > 0 || data.isPlaying) {
                        event.target.playVideo();
                    }
                },
                onStateChange: (event: any) => {
                    if (event.data === 1) { // Playing
                        setIsLocalYTPlaying(true);
                        if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
                        syncIntervalRef.current = setInterval(() => {
                            if (playerRef.current && playerRef.current.getCurrentTime) {
                                const currentTime = playerRef.current.getCurrentTime() || 0;
                                onUpdate({
                                    isPlaying: true,
                                    playbackTime: currentTime,
                                    lastSyncedAt: Date.now()
                                });
                            }
                        }, 2000);
                    } else if (event.data === 2) { // Paused
                        setIsLocalYTPlaying(false);
                        if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
                        const currentTime = playerRef.current?.getCurrentTime?.() || 0;
                        onUpdate({ isPlaying: false, playbackTime: currentTime });
                    } else if (event.data === 0 || event.data === -1) { // Ended or unstarted
                        setIsLocalYTPlaying(false);
                    }
                }
            }
        });

        return () => {
            if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
        };
    }, [ytReady, videoId, data.id]);

    // Sync playback from remote state
    useEffect(() => {
        if (!playerRef.current || !isYouTube) return;

        const player = playerRef.current;
        if (!player.getPlayerState) return;

        try {
            const playerState = player.getPlayerState();
            const currentTime = player.getCurrentTime?.() || 0;
            const remoteTime = data.playbackTime || 0;

            if (data.isPlaying && playerState !== 1) {
                player.seekTo(remoteTime, true);
                player.playVideo();
            } else if (!data.isPlaying && playerState === 1) {
                player.pauseVideo();
            } else if (data.isPlaying && Math.abs(currentTime - remoteTime) > 3) {
                player.seekTo(remoteTime, true);
            }
        } catch (e) { }
    }, [data.isPlaying, data.playbackTime, ytReady]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 15 * 1024 * 1024) {
            alert("File too large! Keep it under 15MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            if (result) onUpdate({ content: result });
        };
        reader.readAsDataURL(file);
    };

    const toggleLocalPlay = () => {
        if (!audioRef.current) return;
        if (localPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setLocalPlaying(!localPlaying);
    };

    const joinPlayback = () => {
        if (!playerRef.current) return;
        try {
            const remoteTime = data.playbackTime || 0;
            playerRef.current.seekTo(remoteTime, true);
            playerRef.current.playVideo();
        } catch (e) {
            console.log('Failed to join playback', e);
        }
    };

    const needsSync = isYouTube && data.isPlaying && !isLocalYTPlaying;
    const mediaType = isLocal ? '💾 Local Audio' : isYouTube ? '📺 YouTube Video' : 'Unknown';

    return (
        <div className="w-[320px] h-[240px] bg-violet-950 rounded-xl flex flex-col overflow-hidden shadow-2xl border border-white/10 group/music cursor-auto relative" onPointerDown={(e) => e.stopPropagation()}>
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />

            <div className="flex-1 relative bg-black/50 rounded-t-xl overflow-hidden flex items-center justify-center">
                {isLocal ? (
                    <>
                        <audio ref={audioRef} src={data.content} onEnded={() => setLocalPlaying(false)} onPause={() => setLocalPlaying(false)} onPlay={() => setLocalPlaying(true)} className="hidden" />
                        <div className={cn("transition-all duration-1000", localPlaying ? "animate-[spin_3s_linear_infinite]" : "")}>
                            <svg viewBox="0 0 32 32" className="w-32 h-32 drop-shadow-2xl" shapeRendering="crispEdges">
                                <circle cx="16" cy="16" r="15" fill="#111" />
                                <circle cx="16" cy="16" r="14" fill="#050505" />
                                <circle cx="16" cy="16" r="12" fill="#111" />
                                <circle cx="16" cy="16" r="10" fill="#050505" />
                                <circle cx="16" cy="16" r="6" fill="#8b5cf6" />
                                <circle cx="16" cy="16" r="2" fill="#000" />
                                <rect x="14" y="2" width="2" height="2" fill="#fff" fillOpacity="0.3" />
                                <rect x="25" y="10" width="2" height="2" fill="#fff" fillOpacity="0.2" />
                            </svg>
                        </div>
                    </>
                ) : isYouTube ? (
                    <div className="relative w-full h-full">
                        <div ref={containerRef} className="w-full h-full" />
                        {needsSync && (
                            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10 backdrop-blur-sm">
                                <button onClick={joinPlayback} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium flex items-center gap-2 shadow-xl transition-all hover:scale-105 active:scale-95">
                                    <Play size={18} fill="white" /> Join Playback
                                </button>
                                <span className="text-white/50 text-xs mt-2">Someone is playing</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-white/50 text-sm">Paste a YouTube link</div>
                )}
            </div>

            <div className="h-[50px] bg-black/60 backdrop-blur-md px-3 flex items-center justify-between gap-2">
                {isLocal ? (
                    <div className="flex items-center gap-3 flex-1">
                        <button onClick={toggleLocalPlay} className="p-2 bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all">
                            {localPlaying ? <Pause size={14} fill="black" /> : <Play size={14} fill="black" className="ml-0.5" />}
                        </button>
                        <span className="text-white/60 text-[10px] truncate flex-1">Local Audio File</span>
                    </div>
                ) : (
                    <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-white/60 text-[10px] truncate">{mediaType}</span>
                        <span className="text-white/40 text-[9px]">{mediaType.includes('YouTube') ? 'Synced playback' : 'Paste YouTube link'}</span>
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="p-2 text-white/70 hover:text-white transition-colors hover:bg-white/10 rounded-lg shrink-0" title="Upload audio file">
                        <Upload size={16} />
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        const newLink = prompt("Enter YouTube Link (Video or Playlist):", data.content.startsWith('data:') ? '' : data.content);
                        if (newLink) onUpdate({ content: newLink, playbackTime: 0 });
                    }} className="p-2 text-white/70 hover:text-white transition-colors hover:bg-white/10 rounded-lg shrink-0" title="Change Link">
                        <Link2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
