import { invoke } from "@tauri-apps/api/core";
import { probeWebGL } from "../components/world/webglDiagnostics";

type RenderStatus = "initializing" | "ready" | "failed";

export interface Smoke3dReport {
  webgl_ok: boolean;
  webgl_version: string | null;
  render_status: string;
  mode: string;
  non_black_ratio: number;
  average_luminance: number;
  canvas_width: number;
  canvas_height: number;
  error: string | null;
}

interface CanvasSample {
  nonBlackRatio: number;
  averageLuminance: number;
  width: number;
  height: number;
}

let smokeEnabledCache: boolean | null = null;
let reportSubmitted = false;

export async function is3dSmokeTestEnabled(): Promise<boolean> {
  if (smokeEnabledCache !== null) {
    return smokeEnabledCache;
  }
  try {
    smokeEnabledCache = await invoke<boolean>("is_3d_smoke_test_enabled");
  } catch {
    smokeEnabledCache = false;
  }
  return smokeEnabledCache;
}

function getWebGLContext(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext | null {
  const options = { preserveDrawingBuffer: true };
  const webgl2 = canvas.getContext("webgl2", options) as WebGL2RenderingContext | null;
  if (webgl2) {
    return webgl2;
  }
  const webgl =
    (canvas.getContext("webgl", options) as WebGLRenderingContext | null) ??
    (canvas.getContext("experimental-webgl", options) as WebGLRenderingContext | null);
  return webgl;
}

function sampleCanvasLuminance(canvas: HTMLCanvasElement): CanvasSample {
  const gl = getWebGLContext(canvas);
  if (!gl) {
    throw new Error("Unable to read pixels from WebGL canvas.");
  }

  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  let nonBlack = 0;
  let lumSum = 0;
  const total = width * height;
  const blackThreshold = 10;

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    lumSum += luminance;
    if (red > blackThreshold || green > blackThreshold || blue > blackThreshold) {
      nonBlack += 1;
    }
  }

  return {
    nonBlackRatio: nonBlack / total,
    averageLuminance: lumSum / total,
    width,
    height,
  };
}

function smokePassed(report: Smoke3dReport): boolean {
  return (
    report.webgl_ok &&
    report.render_status === "ready" &&
    report.mode === "3d" &&
    report.non_black_ratio >= 0.05 &&
    report.average_luminance >= 8 &&
    !report.error
  );
}

async function submitSmokeReport(report: Smoke3dReport): Promise<void> {
  if (reportSubmitted) {
    return;
  }
  reportSubmitted = true;
  await invoke<string>("write_3d_smoke_report", { report });
  await invoke("exit_3d_smoke_test", { exitCode: smokePassed(report) ? 0 : 1 });
}

export async function submit3dSmokeFailure(params: {
  renderStatus: RenderStatus;
  mode: "3d" | "fallback";
  error?: string | null;
}): Promise<void> {
  if (!(await is3dSmokeTestEnabled()) || reportSubmitted) {
    return;
  }

  const webgl = probeWebGL();
  await submitSmokeReport({
    webgl_ok: webgl.ok,
    webgl_version: webgl.ok ? webgl.version : null,
    render_status: params.renderStatus,
    mode: params.mode,
    non_black_ratio: 0,
    average_luminance: 0,
    canvas_width: 0,
    canvas_height: 0,
    error:
      params.error ??
      (webgl.ok ? "3D renderer did not become ready in smoke timeout." : webgl.reason),
  });
}

export async function run3dSmokeTestFromCanvas(canvas: HTMLCanvasElement): Promise<void> {
  if (!(await is3dSmokeTestEnabled()) || reportSubmitted) {
    return;
  }

  const webgl = probeWebGL();
  let sample: CanvasSample = {
    nonBlackRatio: 0,
    averageLuminance: 0,
    width: canvas.width,
    height: canvas.height,
  };
  let sampleError: string | null = null;

  try {
    sample = sampleCanvasLuminance(canvas);
  } catch (error) {
    sampleError = String(error);
  }

  await submitSmokeReport({
    webgl_ok: webgl.ok,
    webgl_version: webgl.ok ? webgl.version : null,
    render_status: "ready",
    mode: "3d",
    non_black_ratio: sample.nonBlackRatio,
    average_luminance: sample.averageLuminance,
    canvas_width: sample.width,
    canvas_height: sample.height,
    error: sampleError ?? (webgl.ok ? null : webgl.reason),
  });
}