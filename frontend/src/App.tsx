import { useEffect, useRef, useState } from "react";
import { Camera, Command, Move3D, Sun } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Slider } from "./components/ui/slider";
import { Switch } from "./components/ui/switch";
import {
  calibrateWhiteBalanceFromBlankField,
  capture,
  getCameraStatus,
  getHealth,
  getPosition,
  getSerialLog,
  getSerialStatus,
  jog,
  lockCurrentCameraSettings,
  reconnectSerial,
  releaseSteppers,
  restartCamera,
  sendRaw,
  setPreset,
  setRgbw,
  updateCameraSettings,
} from "./lib/api";

type CameraSettings = {
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

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  ae_mode: "auto",
  awb_mode: "auto",
  exposure_time: 10000,
  analogue_gain: 1.0,
  red_gain: 1.0,
  blue_gain: 1.0,
  preview_resolution: "1920x1080",
  capture_resolution: "3280x2464",
  live_exposure_time: null,
  live_analogue_gain: null,
  ae_enabled: null,
  live_red_gain: null,
  live_blue_gain: null,
  awb_enabled: null,
  last_error: null,
};

function App() {
  const [health, setHealth] = useState("checking");
  const [cameraStatus, setCameraStatus] = useState<{ running: boolean; available: boolean; last_error: string | null }>({
    running: false,
    available: false,
    last_error: null,
  });
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(DEFAULT_CAMERA_SETTINGS);
  const [cameraExposureDraft, setCameraExposureDraft] = useState("10000");
  const [cameraGainDraft, setCameraGainDraft] = useState("1.0");
  const [cameraRedGainDraft, setCameraRedGainDraft] = useState("1.0");
  const [cameraBlueGainDraft, setCameraBlueGainDraft] = useState("1.0");
  const [previewResolutionDraft, setPreviewResolutionDraft] = useState("1920x1080");
  const [captureResolutionDraft, setCaptureResolutionDraft] = useState("3280x2464");
  const [serialStatus, setSerialStatus] = useState<{ connected: boolean; port: string | null; last_error: string | null }>({
    connected: false,
    port: null,
    last_error: null,
  });
  const [stepsDraft, setStepsDraft] = useState("100");
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [r, setR] = useState(0);
  const [g, setG] = useState(0);
  const [b, setB] = useState(0);
  const [w, setW] = useState(0);
  const [brightness, setBrightness] = useState(255);
  const [project, setProject] = useState("default_project");
  const [captureLabel, setCaptureLabel] = useState("");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [raw, setRaw] = useState("p?");
  const [log, setLog] = useState<Array<{ ts: string; dir: string; msg: string }>>([]);
  const [captureInfo, setCaptureInfo] = useState("");
  const [appError, setAppError] = useState<string | null>(null);
  const [streamNonce, setStreamNonce] = useState(0);
  const serialPreRef = useRef<HTMLPreElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const cameraSettingsDirtyRef = useRef(false);
  const streamUrl = `/api/v1/camera/stream?v=${streamNonce}`;
  const previewResolutionOptions = ["1280x720", "1640x1232", "1920x1080"];
  const captureResolutionOptions = ["1920x1080", "1640x1232", "3280x2464"];

  function syncCameraDrafts(settings: CameraSettings) {
    setCameraExposureDraft(settings.exposure_time == null ? "" : String(settings.exposure_time));
    setCameraGainDraft(settings.analogue_gain == null ? "" : String(settings.analogue_gain));
    setCameraRedGainDraft(settings.red_gain == null ? "" : String(settings.red_gain));
    setCameraBlueGainDraft(settings.blue_gain == null ? "" : String(settings.blue_gain));
    setPreviewResolutionDraft(settings.preview_resolution);
    setCaptureResolutionDraft(settings.capture_resolution);
  }

  function updateCameraState(settings: CameraSettings, refreshStream = false) {
    setCameraSettings(settings);
    syncCameraDrafts(settings);
    cameraSettingsDirtyRef.current = false;
    if (refreshStream) {
      setStreamNonce((current) => current + 1);
    }
  }

  async function applyCameraSettings(next?: Partial<Pick<CameraSettings, "ae_mode" | "awb_mode">>, refreshStream = false) {
    const aeMode = next?.ae_mode ?? cameraSettings.ae_mode;
    const awbMode = next?.awb_mode ?? cameraSettings.awb_mode;
    const exposureTime = cameraExposureDraft.trim() ? Number(cameraExposureDraft) : null;
    const analogueGain = cameraGainDraft.trim() ? Number(cameraGainDraft) : null;
    const redGain = cameraRedGainDraft.trim() ? Number(cameraRedGainDraft) : null;
    const blueGain = cameraBlueGainDraft.trim() ? Number(cameraBlueGainDraft) : null;

    const settings = await updateCameraSettings(
      aeMode,
      awbMode,
      exposureTime,
      analogueGain,
      redGain,
      blueGain,
      previewResolutionDraft,
      captureResolutionDraft
    );
    updateCameraState(settings, refreshStream);
  }

  async function refreshPosition() {
    try {
      const p = await getPosition();
      setPosition(p);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Failed to refresh position");
    }
  }

  async function refreshLog() {
    try {
      const lines = await getSerialLog(150);
      setLog(lines);
    } catch {
      // intentionally silent while hardware service is not connected
    }
  }

  async function refreshStatuses() {
    try {
      const cam = await getCameraStatus();
      setCameraStatus({
        running: cam.running,
        available: cam.available,
        last_error: cam.last_error,
      });
      setCameraSettings(cam.settings);
      if (!cameraSettingsDirtyRef.current) {
        syncCameraDrafts(cam.settings);
      }
    } catch {
      // ignore
    }
    try {
      const ser = await getSerialStatus();
      setSerialStatus({
        connected: ser.connected,
        port: ser.port,
        last_error: ser.last_error,
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    getHealth()
      .then((h) => setHealth(h.status))
      .catch(() => {
        setHealth("offline");
        setAppError("API health check failed");
      });

    refreshPosition();
    refreshLog();
    refreshStatuses();

    const posTimer = setInterval(refreshPosition, 500);
    const logTimer = setInterval(refreshLog, 800);
    const statusTimer = setInterval(refreshStatuses, 1500);
    return () => {
      clearInterval(posTimer);
      clearInterval(logTimer);
      clearInterval(statusTimer);
    };
  }, []);

  useEffect(() => {
    const el = serialPreRef.current;
    if (!el) return;
    if (!shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  function getStepSize(): number | null {
    const trimmed = stepsDraft.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || parsed < 1) return null;
    return parsed;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/60 p-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">OpenFlexure Microscope Control</h1>
            <p className="text-sm text-muted-foreground">Pi-hosted control panel for camera, motors, and illumination</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-primary/40 bg-primary/15 text-primary">API: {health}</Badge>
            <Badge className={cameraStatus.running ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-amber-500/40 bg-amber-500/15 text-amber-300"}>
              Camera: {cameraStatus.running ? "running" : "stopped"}
            </Badge>
            <Badge className={serialStatus.connected ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-amber-500/40 bg-amber-500/15 text-amber-300"}>
              Serial: {serialStatus.connected ? "connected" : "disconnected"}
            </Badge>
          </div>
        </header>

        {appError ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span>{appError}</span>
            <Button size="sm" variant="outline" onClick={() => setAppError(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" /> Live Video</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                <img className="aspect-[4/3] w-full object-contain" src={streamUrl} alt="microscope stream" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await restartCamera();
                      await refreshStatuses();
                      setStreamNonce((value) => value + 1);
                      setAppError(null);
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : "Failed to restart camera");
                    }
                  }}
                >
                  Restart Camera
                </Button>
                {!cameraStatus.running && cameraStatus.last_error ? (
                  <span className="text-xs text-amber-300">{cameraStatus.last_error}</span>
                ) : null}
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="ae-switch">Auto Exposure / Gain</Label>
                        <p className="text-xs text-muted-foreground">Auto is on when the switch is enabled.</p>
                      </div>
                      <Switch
                        id="ae-switch"
                        checked={cameraSettings.ae_mode === "auto"}
                        onCheckedChange={async (checked) => {
                          try {
                            await applyCameraSettings({ ae_mode: checked ? "auto" : "manual" });
                            setAppError(null);
                          } catch (error) {
                            setAppError(error instanceof Error ? error.message : "Failed to update exposure mode");
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="awb-switch">Auto White Balance</Label>
                        <p className="text-xs text-muted-foreground">Auto is on when the switch is enabled.</p>
                      </div>
                      <Switch
                        id="awb-switch"
                        checked={cameraSettings.awb_mode === "auto"}
                        onCheckedChange={async (checked) => {
                          try {
                            await applyCameraSettings({ awb_mode: checked ? "auto" : "manual" });
                            setAppError(null);
                          } catch (error) {
                            setAppError(error instanceof Error ? error.message : "Failed to update white balance mode");
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-border/70 p-4">
                    <div>
                      <h3 className="text-sm font-medium">Exposure / Gain</h3>
                      <p className="text-xs text-muted-foreground">Use auto for live metering, or switch off to lock manual values.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="exposure-time">Exposure Time (us)</Label>
                        <Input
                          id="exposure-time"
                          type="number"
                          min={1}
                          value={cameraExposureDraft}
                          disabled={cameraSettings.ae_mode !== "manual"}
                          onChange={(e) => {
                            setCameraExposureDraft(e.target.value);
                            cameraSettingsDirtyRef.current = true;
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="analogue-gain">Analogue Gain</Label>
                        <Input
                          id="analogue-gain"
                          type="number"
                          min={1}
                          step="0.1"
                          value={cameraGainDraft}
                          disabled={cameraSettings.ae_mode !== "manual"}
                          onChange={(e) => {
                            setCameraGainDraft(e.target.value);
                            cameraSettingsDirtyRef.current = true;
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>Live Exposure: {cameraSettings.live_exposure_time ?? "n/a"} us</p>
                      <p>Live Gain: {cameraSettings.live_analogue_gain ?? "n/a"}</p>
                      <p>AE Enabled: {cameraSettings.ae_enabled == null ? "n/a" : cameraSettings.ae_enabled ? "yes" : "no"}</p>
                      <p>Mode: {cameraSettings.ae_mode}</p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 p-4">
                    <div>
                      <h3 className="text-sm font-medium">White Balance</h3>
                      <p className="text-xs text-muted-foreground">Use auto to watch the camera’s gains, or switch off to hold manual colour gains.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="red-gain">Red Gain</Label>
                        <Input
                          id="red-gain"
                          type="number"
                          min={0.1}
                          step="0.01"
                          value={cameraRedGainDraft}
                          disabled={cameraSettings.awb_mode !== "manual"}
                          onChange={(e) => {
                            setCameraRedGainDraft(e.target.value);
                            cameraSettingsDirtyRef.current = true;
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="blue-gain">Blue Gain</Label>
                        <Input
                          id="blue-gain"
                          type="number"
                          min={0.1}
                          step="0.01"
                          value={cameraBlueGainDraft}
                          disabled={cameraSettings.awb_mode !== "manual"}
                          onChange={(e) => {
                            setCameraBlueGainDraft(e.target.value);
                            cameraSettingsDirtyRef.current = true;
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>Live Red Gain: {cameraSettings.live_red_gain ?? "n/a"}</p>
                      <p>Live Blue Gain: {cameraSettings.live_blue_gain ?? "n/a"}</p>
                      <p>AWB Enabled: {cameraSettings.awb_enabled == null ? "n/a" : cameraSettings.awb_enabled ? "yes" : "no"}</p>
                      <p>Mode: {cameraSettings.awb_mode}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="preview-resolution">Preview Resolution</Label>
                    <Select
                      value={previewResolutionDraft}
                      onValueChange={(value) => {
                        setPreviewResolutionDraft(value);
                        cameraSettingsDirtyRef.current = true;
                      }}
                    >
                      <SelectTrigger id="preview-resolution">
                        <SelectValue placeholder="Select preview resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {previewResolutionOptions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="capture-resolution">Capture Resolution</Label>
                    <Select
                      value={captureResolutionDraft}
                      onValueChange={(value) => {
                        setCaptureResolutionDraft(value);
                        cameraSettingsDirtyRef.current = true;
                      }}
                    >
                      <SelectTrigger id="capture-resolution">
                        <SelectValue placeholder="Select capture resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        {captureResolutionOptions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await applyCameraSettings(undefined, true);
                        setAppError(null);
                      } catch (error) {
                        setAppError(error instanceof Error ? error.message : "Failed to apply camera settings");
                      }
                    }}
                  >
                    Apply Camera Settings
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        const settings = await lockCurrentCameraSettings();
                        updateCameraState(settings);
                        setAppError(null);
                      } catch (error) {
                        setAppError(error instanceof Error ? error.message : "Failed to lock current camera settings");
                      }
                    }}
                  >
                    Lock Current Camera Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const settings = await calibrateWhiteBalanceFromBlankField();
                        updateCameraState(settings);
                        setAppError(null);
                      } catch (error) {
                        setAppError(error instanceof Error ? error.message : "Failed to calibrate white balance");
                      }
                    }}
                  >
                    Calibrate White Balance from Blank Field
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <p>Preview Res: {cameraSettings.preview_resolution}</p>
                  <p>Capture Res: {cameraSettings.capture_resolution}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Move3D className="h-4 w-4" /> Motion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="steps">Step Size (motor steps)</Label>
                <Input id="steps" type="number" min={1} max={20000} value={stepsDraft} onChange={(e) => setStepsDraft(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("y", "positive", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog Y+");
                  }
                }}>Y+</Button>
                <Button variant="secondary" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("z", "positive", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog Z+");
                  }
                }}>Z+</Button>
                <Button variant="secondary" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("x", "positive", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog X+");
                  }
                }}>X+</Button>
                <Button variant="outline" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("y", "negative", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog Y-");
                  }
                }}>Y-</Button>
                <Button variant="outline" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("z", "negative", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog Z-");
                  }
                }}>Z-</Button>
                <Button variant="outline" onClick={async () => {
                  const steps = getStepSize();
                  if (steps == null) {
                    setAppError("Enter a step size greater than 0");
                    return;
                  }
                  try {
                    await jog("x", "negative", steps);
                    await refreshPosition();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to jog X-");
                  }
                }}>X-</Button>
              </div>
              <Separator />
              <Button
                className="w-full"
                variant="outline"
                onClick={async () => {
                  try {
                    await releaseSteppers();
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to release steppers");
                  }
                }}
              >
                Release Steppers
              </Button>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-border bg-muted/40">X {position.x}</Badge>
                <Badge className="border-border bg-muted/40">Y {position.y}</Badge>
                <Badge className="border-border bg-muted/40">Z {position.z}</Badge>
                <Button size="sm" variant="ghost" onClick={refreshPosition}>Refresh</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await reconnectSerial();
                      await refreshStatuses();
                      setAppError(null);
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : "Failed to reconnect serial");
                    }
                  }}
                >
                  Reconnect Serial
                </Button>
              </div>
              {serialStatus.port ? <p className="text-xs text-muted-foreground">Port: {serialStatus.port}</p> : null}
              {!serialStatus.connected && serialStatus.last_error ? (
                <p className="text-xs text-amber-300">{serialStatus.last_error}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sun className="h-4 w-4" /> LED (RGBW)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "R", value: r, setter: setR },
                { name: "G", value: g, setter: setG },
                { name: "B", value: b, setter: setB },
                { name: "W", value: w, setter: setW },
              ].map(({ name, value, setter }) => (
                <div key={name} className="space-y-1">
                  <Label>{name} ({value})</Label>
                  <Slider min={0} max={255} step={1} value={[value]} onValueChange={(vals) => setter(vals[0] ?? 0)} />
                </div>
              ))}
              <div className="space-y-1">
                <Label>Brightness ({brightness})</Label>
                <Slider min={0} max={255} step={1} value={[brightness]} onValueChange={(vals) => setBrightness(vals[0] ?? 0)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={async () => {
                    try {
                      await setRgbw(r, g, b, w, brightness);
                      setAppError(null);
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : "Failed to set LED state");
                    }
                  }}
                >
                  Apply
                </Button>
                <Button variant="secondary" onClick={async () => {
                  try {
                    await setPreset("white_full");
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to set white preset");
                  }
                }}>White Full</Button>
                <Button variant="outline" onClick={async () => {
                  try {
                    await setPreset("off");
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to turn LED off");
                  }
                }}>Off</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="project">Project</Label>
                  <Input id="project" value={project} onChange={(e) => setProject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="capture-label">Optional File Label</Label>
                  <Input
                    id="capture-label"
                    value={captureLabel}
                    onChange={(e) => setCaptureLabel(e.target.value)}
                    placeholder="for example: leaf, pollen, slide-a"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="format">Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as "png" | "jpeg")}>
                    <SelectTrigger id="format">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="png">PNG (default)</SelectItem>
                      <SelectItem value="jpeg">JPEG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    const out = await capture(project, captureLabel, format);
                    setCaptureInfo(`${out.image_path} | ${out.sidecar_path}`);
                    setAppError(null);
                  } catch (error) {
                    setAppError(error instanceof Error ? error.message : "Failed to capture image");
                  }
                }}
              >
                Capture Image
              </Button>
              <p className="text-xs break-all text-muted-foreground">{captureInfo}</p>
            </CardContent>
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Command className="h-4 w-4" /> Serial Console</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!raw.trim()) return;
                    try {
                      await sendRaw(raw);
                      setRaw("");
                      await refreshLog();
                      setAppError(null);
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : "Failed to send serial command");
                    }
                  }}
                />
                <Button
                  onClick={async () => {
                    try {
                      await sendRaw(raw);
                      setRaw("");
                      await refreshLog();
                      setAppError(null);
                    } catch (error) {
                      setAppError(error instanceof Error ? error.message : "Failed to send serial command");
                    }
                  }}
                >
                  Send
                </Button>
                <Button variant="outline" onClick={() => setRaw("")}>Clear</Button>
              </div>
              <pre
                ref={serialPreRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  shouldAutoScrollRef.current = distanceFromBottom < 24;
                }}
                className="max-h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed"
              >
                {log.map((line) => `[${line.ts}] ${line.dir.toUpperCase()} ${line.msg}`).join("\n") || "No serial output yet."}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default App;
