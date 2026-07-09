import { useEffect, useRef, useState } from 'react';

let apiLoaded = false;
let apiLoading = false;
let callbacks = [];

const loadYouTubeApi = (callback) => {
  if (apiLoaded && window.YT && window.YT.Player) {
    callback();
    return;
  }
  callbacks.push(callback);
  if (apiLoading) return;

  apiLoading = true;
  
  const existingCallback = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    apiLoaded = true;
    if (existingCallback) existingCallback();
    callbacks.forEach(cb => cb());
    callbacks = [];
  };

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
};

export const useYouTubePlayer = ({ 
  videoId, 
  startSeconds = 0, 
  onReady, 
  onStateChange, 
  onError, 
  onEnded, 
  playerVars = {}
}) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const currentVideoIdRef = useRef(videoId);
  const playerVarsRef = useRef(playerVars);
  
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
    onErrorRef.current = onError;
    onEndedRef.current = onEnded;
  });

  useEffect(() => {
    let isMounted = true;
    
    loadYouTubeApi(() => {
      if (!isMounted || !containerRef.current) return;
      if (playerRef.current) return;

      const element = document.createElement('div');
      containerRef.current.appendChild(element);

      playerRef.current = new window.YT.Player(element, {
        videoId: currentVideoIdRef.current,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          showinfo: 0,
          modestbranding: 1,
          enablejsapi: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          ...playerVarsRef.current
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            setIsReady(true);
            if (onReadyRef.current) onReadyRef.current(event.target);
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            if (onStateChangeRef.current) onStateChangeRef.current(event);
            if (event.data === window.YT.PlayerState.ENDED) {
              if (onEndedRef.current) onEndedRef.current();
            }
          },
          onError: (event) => {
            if (!isMounted) return;
            if (onErrorRef.current) onErrorRef.current(event);
          }
        }
      });
    });

    return () => {
      isMounted = false;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setIsReady(false);
    };
  }, []); 

  useEffect(() => {
    if (isReady && playerRef.current && videoId) {
      if (currentVideoIdRef.current !== videoId) {
        currentVideoIdRef.current = videoId;
        playerRef.current.loadVideoById({ videoId, startSeconds });
      }
    }
  }, [videoId, startSeconds, isReady]);

  return { containerRef, get player() { return playerRef.current; }, isReady };
};

export default useYouTubePlayer;
