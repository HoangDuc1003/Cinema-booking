import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import handleClerkProxy from '../api/clerk-proxy.js';

const createRequest = ({ method = 'GET', url, headers = {}, body = '' }) => {
  const request = Readable.from(body ? [Buffer.from(body)] : []);
  request.method = method;
  request.url = url;
  request.headers = headers;
  return request;
};

const createResponse = () => {
  const chunks = [];
  const response = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.from(chunk, encoding));
      callback();
    },
  });
  response.headers = {};
  response.setHeader = (name, value) => {
    response.headers[name.toLowerCase()] = value;
  };
  response.getBody = () => Buffer.concat(chunks).toString('utf8');
  return response;
};

test('Clerk proxy forwards the request and rewrites upstream redirects', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = {
      url: String(url),
      method: options.method,
      proxyUrl: options.headers.get('Clerk-Proxy-Url'),
      secretKey: options.headers.get('Clerk-Secret-Key'),
      forwardedFor: options.headers.get('X-Forwarded-For'),
      cookie: options.headers.get('cookie'),
      body: options.body ? await new Response(options.body).text() : '',
    };
    return new Response('redirected', {
      status: 307,
      headers: {
        location: 'https://frontend-api.clerk.dev/sessions/continue?next=1',
        'set-cookie': 'session=abc; Path=/; Secure',
      },
    });
  };

  try {
    const request = createRequest({
      method: 'POST',
      url: '/api/clerk-proxy?_clerk_path=%2Fsessions&mode=redirect',
      headers: {
        host: 'nitrocine.vercel.app',
        cookie: 'foo=bar',
        'x-vercel-forwarded-for': '203.0.113.5, 10.0.0.1',
        'content-type': 'application/json',
      },
      body: '{"test":true}',
    });
    const response = createResponse();
    const finished = new Promise((resolve) => response.once('finish', resolve));

    await handleClerkProxy(request, response, {
      CLERK_SECRET_KEY: 'server_fixture_only',
      CLERK_PROXY_URL: 'https://nitrocine.vercel.app/__clerk',
      CLERK_FAPI: 'https://frontend-api.clerk.dev',
    });
    await finished;

    assert.deepEqual(captured, {
      url: 'https://frontend-api.clerk.dev/sessions?mode=redirect',
      method: 'POST',
      proxyUrl: 'https://nitrocine.vercel.app/__clerk',
      secretKey: 'server_fixture_only',
      forwardedFor: '203.0.113.5',
      cookie: 'foo=bar',
      body: '{"test":true}',
    });
    assert.equal(response.statusCode, 307);
    assert.equal(
      response.headers.location,
      'https://nitrocine.vercel.app/__clerk/sessions/continue?next=1',
    );
    assert.match(response.getBody(), /redirected/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Clerk proxy fails closed when its server-only secret is missing', async () => {
  const request = createRequest({ url: '/api/clerk-proxy?_clerk_path=%2Fhealth' });
  const response = createResponse();
  const finished = new Promise((resolve) => response.once('finish', resolve));

  await handleClerkProxy(request, response, {});
  await finished;

  assert.equal(response.statusCode, 500);
  assert.equal(response.getBody(), '{"error":"CLERK_PROXY_NOT_CONFIGURED"}');
});
