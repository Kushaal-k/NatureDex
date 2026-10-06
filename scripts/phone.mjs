import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..',import.meta.url));
const venv = path.join(root,'.venv',process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.NATUREDEX_PYTHON || (existsSync(venv) ? venv : 'python');
const child = spawn(python,['scripts/phone.py'],{cwd:root,stdio:['pipe','inherit','inherit']});
child.on('error',error=>{ console.error(error.message); process.exitCode=1; });
child.on('exit',code=>{process.exitCode=code || 0;});
function stop() { if (!child.stdin.destroyed) child.stdin.end('stop\n'); }
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
