import { access, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const standaloneRoot = join(root, '.next', 'standalone');

try {
  await access(standaloneRoot);
} catch {
  // Standard local Next output does not have a standalone directory.
  process.exit(0);
}

await mkdir(join(standaloneRoot, 'public'), { recursive: true });
await cp(join(root, 'public'), join(standaloneRoot, 'public'), { recursive: true, force: true });

const staticSource = join(root, '.next', 'static');
const staticTarget = join(standaloneRoot, '.next', 'static');
await mkdir(staticTarget, { recursive: true });
await cp(staticSource, staticTarget, { recursive: true, force: true });
