import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '../src/config.js';
import { createApp } from '../src/express-app.js';
import { closeDb } from '../src/db.js';

const run = promisify(execFile);

const MAX_SECONDS = 30;
const START_TIMEOUT_MS = 5000;
const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const MIN_SECONDS = 0.3;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

const MODES = ['transcribe', 'translate', 'verbatim', 'translit', 'codemix'] as const;
type SttMode = (typeof MODES)[number];

const MIME_BY_EXTENSION: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};

interface Options {
  seconds?: number;
  device?: string;
  file?: string;
  mode: SttMode;
}

interface Recorder {
  child: ChildProcess;
  closed: Promise<number>;
  stderr: () => string;
}

let activeRecorder: ChildProcess | undefined;

process.once('SIGINT', () => {
  activeRecorder?.kill();
  process.exit(130);
});

function printUsage(): void {
  console.log(`Sauda live voice test

Records your microphone, sends the clip to Sarvam and prints the transcript.
Press Enter to stop recording; the clip is sent as soon as recording stops.

  # PowerShell
  $env:SAUDA_SHOP_NAME='Sri Lakshmi Kirana'; $env:SAUDA_PASSWORD='kirana2026'; npm run mic:test

  # bash
  SAUDA_SHOP_NAME='Sri Lakshmi Kirana' SAUDA_PASSWORD='kirana2026' npm run mic:test

  npm run mic:test -- --seconds 8          # fixed length instead of Enter
  npm run mic:test -- --mode transcribe    # original language instead of English
  npm run mic:test -- --device "Microphone Array (Realtek(R) Audio)"
  npm run mic:test -- --file sample.wav    # skip the microphone

Options:
  --seconds N    Record a fixed number of seconds instead of waiting for Enter (max ${MAX_SECONDS})
  --device NAME  ffmpeg dshow microphone name (default: first working audio device)
  --file PATH    Transcribe an existing audio file instead of recording
  --mode MODE    ${MODES.join(' | ')} (default: translate, English out)

Environment:
  SAUDA_SHOP_NAME Shop name to sign in with
  SAUDA_PASSWORD  Shop password, 8+ characters with a letter and a digit
  SAUDA_TOKEN     Existing device token; skips signing in
  MIC_DEVICE      Default microphone when --device is not passed
  FFMPEG_PATH     Path to the ffmpeg binary (default: ffmpeg on PATH)`);
}

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value`);
  }

  return value;
}

function parseArguments(argv: readonly string[]): Options {
  const options: Options = { mode: 'translate' };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;

    if (flag === '--seconds') {
      const value = Number(takeValue(argv, index + 1, flag));
      if (!Number.isFinite(value) || value < MIN_SECONDS) {
        throw new Error(`--seconds must be a number of at least ${MIN_SECONDS}`);
      }
      options.seconds = Math.min(value, MAX_SECONDS);
      index += 1;
    } else if (flag === '--device') {
      options.device = takeValue(argv, index + 1, flag);
      index += 1;
    } else if (flag === '--file') {
      options.file = takeValue(argv, index + 1, flag);
      index += 1;
    } else if (flag === '--mode') {
      const mode = takeValue(argv, index + 1, flag);
      if (!MODES.includes(mode as SttMode)) {
        throw new Error(`--mode must be one of ${MODES.join(', ')}`);
      }
      options.mode = mode as SttMode;
      index += 1;
    } else if (flag === '--help' || flag === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listMicrophones(): Promise<string[]> {
  let output: string;

  try {
    const result = await run(FFMPEG, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    output = `${result.stdout}${result.stderr}`;
  } catch (error) {
    const candidate = error as { stdout?: string; stderr?: string; code?: string };

    if (candidate.code === 'ENOENT') {
      throw new Error('ffmpeg was not found. Install it or set FFMPEG_PATH.', { cause: error });
    }

    // Listing devices always exits non-zero on Windows, so keep its output.
    output = `${candidate.stdout ?? ''}${candidate.stderr ?? ''}`;
  }

  const names = [...output.matchAll(/"([^"]+)"\s+\(audio\)/g)]
    .map((match) => match[1])
    .filter((name): name is string => typeof name === 'string' && name.length > 0);

  if (names.length === 0) {
    throw new Error(
      'No microphone was found. Connected audio input devices:\n' +
        (output.trim() || '(ffmpeg returned no device list)') +
        '\nPass --device "Name" or set MIC_DEVICE.',
    );
  }

  return names;
}

function rawCaptureArgs(device: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'dshow',
    '-i',
    `audio=${device}`,
    '-ac',
    String(CHANNELS),
    '-ar',
    String(SAMPLE_RATE),
    '-flush_packets',
    '1',
    '-f',
    's16le',
  ];
}

/** Waits until ffmpeg has written its first audio bytes, so a dead device fails fast. */
async function waitForFirstAudio(
  child: ChildProcess,
  rawPath: string,
  stderr: () => string,
  spawnError: () => Error | undefined,
): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (spawnError()) {
      throw spawnError();
    }

    if (child.exitCode !== null) {
      try {
        const info = await stat(rawPath);
        if (info.size > 0) {
          return;
        }
      } catch {
        // fall through to the error below
      }
      throw new Error(`ffmpeg exited (code ${child.exitCode}): ${stderr().trim() || 'no detail'}`);
    }

    try {
      const info = await stat(rawPath);
      if (info.size > 0) {
        return;
      }
    } catch {
      // The output file is created once the device opens successfully.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`the microphone did not start within ${START_TIMEOUT_MS / 1000}s`);
}

async function startCapture(
  device: string,
  rawPath: string,
  seconds?: number,
): Promise<Recorder> {
  const args = [...rawCaptureArgs(device)];

  if (seconds !== undefined) {
    args.push('-t', String(seconds));
  }

  args.push(rawPath);

  const child = spawn(FFMPEG, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  activeRecorder = child;

  let stderr = '';
  let spawnFailure: Error | undefined;

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  child.once('error', (error) => {
    spawnFailure = error;
  });

  const closed = new Promise<number>((resolve) => {
    child.once('close', (code) => {
      if (activeRecorder === child) {
        activeRecorder = undefined;
      }
      resolve(code ?? -1);
    });
  });

  const recorder: Recorder = { child, closed, stderr: () => stderr };

  try {
    await waitForFirstAudio(
      child,
      rawPath,
      () => stderr,
      () => spawnFailure,
    );
  } catch (error) {
    child.kill();
    await closed;
    throw error;
  }

  return recorder;
}

/** Picks the first device that actually produces audio. */
async function openWorkingRecorder(
  candidates: readonly string[],
  rawPath: string,
  seconds?: number,
): Promise<{ recorder: Recorder; device: string }> {
  let lastError: unknown;

  for (const device of candidates) {
    try {
      if (candidates.length > 1) {
        console.log(`Opening microphone "${device}"...`);
      }

      const recorder = await startCapture(device, rawPath, seconds);
      return { recorder, device };
    } catch (error) {
      lastError = error;

      if (candidates.length > 1) {
        console.warn(`Microphone "${device}" is unavailable (${errorMessage(error)}). Trying the next one...`);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No microphone could be opened.');
}

type StopReason = 'enter' | 'timeout' | 'eof';

/** Resolves when the user presses Enter, stdin closes, or the 30s cap is hit. */
function waitForStop(): Promise<StopReason> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (reason: StopReason): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.pause();
      resolve(reason);
    };

    const onData = (): void => finish('enter');
    const onEnd = (): void => finish('eof');
    const timer = setTimeout(() => finish('timeout'), MAX_SECONDS * 1000);

    process.stdin.resume();
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

async function stopOnEnter(recorder: Recorder, device: string): Promise<void> {
  console.log(
    `Recording from "${device}". Speak now, then press Enter to stop (auto-stops at ${MAX_SECONDS}s).`,
  );

  const startedAt = Date.now();
  let shownSecond = -1;
  const ticker = setInterval(() => {
    if (!process.stderr.isTTY) {
      return;
    }

    const elapsed = Math.floor((Date.now() - startedAt) / 1000);

    if (elapsed !== shownSecond) {
      shownSecond = elapsed;
      process.stderr.write(`\r  recording ${elapsed}s — press Enter to stop `);
    }
  }, 200);

  try {
    const outcome = await Promise.race([
      waitForStop().then((reason) => ({ stoppedByUser: true as const, reason })),
      recorder.closed.then((code) => ({ stoppedByUser: false as const, code })),
    ]);

    if (!outcome.stoppedByUser) {
      throw new Error(`ffmpeg stopped before you did (exit ${outcome.code}): ${recorder.stderr().trim()}`);
    }
  } finally {
    clearInterval(ticker);

    if (process.stderr.isTTY) {
      process.stderr.write('\n');
    }

    recorder.child.kill();
    await recorder.closed;
  }
}

async function finishTimed(recorder: Recorder, seconds: number): Promise<void> {
  console.log(`Recording ${seconds}s... speak now.`);

  const code = await recorder.closed;

  if (code !== 0) {
    throw new Error(`ffmpeg failed (exit ${code}): ${recorder.stderr().trim() || 'no detail'}`);
  }
}

async function rawToWav(rawPath: string, wavPath: string): Promise<void> {
  await run(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    's16le',
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    String(CHANNELS),
    '-i',
    rawPath,
    '-c:a',
    'pcm_s16le',
    wavPath,
  ]);
}

async function postJson(
  base: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;

  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { status: response.status, body: parsed };
}

function describeError(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as { code?: unknown; message?: unknown };
    if (typeof record.message === 'string') {
      return typeof record.code === 'string' ? `${record.code}: ${record.message}` : record.message;
    }
  }

  return JSON.stringify(body);
}

async function obtainToken(base: string): Promise<string> {
  const existing = process.env.SAUDA_TOKEN?.trim();
  if (existing) {
    return existing;
  }

  const shopName = process.env.SAUDA_SHOP_NAME?.trim();
  const password = process.env.SAUDA_PASSWORD?.trim();

  if (!shopName || !password) {
    throw new Error(
      'A device token is required. Set SAUDA_SHOP_NAME and SAUDA_PASSWORD, or SAUDA_TOKEN, then rerun.',
    );
  }

  const signIn = await postJson(base, '/auth/signin', {
    shopName,
    password,
    deviceLabel: 'mic-test',
  });

  if (signIn.status === 200) {
    return (signIn.body as { token: string }).token;
  }

  throw new Error(`Sign in failed: ${describeError(signIn.body)}`);
}

function resolveAudioFile(path: string): { promise: Promise<Buffer>; mimeType: string; name: string } {
  const extension = extname(path).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];

  if (!mimeType) {
    throw new Error(`Unsupported audio extension: ${extension || '(none)'}`);
  }

  return {
    promise: readFile(path),
    mimeType,
    name: `mic-test${extension}`,
  };
}

function capturedSeconds(bytes: number): number {
  return bytes / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const scratch = await mkdtemp(join(tmpdir(), 'sauda-mic-'));
  const rawPath = join(scratch, 'clip.pcm');
  const wavPath = join(scratch, 'clip.wav');

  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    let audio: Buffer;
    let mimeType: string;
    let filename: string;
    let availableDevices: string[] = [];
    let usedDevice: string | undefined;

    if (options.file) {
      console.log(`Using audio file ${options.file}`);
      const source = resolveAudioFile(options.file);
      audio = await source.promise;
      mimeType = source.mimeType;
      filename = source.name;
    } else {
      const preferred = options.device ?? process.env.MIC_DEVICE?.trim();
      const candidates = preferred ? [preferred] : await listMicrophones();

      if (!preferred) {
        availableDevices = candidates;
      }

      // Try each device until one actually delivers audio (dead USB devices are common).
      const { recorder, device } = await openWorkingRecorder(candidates, rawPath, options.seconds);
      usedDevice = device;

      if (options.seconds === undefined) {
        await stopOnEnter(recorder, device);
      } else {
        await finishTimed(recorder, options.seconds);
      }

      activeRecorder = undefined;

      const bytes = (await stat(rawPath)).size;

      if (bytes === 0) {
        throw new Error(
          `No audio was captured from "${device}". Check that the microphone is not muted or in use.`,
        );
      }

      if (capturedSeconds(bytes) < MIN_SECONDS) {
        throw new Error(
          `Only ${capturedSeconds(bytes).toFixed(2)}s of audio was captured; hold the mic a little longer.`,
        );
      }

      if (capturedSeconds(bytes) > MAX_SECONDS + 1) {
        throw new Error(
          `Captured ${capturedSeconds(bytes).toFixed(1)}s, which exceeds Sarvam's ${MAX_SECONDS}s REST limit.`,
        );
      }

      await rawToWav(rawPath, wavPath);
      audio = await readFile(wavPath);
      mimeType = 'audio/wav';
      filename = 'mic-test.wav';
      console.log(`Captured ${capturedSeconds(bytes).toFixed(1)}s (${(audio.length / 1024).toFixed(0)} KB).`);
    }

    const token = await obtainToken(base);

    console.log(`Sending to Sarvam via ${base}/voice/transcribe ...`);

    const startedAt = Date.now();
    const result = await postJson(
      base,
      '/voice/transcribe',
      {
        mimeType,
        filename,
        base64: audio.toString('base64'),
        mode: options.mode,
      },
      token,
    );
    const elapsed = Date.now() - startedAt;

    if (result.status !== 200) {
      throw new Error(`Transcription failed (HTTP ${result.status}): ${describeError(result.body)}`);
    }

    const transcription = result.body as {
      text: string;
      language: string | null;
      confidence: number | null;
      requestId: string | null;
    };

    console.log('');
    console.log(`You said: ${transcription.text.trim() || '(empty)'}`);
    console.log(
      `Language: ${transcription.language ?? 'unknown'}` +
        (transcription.confidence === null
          ? ''
          : ` (confidence ${(transcription.confidence * 100).toFixed(0)}%)`),
    );
    console.log(`Model:    ${env.STT_MODEL} (mode ${options.mode})`);
    console.log(`Latency:  ${elapsed} ms`);
    if (transcription.requestId) {
      console.log(`Request:  ${transcription.requestId}`);
    }

    if (!transcription.text.trim()) {
      const hint =
        availableDevices.length > 1
          ? `\nAvailable microphones:\n${availableDevices.map((device) => `  - ${device}`).join('\n')}\nPick one with --device "Name".`
          : '';
      throw new Error(
        `No speech was recognised on "${usedDevice ?? 'the selected microphone'}". ` +
          `Try again, speak closer and hold for at least a second.${hint}`,
      );
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });

    await rm(scratch, { recursive: true, force: true });
    await closeDb();
  }
}

main().catch(async (error: unknown) => {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
