// src/hooks/useAllDetections.js
//
// Manages one WebSocket per camera and returns a unified detection feed.
// Usage:
//   const { feed, connectedIds } = useAllDetections(cameras, token);
//
// feed         — array of detection events, newest first, max 50
// connectedIds — Set of camera IDs currently connected
//
// FIX: cameras array is stabilised via a deep-equal ref so that a new
// array reference with the same camera IDs never tears down live sockets.

import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE            = "ws://localhost:8000";
const RECONNECT_DELAY_MS = 3000;
const MAX_FEED_LENGTH    = 50;

// ── Shallow-compare two camera arrays by id ────────────────────────────────────
function sameCameraIds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export function useAllDetections(cameras, token) {
  const [feed,         setFeed]         = useState([]);
  const [connectedIds, setConnectedIds] = useState(new Set());

  // ── Stable cameras ref: only update when IDs actually change ──────────────
  const stableCamerasRef = useRef([]);
  if (!sameCameraIds(stableCamerasRef.current, cameras ?? [])) {
    stableCamerasRef.current = cameras ?? [];
  }

  const socketsRef = useRef({});  // { camId: WebSocket }
  const timersRef  = useRef({});  // { camId: timeoutId }
  const mountedRef = useRef(true);

  const addToFeed = useCallback((event) => {
    setFeed(prev => [event, ...prev].slice(0, MAX_FEED_LENGTH));
  }, []);

  // ── Main effect — re-runs only when the stable camera list changes ─────────
  useEffect(() => {
    const cameras = stableCamerasRef.current;
    mountedRef.current = true;

    if (!token || !cameras.length) return;

    function connect(cam) {
      if (!mountedRef.current) return;
      const camId = cam.id;

      // Skip if already open / connecting
      const existing = socketsRef.current[camId];
      if (existing && existing.readyState < WebSocket.CLOSING) return;

      const ws = new WebSocket(`${WS_BASE}/ws/cameras/${camId}/detections/`);
      socketsRef.current[camId] = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(1000, "unmounted"); return; }
        setConnectedIds(prev => new Set([...prev, camId]));
      };

      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "detection") {
            // Always look up the latest camera name from the stable ref
            const liveCam = stableCamerasRef.current.find(c => c.id === camId);
            addToFeed({
              ...msg,
              camera_id:   camId,
              camera_name: liveCam?.name ?? cam.name,
              receivedAt:  Date.now(),
            });
          }
        } catch { /* ignore JSON parse errors */ }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnectedIds(prev => { const s = new Set(prev); s.delete(camId); return s; });
      };

      ws.onclose = (closeEvent) => {
        if (!mountedRef.current) return;
        setConnectedIds(prev => { const s = new Set(prev); s.delete(camId); return s; });

        // Reconnect unless it was a clean intentional close
        if (closeEvent.code !== 1000) {
          timersRef.current[camId] = setTimeout(() => {
            if (!mountedRef.current) return;
            const liveCam = stableCamerasRef.current.find(c => c.id === camId);
            if (liveCam) connect(liveCam);
          }, RECONNECT_DELAY_MS);
        }
      };
    }

    cameras.forEach(connect);

    // ── Tear down sockets for cameras no longer in the list ──────────────────
    const activeCamIds = new Set(cameras.map(c => c.id));
    Object.keys(socketsRef.current).forEach(idStr => {
      const id = Number(idStr);
      if (!activeCamIds.has(id)) {
        const ws = socketsRef.current[id];
        if (ws && ws.readyState < WebSocket.CLOSING) ws.close(1000, "camera removed");
        delete socketsRef.current[id];
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });

    return () => {
      mountedRef.current = false;
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(socketsRef.current).forEach(ws => {
        if (ws.readyState < WebSocket.CLOSING) ws.close(1000, "unmounted");
      });
      socketsRef.current = {};
      timersRef.current  = {};
    };

  // stableCamerasRef.current is the real dependency — but since it's a ref,
  // we use the cameras prop only to trigger the effect when IDs change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableCamerasRef.current, token, addToFeed]);

  return { feed, connectedIds };
}
