import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '../src/config.js';
import { createApp } from '../src/app.js';
import { closeDb } from '../src/db.js';

const run = promisify(execFile);

const MAX_SECONDS = 30;
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

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
  seconds: number;
  device?: string;
  file?: string;
}

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value`);
  }

  return value;
}

function parseArguments(argv: readonly string[]): Options {
  const options: Options = { seconds: 5 };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;

    if (flag === '--seconds') {
      const value = Number(takeValue(argv, index + 1, flag));
      if (!Number.isFinite(value) || value < 1) {
        throw new Error('--seconds must be a number of at least 1');
      }
      options.seconds = Math.min(Math.round(value), MAX_SECONDS);
      index += 1;
    } else if (flag === '--device') {
      options.device = takeValue(argv, index + 1, flag);
      index += 1;
    } else if (flag === '--file') {
      options.file = takeValue(argv, index + 1, flag);
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

function printUsage(): void {
  console.log(`Sauda microphone test

Records a short clip and prints the English (translated) transcript.

  SAUDA_PIN=4821 npm run mic:test
  SAUDA_TOKEN=<device-token> npm run mic:test
  npm run mic:test -- --seconds 8 --device "Microphone (Realtek)"
  npm run mic:test -- --file sample.wav

Options:
  --seconds N    Clip length, 1-${MAX_SECONDS} seconds (default 5)
  --device NAME  ffmpeg dshow microphone name (default: first audio device)
  --file PATH    Transcribe an existing audio file instead of recording

Environment:
  SAUDA_PIN      Owner PIN, used to unlock and mint a device token
  SAUDA_TOKEN    Existing device token; skips unlocking
  SAUDA_SHOP_NAME  Shop name if first-run setup is needed (default "Sauda Demo Shop")
  MIC_DEVICE     Default microphone when --device is not passed
  FFMPEG_PATH    Path to the ffmpeg binary (default: ffmpeg on PATH)`);
}

async function detectMicrophone(): Promise<string> {
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

  const names = [...output.matchAll(/"([^"]+)"\s+\(audio\)/g)].map((match) => match[1]);

  if (names.length === 0) {
    throw new Error(
      'No microphone was found. Connected audio input devices:\n' +
        (output.trim() || '(ffmpeg returned no device list)') +
        '\nPass --device "Name" or set MIC_DEVICE.',
    );
  }

  return names[0]!;
}

async function recordClip(device: string, seconds: number, outputPath: string): Promise<void> {
  console.log(`Recording ${seconds}s from "${device}"... speak now.`);

  await run(
    FFMPEG,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'dshow',
      '-i',
      `audio=${device}`,
      '-t',
      String(seconds),
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      outputPath,
    ],
    { timeout: (seconds + 20) * 1000 },
  );
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

  const pin = process.env.SAUDA_PIN?.trim();
  if (!pin) {
    throw new Error(
      'A device token is required. Set SAUDA_PIN (owner PIN) or SAUDA_TOKEN, then rerun.',
    );
  }

  const unlock = await postJson(base, '/auth/unlock', { pin, deviceLabel: 'mic-test' });

  if (unlock.status === 200) {
    return (unlock.body as { token: string }).token;
  }

  if (unlock.status === 409) {
    const shopName = process.env.SAUDA_SHOP_NAME?.trim() || 'Sauda Demo Shop';
    const setup = await postJson(base, '/auth/setup', { shopName, pin });

    if (setup.status === 201) {
      console.log(`First run: created shop "${shopName}".`);
      return (setup.body as { token: string }).token;
    }

    throw new Error(`Setup failed: ${describeError(setup.body)}`);
  }

  throw new Error(`Unlock failed: ${describeError(unlock.body)}`);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const scratch = await mkdtemp(join(tmpdir(), 'sauda-mic-'));
  const recordingPath = options.file ?? join(scratch, 'clip.wav');

  const server = createApp().listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    if (!options.file) {
      const device = options.device ?? process.env.MIC_DEVICE?.trim() ?? (await detectMicrophone());
      await recordClip(device, options.seconds, recordingPath);
    } else {
      console.log(`Using audio file ${options.file}`);
    }

    const mimeType =
      MIME_BY_EXTENSION[extname(recordingPath).toLowerCase()] ??
      (() => {
        throw new Error(`Unsupported audio extension: ${extname(recordingPath) || '(none)'}`);
      })();

    const audio = await readFile(recordingPath);
    const token = await obtainToken(base);

    console.log(`Sending ${(audio.length / 1024).toFixed(0)} KB of audio to ${base}/voice/transcribe`);

    const startedAt = Date.now();
    const result = await postJson(
      base,
      '/voice/transcribe',
      {
        mimeType,
        filename: 'mic-test' + extname(recordingPath).toLowerCase(),
        base64: audio.toString('base64'),
        mode: 'translate',
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
    console.log(`Transcript: ${transcription.text.trim() || '(empty)'}`);
    console.log(
      `Language:   ${transcription.language ?? 'unknown'}` +
        (transcription.confidence === null
          ? ''
          : ` (confidence ${(transcription.confidence * 100).toFixed(0)}%)`),
    );
    console.log(`Model:      ${env.STT_MODEL} (mode ${env.STT_MODE})`);
    console.log(`Latency:    ${elapsed} ms`);
    if (transcription.requestId) {
      console.log(`Request:    ${transcription.requestId}`);
    }

    if (!transcription.text.trim()) {
      throw new Error('Sarvam returned an empty transcript');
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
