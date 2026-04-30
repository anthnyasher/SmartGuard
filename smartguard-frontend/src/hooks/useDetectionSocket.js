// src/hooks/useDetectionSocket.js
//
// Connects to ws://localhost:8000/ws/cameras/<cameraId>/detections/
// and returns the latest detection event for that camera.
//
// Usage:
//   const { detection, heartbeat, connected } = useDetectionSocket(cameraId, token);

import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE = "ws://localhost:8000";
const RECONNECT_DELAY_MS = 3000;

export function useDetectionSocket(cameraId, token) {
  const [detection,  setDetection]  = useState(null);   // latest detection payload
  const [heartbeat,  setHeartbeat]  = useState(null);   // latest heartbeat
  const [connected,  setConnected]  = useState(false);
  const [error,      setError]      = useState(null);

  const wsRef         = useRef(null);
  const reconnectRef  = useRef(null);
  const mountedRef    = useRef(true);

  const connect = useCallback(() => {
    if (!cameraId || !token) return;
    if (wsRef.current && wsRef.current.readyState < 2) return; // already open/connecting

    const url = `${WS_BASE}/ws/cameras/${cameraId}/detections/`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "detection") {
          setDetection(msg);
        } else if (msg.type === "heartbeat") {
          setHeartbeat(msg);
        }
        // "connected" type is just an ack — ignore
      } catch (err) {
        console.warn("WS parse error:", err);
      }
    };

    ws.onerror = (e) => {
      if (!mountedRef.current) return;
      setError("WebSocket error");
      setConnected(false);
    };

    ws.onclose = (e) => {
      if (!mountedRef.current) return;
      setConnected(false);
      // Auto-reconnect unless intentionally closed (code 1000)
      if (e.code !== 1000) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, [cameraId, token]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, "component unmounted");
      }
    };
  }, [connect]);

  return { detection, heartbeat, connected, error };
}