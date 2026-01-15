import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockPath = path.join(__dirname, '../mock_events/wrapped_mock_event.json');
let mock;
try {
  mock = JSON.parse(await fs.readFile(mockPath, 'utf8'));
} catch (e) {
  console.error('Failed to load mock event at', mockPath, e);
  process.exit(1);
}

const handlerModulePath = path.join(__dirname, '../dist/minimalHandler.js');
const handlerModuleUrl = pathToFileURL(handlerModulePath).href;
let handlerModule;
try {
  handlerModule = await import(handlerModuleUrl);
} catch (e) {
  console.error('Failed to import handler module at', handlerModuleUrl, e);
  process.exit(1);
}

console.log('Invoking minimal handler with APIGW mock event...');
const event = mock;
const res = await handlerModule.handler(event);
console.log('Handler returned:');
console.dir(res, { depth: 5 });
