# Microscope Control App - Build Contract

## 1) Goal
Build a single Raspberry Pi-hosted web app to control microscope camera, motors, and illumination from one interface, locally and over LAN.

## 2) Scope
### In scope (v1)
- Live camera preview in browser.
- Still capture to file.
- Arduino Nano serial control for motion and LED.
- Visible serial command/reply console.
- Step-based motion controls with configurable step size.
- Motor position display via `p?` polling.
- LED RGBW controls and quick presets.
- PNG default capture with optional JPEG.
- JSON sidecar metadata per image.

### Out of scope (v1)
- Internet exposure.
- Authentication/sign-in.
- Hold-to-jog continuous movement.
- Firmware edits in `Arduino Code/`.

## 3) Fixed Constraints
- Hardware host: Raspberry Pi 4B.
- OS: Raspberry Pi OS Desktop (Trixie).
- Firmware folder constraint: keep `Arduino Code/` in repo and leave unchanged during app build.
- NeoPixel format in firmware remains `GRBW`; UI presents values as RGBW.

## 4) Final Tech Stack
### Backend
- Python 3.11+
- FastAPI + Uvicorn
- Picamera2 for camera control
- pyserial for Arduino serial I/O
- Pydantic for request/response and metadata models

### Frontend
- React (TypeScript)
- shadcn/ui components
- Tailwind CSS
- Single web UI served by backend static hosting

### Streaming
- MJPEG stream for v1 (`GET /api/v1/camera/stream`)
- WebRTC only as future enhancement if needed

## 5) Architecture
- One FastAPI service owns camera + serial hardware access.
- React frontend calls backend API for all actions.
- Same UI used on Pi local browser and laptop browser over LAN.

## 6) API Baseline
- Base path: `/api/v1`
- Health: `GET /api/v1/health`
- Camera:
  - `POST /api/v1/camera/start`
  - `POST /api/v1/camera/stop`
  - `GET /api/v1/camera/stream`
  - `POST /api/v1/camera/capture`
- Motion:
  - `POST /api/v1/motion/jog` (axis, direction, steps)
  - `POST /api/v1/motion/raw` (raw passthrough)
  - `GET /api/v1/motion/position` (`p?`)
- Light:
  - `POST /api/v1/light/set_rgbw`
  - `POST /api/v1/light/preset` (`white_full`, `off`)
- Serial console:
  - `GET /api/v1/serial/log`

## 7) UI Requirements
- Single-page layout sections:
  - live video
  - motion controls
  - LED controls
  - capture controls
  - serial console
- Step-based controls only in v1.
- Step size must be user-configurable, including fine and large moves (e.g., 10 to 5000+).
- Position display includes auto-refresh and manual refresh.
- Raw serial console is open/unrestricted.
- Near capture button: destination selector plus project/session inputs.

## 8) Capture + Metadata Rules
- Capture root: `~/MicroscopeCaptures`
- Folder structure: `{project}/{session}/`
- Filename default: `{project}_{session}_{timestamp}_{index}.png`
- Default format: PNG
- Optional format: JPEG
- Sidecar: JSON with same basename as image

Minimum sidecar fields:
- timestamp
- project
- session
- filename
- image_format
- xyz_position
- rgbw_values
- camera_settings

## 9) Networking Rules
- Bind address: `0.0.0.0`
- Port: `8000`
- Access: trusted LAN only
- Auth: none in v1

## 10) Runtime Defaults
- Position polling interval: 500 ms
- Serial read timeout: 200 ms

## 11) v1 Smoke Test (Definition of Ready-to-Demo)
1. Start app and open UI from Pi and laptop browser.
2. See live MJPEG preview.
3. Jog one axis with configurable step value.
4. Set LED preset `white_full` and `off`.
5. Capture PNG image.
6. Verify sidecar JSON saved with required fields.
