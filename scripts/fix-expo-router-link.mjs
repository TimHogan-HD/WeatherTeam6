import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(path.join(repoRoot, 'package.json'));
const requireFromMobile = createRequire(path.join(repoRoot, 'apps/mobile/package.json'));

function resolveExpoRouterTarget() {
  for (const packageRequire of [requireFromMobile, requireFromRoot]) {
    try {
      return path.dirname(packageRequire.resolve('expo-router/package.json'));
    } catch {
      continue;
    }
  }

  return null;
}

const expoRouterTarget = resolveExpoRouterTarget();

if (!expoRouterTarget) {
  process.exit(0);
}

const linkLocations = [
  path.join(repoRoot, 'node_modules/expo-router'),
  path.join(repoRoot, 'node_modules/@expo/cli/node_modules/expo-router'),
];

function sameSymlinkTarget(linkLocation, targetLocation) {
  try {
    const currentTarget = fs.readlinkSync(linkLocation);
    const resolvedCurrentTarget = path.resolve(path.dirname(linkLocation), currentTarget);
    return resolvedCurrentTarget === targetLocation;
  } catch {
    return false;
  }
}

function getPathStat(linkLocation) {
  try {
    return fs.lstatSync(linkLocation);
  } catch {
    return null;
  }
}

for (const linkLocation of linkLocations) {
  try {
    fs.mkdirSync(path.dirname(linkLocation), { recursive: true });

    const stat = getPathStat(linkLocation);

    if (stat) {
      if (stat.isSymbolicLink() && sameSymlinkTarget(linkLocation, expoRouterTarget)) {
        continue;
      }
      fs.rmSync(linkLocation, { recursive: true, force: true });
    }

    fs.symlinkSync(expoRouterTarget, linkLocation, 'dir');
  } catch {
    // Non-fatal — EAS and some environments don't need this symlink
  }
}
