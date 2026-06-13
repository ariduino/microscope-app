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
      ae_mode: "auto" | "manual";
      awb_mode: "auto" | "manual";
      exposure_time: number | null;
      analogue_gain: number | null;
      red_gain: number | null;
      blue_gain: number | null;
      preview_resolution: string;
      capture_resolution: string;
      live_exposure_time: number | null;
      live_analogue_gain: number | null;
      ae_enabled: boolean | null;
      live_red_gain: number | null;
      live_blue_gain: number | null;
      awb_enabled: boolean | null;
      last_error: string | null;
    };
  }>("/camera/status");
}

export async function restartCamera() {
  return jsonFetch<{ status: string }>("/camera/restart", { method: "POST" });
}

export async function getCameraSettings() {
  return jsonFetch<{
    ae_mode: "auto" | "manual";
    awb_mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    red_gain: number | null;
    blue_gain: number | null;
    preview_resolution: string;
    capture_resolution: string;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    live_red_gain: number | null;
    live_blue_gain: number | null;
    awb_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/settings");
}

export async function updateCameraSettings(
  aeMode: "auto" | "manual",
  awbMode: "auto" | "manual",
  exposureTime: number | null,
  analogueGain: number | null,
  redGain: number | null,
  blueGain: number | null,
  previewResolution: string,
  captureResolution: string
) {
  return jsonFetch<{
    ae_mode: "auto" | "manual";
    awb_mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    red_gain: number | null;
    blue_gain: number | null;
    preview_resolution: string;
    capture_resolution: string;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    live_red_gain: number | null;
    live_blue_gain: number | null;
    awb_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/settings", {
    method: "POST",
    body: JSON.stringify({
      ae_mode: aeMode,
      awb_mode: awbMode,
      exposure_time: exposureTime,
      analogue_gain: analogueGain,
      red_gain: redGain,
      blue_gain: blueGain,
      preview_resolution: previewResolution,
      capture_resolution: captureResolution,
    }),
  });
}

export async function lockCurrentCameraSettings() {
  return jsonFetch<{
    ae_mode: "auto" | "manual";
    awb_mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    red_gain: number | null;
    blue_gain: number | null;
    preview_resolution: string;
    capture_resolution: string;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    live_red_gain: number | null;
    live_blue_gain: number | null;
    awb_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/lock", {
    method: "POST",
  });
}

export async function calibrateWhiteBalanceFromBlankField() {
  return jsonFetch<{
    ae_mode: "auto" | "manual";
    awb_mode: "auto" | "manual";
    exposure_time: number | null;
    analogue_gain: number | null;
    red_gain: number | null;
    blue_gain: number | null;
    preview_resolution: string;
    capture_resolution: string;
    live_exposure_time: number | null;
    live_analogue_gain: number | null;
    ae_enabled: boolean | null;
    live_red_gain: number | null;
    live_blue_gain: number | null;
    awb_enabled: boolean | null;
    last_error: string | null;
  }>("/camera/calibrate-white-balance", {
    method: "POST",
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

export async function capture(project: string, label: string, format: "png" | "jpeg") {
  return jsonFetch<{ image_path: string; sidecar_path: string }>("/camera/capture", {
    method: "POST",
    body: JSON.stringify({ project, label: label.trim() || null, format }),
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
