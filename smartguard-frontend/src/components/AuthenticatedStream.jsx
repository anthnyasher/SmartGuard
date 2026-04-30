import { useEffect, useRef, useState } from "react";

export default function AuthenticatedStream({ streamUrl, token, alt, className, style, onError }) {
  const imgRef    = useRef(null);
  const readerRef = useRef(null);
  const rafRef    = useRef(null);
  const pendingRef = useRef(null); // holds the latest ready blob URL
  const [failed, setFailed] = useState(false);

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
      }
      rafRef.current = requestAnimationFrame(paintLoop);
    }
    rafRef.current = requestAnimationFrame(paintLoop);

    async function startStream() {
      setFailed(false);
      try {
        const response = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || !response.body) {
          console.error("[Stream] HTTP error", response.status, streamUrl);
          setFailed(true);
          if (onError) onError(response.status);
          return;
        }

        const reader = response.body.getReader();
        readerRef.current = reader;

        let buffer = new Uint8Array(0);
        let soiIndex = -1;

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
      } catch (err) {
        if (!cancelled) {
          console.error("[Stream] Fetch error:", err);
          setFailed(true);
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

  if (failed) return null;
  return (
    <img
      ref={imgRef}
      className={className}
      style={style}
      alt={alt}
      draggable={false}
    />
  );
}