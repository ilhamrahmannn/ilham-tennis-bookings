import { useEffect, useRef, useState } from "react";

const phases = [
  { name: "Ready position", time: 0, cue: "Keep your feet apart, knees soft and racket in front." },
  { name: "Preparation", time: 1.15, cue: "Turn your hips and shoulders together as the racket moves back." },
  { name: "Execution", time: 2, cue: "Uncoil and meet the ball in front of your body as the racket moves forward and up." },
  { name: "Follow-through", time: 2.55, cue: "Let the racket finish across your body and stay balanced." },
];

const add = (a, b) => a.map((value, axis) => value + b[axis]);
const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const scale = (a, factor) => a.map((value) => value * factor);
const mix = (a, b, t) => add(a, scale(sub(b, a), t));
const unit = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];

function poseAt(motion, time) {
  const end = motion.times.findIndex((value) => value > time);
  if (end === -1) return motion.frames.at(-1);
  const start = end - 1;
  const fraction = (time - motion.times[start]) / (motion.times[end] - motion.times[start]);
  const eased = fraction * fraction * (3 - 2 * fraction);
  return motion.frames[start].map((point, i) => mix(point, motion.frames[end][i], i === 12 ? fraction : eased));
}

function drawScene(canvas, pose, angle) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  const yaw = angle * Math.PI / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const focalLength = Math.min(width * .94, height * 1.38);
  function project([x, y, z]) {
    const forward = sin * x + cos * z;
    const depth = 3.9 - forward * .95 - (y - .9) * .31;
    const zoom = focalLength / Math.max(depth, .22);
    return {
      x: width / 2 + (cos * x - sin * z) * zoom,
      y: height * .53 - ((y - .9) * .95 - forward * .31) * zoom,
      depth,
      zoom,
    };
  }

  function path(points, color, weight, fill) {
    ctx.beginPath();
    points.map(project).forEach(({ x, y }, index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (fill) {
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke();
    }
  }

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#0c1918");
  sky.addColorStop(1, "#233a2b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Clip the court at the camera's near plane before perspective projection.
  function court(points, color, fill = false) {
    const visible = [];
    const depth = ([x, , z]) => 3.9 - (sin * x + cos * z) * .95 + .9 * .31;
    const edgeCount = fill ? points.length : points.length - 1;
    if (depth(points[0]) >= .35) visible.push(points[0]);
    for (let i = 0; i < edgeCount; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const da = depth(a);
      const db = depth(b);
      if ((da >= .35) !== (db >= .35)) visible.push(mix(a, b, (.35 - da) / (db - da)));
      if (db >= .35) visible.push(b);
    }
    if (visible.length > 1) path(visible, color, Math.max(1, width / 820), fill);
  }
  court([[-5.49,0,-2.9], [5.49,0,-2.9], [5.49,0,11.9], [-5.49,0,11.9]], "#265647", true);
  for (const x of [-5.49, -4.115, 4.115, 5.49]) court([[x,0,-.03], [x,0,11.9]], "#baccc4");
  for (const z of [0, 5.49, 11.89]) court([[-5.49,0,z], [5.49,0,z]], "#baccc4");
  court([[0,0,5.49], [0,0,11.89]], "#baccc4");

  const [pelvis, rs, ls, re, le, rh, lh, rk, lk, rf, lf, tip, ball] = pose;
  const neck = mix(rs, ls, .5);
  const head = add(neck, [0, .24, .025]);
  const hipAxis = unit(sub(rs, ls));
  const rightHip = add(pelvis, scale(hipAxis, .13));
  const leftHip = add(pelvis, scale(hipAxis, -.13));
  const skin = "#d8a07d";
  const shirt = "#b8ef68";
  const shorts = "#314858";
  const queue = [];
  function segment(a, b, color, radius) {
    const center = project(mix(a, b, .5));
    queue.push({ depth: center.depth, paint: () => path([a, b], color, radius * center.zoom) });
  }
  function sphere(point, color, radius) {
    const { x, y, depth, zoom } = project(point);
    if (depth < .25) return;
    queue.push({ depth, paint() {
      const size = radius * zoom;
      const lighting = ctx.createRadialGradient(x - size * .3, y - size * .35, size * .1, x, y, size);
      lighting.addColorStop(0, "#ffffff");
      lighting.addColorStop(.45, color);
      lighting.addColorStop(1, color);
      ctx.fillStyle = lighting;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();
    } });
  }

  const shadow = project([pelvis[0], 0, pelvis[2]]);
  ctx.fillStyle = "#102b23a0";
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y, .53 * shadow.zoom, .17 * shadow.zoom, 0, 0, 2 * Math.PI);
  ctx.fill();
  segment(rightHip, leftHip, shorts, .22);
  segment(pelvis, neck, shirt, .31);
  segment(ls, rs, shirt, .18);
  segment(neck, head, skin, .095);
  sphere(head, skin, .118);
  sphere(add(head, [0,.073,-.015]), "#272a2a", .092);
  for (const [shoulder, elbow, hand, hip, knee, foot] of [[rs, re, rh, rightHip, rk, rf], [ls, le, lh, leftHip, lk, lf]]) {
    segment(shoulder, elbow, skin, .093);
    segment(elbow, hand, skin, .077);
    sphere(hand, skin, .045);
    segment(hip, knee, shorts, .135);
    segment(knee, foot, skin, .094);
    segment(foot, add(foot, [0, -.015, .14]), "#eef6ef", .088);
  }

  const axis = unit(sub(tip, rh));
  const side = unit(cross(axis, [0, 1, .2]));
  const center = add(tip, scale(axis, -.16));
  const racketPoint = (along, across) => add(add(center, scale(axis, along)), scale(side, across));
  const rim = Array.from({ length: 33 }, (_, i) => {
    const radians = i * Math.PI / 16;
    return racketPoint(.17 * Math.cos(radians), .12 * Math.sin(radians));
  });
  segment(rh, racketPoint(-.17, 0), "#e0e9ed", .027);
  const racket = project(center);
  queue.push({ depth: racket.depth, paint() {
    for (const fraction of [-.65, -.32, 0, .32, .65]) {
      const extent = Math.sqrt(1 - fraction ** 2);
      path([racketPoint(-.17 * extent, .12 * fraction), racketPoint(.17 * extent, .12 * fraction)], "#d9e6df", .007 * racket.zoom);
      path([racketPoint(.17 * fraction, -.12 * extent), racketPoint(.17 * fraction, .12 * extent)], "#d9e6df", .007 * racket.zoom);
    }
    path(rim, "#f2a953", .022 * racket.zoom);
  } });
  if (project(ball).depth > 1) sphere(ball, "#edfa63", .039);
  queue.sort((a, b) => b.depth - a.depth).forEach(({ paint }) => paint());
}

export default function ForehandSimulator({ user }) {
  const canvasRef = useRef(null);
  const [motion, setMotion] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [angle, setAngle] = useState(36);
  const [viewport, setViewport] = useState(null);
  const duration = motion?.times.at(-1) || 0;
  const phase = phases.findLast((item) => item.time <= time);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/forehand-motion?uid=" + encodeURIComponent(user.uid), {
          headers: { Authorization: "Bearer " + token },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Access verification failed");
        const data = await response.json();
        if (!controller.signal.aborted) setMotion(data);
      } catch {
        if (!controller.signal.aborted) setError("Could not load the simulator. Try again.");
      }
    }
    void load();
    return () => controller.abort();
  }, [user, attempt]);

  useEffect(() => {
    if (!playing) return;
    let previous;
    let frame;
    function tick(now) {
      const elapsed = previous === undefined ? 0 : (now - previous) / 1000;
      previous = now;
      setTime((current) => (current + elapsed * speed) % duration);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, playing, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motion || !viewport?.width || !viewport.height) return;
    if (canvas.width !== viewport.width) canvas.width = viewport.width;
    if (canvas.height !== viewport.height) canvas.height = viewport.height;
    drawScene(canvas, poseAt(motion, time), angle);
  }, [angle, motion, time, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !motion) return;
    const observer = new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      setViewport({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [motion]);

  if (error) return <div><p role="alert">{error}</p><button className="mt-3 text-lime-300 underline" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Try again</button></div>;
  if (!motion) return <p role="status">Loading simulator…</p>;

  return (
    <div className="grid gap-4">
      <canvas ref={canvasRef} className="forehand-stage" role="img" aria-label="Animated 3D view of a right-handed forehand" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {phases.map((item) => (
          <button key={item.name} type="button" aria-pressed={item === phase}
            className={"rounded-xl border px-3 py-2 text-sm " + (item === phase ? "border-lime-300 bg-lime-300 text-neutral-950" : "border-neutral-700 hover:border-lime-300")}
            onClick={() => { setPlaying(false); setTime(item.time); }}>
            {item.name}
          </button>
        ))}
      </div>
      <p className="min-h-12 text-neutral-300">{phase.cue}</p>
      <label className="grid gap-1 text-sm">Swing timeline
        <input type="range" min={0} max={duration} step={.01} value={time} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <button className="rounded-xl bg-lime-300 px-4 py-2 font-semibold text-neutral-950" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play loop"}</button>
        <label className="grid gap-1 text-sm">Playback speed
          <select className="rounded-lg border border-neutral-700 bg-neutral-950 p-2" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={.25}>0.25×</option><option value={.5}>0.5×</option><option value={1}>1×</option>
          </select>
        </label>
        <label className="grid min-w-32 flex-1 gap-1 text-sm">Camera angle
          <input type="range" min={-180} max={180} step={1} value={angle} onChange={(event) => setAngle(Number(event.target.value))} />
        </label>
      </div>
    </div>
  );
}
