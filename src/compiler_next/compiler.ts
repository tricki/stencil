import { Cache } from '../compiler/cache';
import { CompilerNext, CompilerWatcher, Config, Diagnostic } from '../declarations';
import { CompilerContext } from '../compiler/build/compiler-ctx';
import { createFullBuild } from './build/full-build';
import { createSysWorker } from './sys/worker/sys-worker';
import { createWatchBuild } from './build/watch-build';
import { getConfig } from './sys/config';
import { inMemoryFs } from './sys/in-memory-fs';
import { patchFs } from './sys/fs-patch';
import { patchTypescript } from './sys/typescript/typescript-patch';


export const createCompiler = async (config: Config) => {
  // actual compiler code
  // could be in a web worker on the browser
  // or the main thread in node
  config = getConfig(config);
  const diagnostics: Diagnostic[] = [];
  const sys = config.sys_next;

  patchFs(sys);

  const compilerCtx = new CompilerContext(config);

  compilerCtx.worker = createSysWorker(sys, compilerCtx.events, config.maxConcurrentWorkers);

  // console.log('autoPrefixCss', await compilerCtx.worker.autoPrefixCss('body{}'));
  console.log('minifyJs', await compilerCtx.worker.minifyJs('// minifyjs'));
  console.log('optimizeCss', await compilerCtx.worker.optimizeCss({
    css: `
    body {
      /* comment */
      flex: 1;
    }
    `,
    filePath: 'file.css',
    autoprefixer: config.autoprefixCss,
    minify: true,
    legecyBuild: false,
  }));
  console.log('scopeCss', await compilerCtx.worker.scopeCss(':host { color: red; }', 'test', false));

  compilerCtx.fs = inMemoryFs(sys);
  compilerCtx.cache = new Cache(config, inMemoryFs(sys));
  await compilerCtx.cache.initCacheDir();

  await patchTypescript(config, diagnostics, compilerCtx.fs);

  let watcher: CompilerWatcher = null;

  const compiler: CompilerNext = {
    build: () => createFullBuild(config, compilerCtx),
    createWatcher: async () => {
      watcher = await createWatchBuild(config, compilerCtx);
      return watcher;
    },
    destroy: async () => {
      compilerCtx.reset();
      compilerCtx.events.unsubscribeAll();

      if (watcher) {
        await watcher.close();
        watcher = null;
      }
    },
    sys
  };

  config.logger.printDiagnostics(diagnostics);

  return compiler;
};
