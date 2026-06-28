import { useEffect, useRef, useState } from "react";

export default function AuthenticatedStream({ streamUrl, token, alt, className, style, onError }) {
  const imgRef    = useRef(null);
  const readerRef = useRef(null);
  const rafRef    = useRef(null);
  const pendingRef = useRef(null); // holds the latest ready blob URL
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!streamUrl || !token) return;
    let cancelled = false;

    // rAF loop — only paints one frame per display refresh (60fps cap)
    function paintLoop() {
      if (cancelled) return;
      if (pendingRef.current && imgRef.current) {
        const old = imgRef.current.src;
        imgRef.current.src = pendingRef.current;
        pendingRef.current = null;
        if (old?.startsWith("blob:")) URL.revokeObjectURL(old);
        setStatus("playing");
      }
      rafRef.current = requestAnimationFrame(paintLoop);
    }
    rafRef.current = requestAnimationFrame(paintLoop);

    async function startStream() {
      setStatus("loading");
      try {
        const response = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || !response.body) {
          console.error("[Stream] HTTP error", response.status, streamUrl);
          setStatus("failed");
          if (onError) onError(response.status);
          return;
        }

        const reader = response.body.getReader();
        readerRef.current = reader;

        let buffer = new Uint8Array(0);
        let soiIndex = -1;

        let watchdogTimer = null;
        const resetWatchdog = () => {
          clearTimeout(watchdogTimer);
          watchdogTimer = setTimeout(() => {
            if (!cancelled) {
              console.error("[Stream] Watchdog timeout - no frame received");
              setStatus("failed");
              if (readerRef.current) readerRef.current.cancel().catch(()=>{});
            }
          }, 6000);
        };
        resetWatchdog();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          // Append chunk
          const next = new Uint8Array(buffer.length + value.length);
          next.set(buffer);
          next.set(value, buffer.length);
          buffer = next;

          // Scan forward — never restart from 0
          let i = soiIndex === -1 ? 0 : soiIndex;
          while (i < buffer.length - 1) {
            if (soiIndex === -1 && buffer[i] === 0xFF && buffer[i + 1] === 0xD8) {
              soiIndex = i; // found start of JPEG
            }
            if (soiIndex !== -1 && buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
              // Found complete frame
              const jpeg = buffer.slice(soiIndex, i + 2);
              buffer = buffer.slice(i + 2); // discard consumed bytes

              // Revoke previous pending frame if it wasn't painted yet (drop old frame)
              if (pendingRef.current) URL.revokeObjectURL(pendingRef.current);
              pendingRef.current = URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
              
              resetWatchdog(); // Reset timeout on successful frame

              soiIndex = -1;
              i = 0; // restart scan only on the leftover slice, which is now the whole buffer
              continue;
            }
            i++;
          }
          // If no SOI found yet, trim buffer to avoid unbounded growth
          if (soiIndex === -1 && buffer.length > 65536) {
            buffer = new Uint8Array(0);
          }
        }
        clearTimeout(watchdogTimer);
      } catch (err) {
        if (!cancelled) {
          console.error("[Stream] Fetch error:", err);
          setStatus("failed");
          if (onError) onError(err);
        }
      }
    }

    startStream();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      if (pendingRef.current) {
        URL.revokeObjectURL(pendingRef.current);
        pendingRef.current = null;
      }
      if (imgRef.current?.src?.startsWith("blob:")) {
        URL.revokeObjectURL(imgRef.current.src);
      }
    };
  }, [streamUrl, token]);

  return (
    <>
      <img
        ref={imgRef}
        className={className}
        style={{ ...style, display: status === "playing" ? "block" : "none" }}
        alt={alt}
        draggable={false}
      />
      
      {status === "loading" && (
        <div className="lm-tile-offline-screen" style={{ background: "#0a0a0a" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "sg-spin 1s linear infinite", marginBottom: 12, color: "var(--accent-blue)" }}>
            <path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>
            <style>{`@keyframes sg-spin { 100% { transform: rotate(360deg); } }`}</style>
          </svg>
          <span className="lm-tile-offline-label">Loading feed...</span>
        </div>
      )}

      {status === "failed" && (
        <div className="lm-tile-offline-screen" style={{ background: "#0a0a0a" }}>
          <svg className="lm-camera-svg" viewBox="0 0 48 48" fill="none" style={{ opacity: 0.5 }}>
            <rect x="4" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="20" cy="24" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M36 20l8-5v18l-8-5V20z" stroke="currentColor" strokeWidth="1.5" />
            <line x1="4" y1="4" x2="44" y2="44" stroke="#ef4444" strokeWidth="2" />
          </svg>
          <span className="lm-tile-offline-label" style={{ marginTop: 8 }}>Offline</span>
        </div>
      )}
    </>
  );
}