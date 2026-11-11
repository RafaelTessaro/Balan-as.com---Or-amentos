// Globais do Node usados pelos módulos do servidor (injetados pelo esbuild).
import { Buffer } from 'buffer';

export const process = {
  env: { DATA_DIR: '/dados' },
  platform: 'browser',
  cwd: () => '/',
  version: 'v22.0.0',
  versions: {},
  nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)),
  on: () => {},
  emitWarning: () => {},
};
export { Buffer };
