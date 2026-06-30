export type WebGLDiagnosticResult =
  | { ok: true; version: "webgl2" | "webgl1" }
  | { ok: false; reason: string };

export function probeWebGL(): WebGLDiagnosticResult {
  const canvas = document.createElement("canvas");
  const gl2 = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    failIfMajorPerformanceCaveat: false,
  });
  if (gl2) {
    return { ok: true, version: "webgl2" };
  }

  const gl1 =
    canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false,
    }) ??
    canvas.getContext("experimental-webgl", {
      alpha: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false,
    });

  if (gl1) {
    return { ok: true, version: "webgl1" };
  }

  return {
    ok: false,
    reason:
      "WebGL is unavailable in this environment. Enable GPU acceleration or update graphics drivers.",
  };
}