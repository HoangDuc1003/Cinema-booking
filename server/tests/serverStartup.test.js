import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const serverEntryUrl = new URL('../api/index.js', import.meta.url).href;

test('Vercel serverless entrypoint imports without a startup failure', async (t) => {
    // Use an empty working directory so dotenv cannot load a developer's local secrets.
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'nitrocine-startup-'));
    t.after(() => rm(workingDirectory, { recursive: true, force: true }));

    const env = {
        ...process.env,
        VERCEL: '1',
        NODE_ENV: 'test',
        CLIENT_URL: 'https://nitrocine.vercel.app/',
        CORS_ALLOWED_ORIGINS: '',
        REDIS_URL: '',
        MONGODB_URI: '',
        CLERK_SECRET_KEY: '',
        CLERK_PUBLISHABLE_KEY: '',
        CLOUDINARY_NAME: '',
        CLOUDINARY_API_KEY: '',
        CLOUDINARY_SECRET_KEY: '',
        INNGEST_EVENT_KEY: '',
        INNGEST_SIGNING_KEY: '',
    };

    const script = `
        import(${JSON.stringify(serverEntryUrl)})
            .then(({ default: app }) => {
                if (typeof app !== 'function') {
                    throw new Error('Express app was not exported');
                }
                process.stdout.write('SERVERLESS_ENTRY_OK');
                process.exit(0);
            })
            .catch((error) => {
                console.error(error?.stack || error);
                process.exit(1);
            });
    `;

    const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--input-type=module', '--eval', script],
        { cwd: workingDirectory, env, timeout: 10_000 },
    );

    assert.match(stdout, /SERVERLESS_ENTRY_OK/);
    assert.doesNotMatch(stderr, /SyntaxError|Identifier .* has already been declared/);
});
