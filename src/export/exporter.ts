import * as THREE from 'three';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import type { Project } from '../types';
import { SceneRuntime, applyView, makeCamera, setCameraAspect } from '../engine/runtime';
import { evaluateCamera, sceneAt, totalDuration } from '../engine/evaluate';
import { drawOverlay } from '../engine/overlay';
import { allAudioClips, scheduleClips } from '../audio/audio';
import { seekVideosExact, waitMediaReady } from '../engine/media';
import { ensureFonts } from '../engine/fonts';

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
}

export interface ExportResult {
  blob: Blob;
  ext: 'mp4' | 'webm';
}

/** Рисует кадр проекта в момент t на composite-холст. */
export class FrameRenderer {
  readonly gl: HTMLCanvasElement;
  readonly out: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private runtime = new SceneRuntime();
  private cam: THREE.OrthographicCamera;
  private ctx: CanvasRenderingContext2D;
  private target = new THREE.Vector3();

  constructor(private project: Project, private w: number, private h: number) {
    this.gl = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.cam = makeCamera(w / h);
    setCameraAspect(this.cam, w / h);
    this.out = document.createElement('canvas');
    this.out.width = w;
    this.out.height = h;
    this.ctx = this.out.getContext('2d')!;
  }

  /** Кадр в момент t; exact — дождаться точной перемотки видео (покадровый экспорт). */
  async render(t: number, exact = true) {
    const at = sceneAt(this.project, t);
    const is3d = at.index >= 0 && at.scene.kind !== 'blank';
    if (is3d) {
      this.runtime.sync(at.scene, at.local, { helpers: false });
      applyView(this.cam, evaluateCamera(at.scene, at.local), this.target);
      this.runtime.setShadowFocus(this.target);
      this.renderer.render(this.runtime.scene, this.cam);
    }
    if (exact) await seekVideosExact(this.project, t);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.w, this.h);
    drawOverlay(this.ctx, this.project, t, this.w, this.h, { base: is3d ? this.gl : null });
  }

  dispose() {
    this.runtime.dispose();
    this.renderer.dispose();
  }
}

/** Свести все аудиоклипы в один AudioBuffer. */
async function mixAudio(p: Project, duration: number): Promise<AudioBuffer | null> {
  if (!allAudioClips(p).length) return null;
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  scheduleClips(ctx, ctx.destination, allAudioClips(p), 0, 0, duration);
  return ctx.startRendering();
}

export async function exportVideo(
  project: Project,
  opts: ExportOptions,
  onProgress: (frac: number, preview: HTMLCanvasElement) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const duration = totalDuration(project);
  await Promise.all([ensureFonts(project), waitMediaReady(project)]);
  const fr = new FrameRenderer(project, opts.width, opts.height);
  try {
    const webcodecs = typeof VideoEncoder !== 'undefined';
    const videoCodec = webcodecs
      ? await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width: opts.width, height: opts.height })
      : null;
    if (videoCodec) return await exportWithWebCodecs(project, opts, fr, duration, videoCodec, onProgress, signal);
    return await exportRealtime(project, opts, fr, duration, onProgress, signal);
  } finally {
    fr.dispose();
  }
}

async function exportWithWebCodecs(
  project: Project,
  opts: ExportOptions,
  fr: FrameRenderer,
  duration: number,
  videoCodec: 'avc' | 'vp9' | 'av1' | string,
  onProgress: (frac: number, preview: HTMLCanvasElement) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(fr.out, { codec: videoCodec as 'avc', quality: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: opts.fps });

  const mix = await mixAudio(project, duration);
  let audio: AudioBufferSource | null = null;
  if (mix) {
    const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000 });
    if (audioCodec) {
      audio = new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH });
      output.addAudioTrack(audio);
    }
  }

  await output.start();
  const frames = Math.max(1, Math.round(duration * opts.fps));
  for (let i = 0; i < frames; i++) {
    if (signal.aborted) {
      await output.cancel();
      throw new DOMException('Отменено', 'AbortError');
    }
    const t = i / opts.fps;
    await fr.render(t);
    await video.add(t, 1 / opts.fps);
    if (i % 3 === 0) {
      onProgress(i / frames, fr.out);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (audio && mix) await audio.add(mix);
  await output.finalize();
  onProgress(1, fr.out);
  const buf = (output.target as BufferTarget).buffer!;
  return { blob: new Blob([buf], { type: 'video/mp4' }), ext: 'mp4' };
}

/** Запасной путь: запись в реальном времени через MediaRecorder (WebM). */
async function exportRealtime(
  project: Project,
  opts: ExportOptions,
  fr: FrameRenderer,
  duration: number,
  onProgress: (frac: number, preview: HTMLCanvasElement) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const stream = fr.out.captureStream(opts.fps);
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));

  await fr.render(0);
  rec.start(250);
  const t0 = ac.currentTime + 0.05;
  const sched = scheduleClips(ac, dest, allAudioClips(project), 0, t0, duration);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = ac.currentTime - t0;
      if (signal.aborted || t >= duration) return resolve();
      void fr.render(Math.max(0, t), false);
      onProgress(t / duration, fr.out);
      requestAnimationFrame(tick);
    };
    tick();
  });
  sched.stop();
  rec.stop();
  await done;
  await ac.close();
  if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
  return { blob: new Blob(chunks, { type: 'video/webm' }), ext: 'webm' };
}
