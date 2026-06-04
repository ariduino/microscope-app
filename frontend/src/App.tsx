import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Command, Move3D, Sun } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Separator } from "./components/ui/separator";
import { Slider } from "./components/ui/slider";
import {
  capture,
  getCameraStatus,
  getHealth,
  getPosition,
  getSerialLog,
  getSerialStatus,
  jog,
  reconnectSerial,
  restartCamera,
  sendRaw,
  setPreset,
  setRgbw,
} from "./lib/api";

function App() {
  const [health, setHealth] = useState("checking");
  const [cameraStatus, setCameraStatus] = useState<{ running: boolean; available: boolean; last_error: string | null }>({
    running: false,
    available: false,
    last_error: null,
  });
  const [serialStatus, setSerialStatus] = useState<{ connected: boolean; port: string | null; last_error: string | null }>({
    connected: false,
    port: null,
    last_error: null,
  });
  const [steps, setSteps] = useState(100);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [r, setR] = useState(0);
  const [g, setG] = useState(0);
  const [b, setB] = useState(0);
  const [w, setW] = useState(0);
  const [brightness, setBrightness] = useState(255);
  const [project, setProject] = useState("default_project");
  const [session, setSession] = useState("session_001");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [raw, setRaw] = useState("p?");
  const [log, setLog] = useState<Array<{ ts: string; dir: string; msg: string }>>([]);
  const [captureInfo, setCaptureInfo] = useState("");
  const serialPreRef = useRef<HTMLPreElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const streamUrl = useMemo(() => "/api/v1/camera/stream", []);

  async function refreshPosition() {
    try {
      const p = await getPosition();
      setPosition(p);
    } catch {
      // intentionally silent while hardware service is not connected
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
      setCameraStatus(cam);
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
      .catch(() => setHealth("offline"));

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
                    await restartCamera();
                    await refreshStatuses();
                  }}
                >
                  Restart Camera
                </Button>
                {!cameraStatus.running && cameraStatus.last_error ? (
                  <span className="text-xs text-amber-300">{cameraStatus.last_error}</span>
                ) : null}
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
                <Input id="steps" type="number" min={1} max={20000} value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" onClick={() => jog("y", "positive", steps)}>Y+</Button>
                <Button variant="secondary" onClick={() => jog("z", "positive", steps)}>Z+</Button>
                <Button variant="secondary" onClick={() => jog("x", "positive", steps)}>X+</Button>
                <Button variant="outline" onClick={() => jog("y", "negative", steps)}>Y-</Button>
                <Button variant="outline" onClick={() => jog("z", "negative", steps)}>Z-</Button>
                <Button variant="outline" onClick={() => jog("x", "negative", steps)}>X-</Button>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-border bg-muted/40">X {position.x}</Badge>
                <Badge className="border-border bg-muted/40">Y {position.y}</Badge>
                <Badge className="border-border bg-muted/40">Z {position.z}</Badge>
                <Button size="sm" variant="ghost" onClick={refreshPosition}>Refresh</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await reconnectSerial();
                    await refreshStatuses();
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
                  <Slider
                    min={0}
                    max={255}
                    step={1}
                    value={[value]}
                    onValueChange={(vals) => setter(vals[0] ?? 0)}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label>Brightness ({brightness})</Label>
                <Slider min={0} max={255} step={1} value={[brightness]} onValueChange={(vals) => setBrightness(vals[0] ?? 0)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => {
                    setRgbw(r, g, b, w, brightness);
                  }}
                >
                  Apply
                </Button>
                <Button variant="secondary" onClick={() => setPreset("white_full")}>White Full</Button>
                <Button variant="outline" onClick={() => setPreset("off")}>Off</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-4">
            <CardHeader>
              <CardTitle>Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="project">Project</Label>
                  <Input id="project" value={project} onChange={(e) => setProject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="session">Session</Label>
                  <Input id="session" value={session} onChange={(e) => setSession(e.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
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
                  const out = await capture(project, session, format);
                  setCaptureInfo(`${out.image_path} | ${out.sidecar_path}`);
                }}
              >
                Capture Image
              </Button>
              <p className="text-xs text-muted-foreground break-all">{captureInfo}</p>
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
                    await sendRaw(raw);
                    setRaw("");
                    await refreshLog();
                  }}
                />
                <Button
                  onClick={async () => {
                    await sendRaw(raw);
                    setRaw("");
                    await refreshLog();
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
