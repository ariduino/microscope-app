const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) {
        detail = data.detail;
      }
    } catch {
      // Fall back to generic status-based message when no JSON body is present.
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export type Position = { x: number; y: number; z: number };

export async function getHealth() {
  return jsonFetch<{ status: string }>("/health");
}

export async function getCameraStatus() {
  return jsonFetch<{
    running: boolean;
    available: boolean;
    last_error: string | null;
    settings: {
      mode: "auto" | "manual";
      exposure_time: number | null;
      analogue_gain: number | null;
      live_exposure_time: number | null;
      live_analogue_gain: number | null;
      ae_enabled: boolean | null;
      last_error: string | null;
    };
  }>("/camera/status");
}

export async function restartCamera() {
  return jsonFetch<{ status: string }>("/camera/restart", { method: "POST" });
}

export async function getCameraSettings() {
  return jsonFetch<{
    mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/settings");
}

export async function updateCameraSettings(
  mode: "auto" | "manual",
  exposureTime: number | null,
  analogueGain: number | null
) {
  return jsonFetch<{
    mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/settings", {
    method: "POST",
    body: JSON.stringify({
      mode,
      exposure_time: exposureTime,
      analogue_gain: analogueGain,
    }),
  });
}

export async function getPosition() {
  return jsonFetch<Position>("/motion/position");
}

export async function jog(axis: "x" | "y" | "z", direction: "positive" | "negative", steps: number) {
  return jsonFetch<{ status: string }>("/motion/jog", {
    method: "POST",
    body: JSON.stringify({ axis, direction, steps }),
  });
}

export async function releaseSteppers() {
  return jsonFetch<{ status: string }>("/motion/release", {
    method: "POST",
  });
}

export async function sendRaw(command: string) {
  return jsonFetch<{ status: string; reply: string }>("/motion/raw", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function setRgbw(r: number, g: number, b: number, w: number, bri: number) {
  return jsonFetch<{ status: string }>("/light/set_rgbw", {
    method: "POST",
    body: JSON.stringify({ r, g, b, w, bri }),
  });
}

export async function setPreset(preset: "white_full" | "off") {
  return jsonFetch<{ status: string }>("/light/preset", {
    method: "POST",
    body: JSON.stringify({ preset }),
  });
}

export async function capture(project: string, format: "png" | "jpeg") {
  return jsonFetch<{ image_path: string; sidecar_path: string }>("/camera/capture", {
    method: "POST",
    body: JSON.stringify({ project, format }),
  });
}

export async function getSerialLog(limit = 100) {
  return jsonFetch<Array<{ ts: string; dir: string; msg: string }>>(`/serial/log?limit=${limit}`);
}

export async function getSerialStatus() {
  return jsonFetch<{
    connected: boolean;
    port: string | null;
    configured_port: string | null;
    baudrate: number;
    ports: Array<{ device: string; description: string }>;
    last_error: string | null;
  }>("/serial/status");
}

export async function reconnectSerial() {
  return jsonFetch<{ status: string; connected: boolean }>("/serial/reconnect", { method: "POST" });
}
