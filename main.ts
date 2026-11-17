// Solmar Heat — entry program for the make.fun gta6-01 bounty.
// Copies game/ and screenshots/ beside this file into the output directory
// and writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only. It writes ONLY to MAKEFUN_OUTPUT_DIR
// (never to the repository, never to the working directory), makes no network
// requests, and finishes in well under ten seconds.
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function clearContents(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function makeWritable(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      chmodSync(path, 0o755);
      makeWritable(path);
    } else {
      chmodSync(path, 0o644);
    }
  }
}

function main(): void {
  const gameSrc = join(scriptDir, 'game');
  const shotsSrc = join(scriptDir, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error(`no game/ beside ${scriptDir}`);
  if (!existsSync(shotsSrc)) throw new Error(`no screenshots/ beside ${scriptDir}`);
  clearContents(outDir);
  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
  makeWritable(outDir);
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`dossier written: ${dossier.length} bytes -> ${join(outDir, 'dossier.json')}`);
}

main();
