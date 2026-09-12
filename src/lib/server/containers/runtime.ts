import { engine } from './engine/engine';
import { settingsService } from './settings';
import { WatcherService } from './watcher';

export const watcher = new WatcherService(engine, settingsService);

// Start the watcher once at server startup if it was previously enabled.
watcher.ensureRunning();
