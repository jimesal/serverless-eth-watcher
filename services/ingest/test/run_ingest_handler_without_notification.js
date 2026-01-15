import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// updated path: mock events moved under src/mock_events
const mockPath = path.join(__dirname, '..', 'mock_events', 'wrapped_mock_event.json');
const mock = JSON.parse(await fs.readFile(mockPath, 'utf8'));

// inject test env vars BEFORE importing the compiled handler so top-level
// module initialization that reads env vars won't fail.
process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';

// build target compiled handler path (updated after moving files)
const compiledPath = path.join(__dirname, '../dist/handlerWithoutNotification.js');
const compiledUrl = pathToFileURL(compiledPath).href;

let handlerModule;
try {
  handlerModule = await import(compiledUrl);
} catch (e) {
  // If import fails (e.g. compiled bundle is CommonJS or package.json forces modules),
  // try requiring a .cjs wrapper if present, else try requiring the JS file directly.
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const compiledCjsPath = compiledPath.replace(/\.js$/i, '.cjs');
    try {
      // prefer .cjs wrapper
      handlerModule = require(compiledCjsPath);
    } catch (eReq) {
      handlerModule = require(compiledPath);
    }
  } catch (e2) {
    console.error('Failed to import compiled handler at', compiledUrl, e);
    console.error('Also failed to require compiled handler:', e2);
    process.exit(1);
  }
}

// create mock ddb that logs calls
const mockDdb = {
  send: async (cmd) => {
    const name = cmd && cmd.constructor ? cmd.constructor.name : 'UnknownCommand';
    console.log(`MockDDB.send called with ${name}`);
    // log command input if available (PutCommand has Item, UpdateCommand has Key/UpdateExpression)
    try {
      if (cmd.input) console.log('  input:', JSON.stringify(cmd.input));
    } catch {}
    return {};
  }
};

// set mock ddb into handler module if setter exists
if (typeof handlerModule.setDdb === 'function') {
  handlerModule.setDdb(mockDdb);
} else {
  console.warn('handler module does not export setDdb; cannot inject mock ddb');
}

console.log('Invoking ingest handler (with mock DDB) using APIGW mock...');
// Pass the full API Gateway envelope so the handler can parse `event.body`
const res = await handlerModule.handler(mock);
console.log('Handler returned:');
console.dir(res, { depth: 5 });
