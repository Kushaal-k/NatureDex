import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
// Separate workspace test directories avoid Windows temp-directory ACL collisions
// when tests run once inside the sandbox and once as the desktop user.
const temporary = path.join(root, 'artifacts', 'test-runs', randomUUID());
mkdirSync(path.dirname(temporary), { recursive:true });
const child = spawn(process.env.NATUREDEX_PYTHON || (existsSync(venv) ? venv : 'python'), ['-m', 'pytest', 'backend/tests', '-q', '--tb=short', '-p', 'no:cacheprovider', '--basetemp', temporary], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
