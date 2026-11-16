import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

const tables = JSON.parse(await readFile(new URL('./notion-tables.json', import.meta.url)));
const { NOTION_TOKEN, NOTION_DATA_SOURCES, APP_USERS, SESSION_SECRET, PUBLIC_ORIGIN } = process.env;
if (!NOTION_TOKEN || !NOTION_DATA_SOURCES || !APP_USERS || !SESSION_SECRET || SESSION_SECRET.length < 32 || !PUBLIC_ORIGIN) {
  throw new Error('Set NOTION_TOKEN, NOTION_DATA_SOURCES, APP_USERS, SESSION_SECRET and PUBLIC_ORIGIN.');
}
const origin = new URL(PUBLIC_ORIGIN);
if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost')) {
  throw new Error('PUBLIC_ORIGIN must use HTTPS outside localhost.');
}
const accounts = new Map();
for (const [username, { password, role = 'editor' }] of Object.entries(JSON.parse(APP_USERS))) {
  if (!username || typeof password !== 'string' || password.length < 16 || !['editor', 'reader'].includes(role)) {
    throw new Error('Use a unique account name, a password of at least 16 characters and a valid role.');
  }
  const salt = randomBytes(16);
  accounts.set(username.trim().toLowerCase(), { salt, hash: scryptSync(password, salt, 64), role });
}
if (![...accounts.values()].some(({ role }) => role === 'editor')) throw new Error('At least one editor is required.');

const derive = promisify(scrypt);
const dummy = { salt: randomBytes(16), hash: randomBytes(64) };
const cookie = 'private_app_session';
const ttl = 60 * 60 * 24 * 7;
const limit = 4_900_000;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const tableIds = JSON.parse(NOTION_DATA_SOURCES);
for (const [name, table] of Object.entries(tables)) {
  if (!uuid.test(tableIds[name] ?? '')) throw new Error('Missing Notion data source for ' + name);
  table.id = tableIds[name];
}
if (new Set(Object.values(tables).map(table => table.id)).size !== Object.keys(tables).length) {
  throw new Error('Notion data sources must be unique.');
}
const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const attempts = new Map();
const sessions = new Map();
const mediaUrls = new Map();
const allowlist = new Map(Object.values(tables).map(table => [table.id, table]));
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/manifest.json': ['manifest.json', 'application/manifest+json'],
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sign(payload) {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function sessionFor(req) {
  const raw = req.headers.cookie?.split(/;\s*/).find(part => part.startsWith(cookie + '='))?.slice(cookie.length + 1);
  if (!raw || raw.length > 1024) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const session = sessions.get(Buffer.from(payload, 'base64url').toString('ascii'));
    if (!session || session.until < Date.now()) return null;
    const account = accounts.get(session.username);
    return account ? { id: payload, ...session, role: account.role } : null;
  } catch {
    return null;
  }
}

function sessionCookie(value, age) {
  return `${cookie}=${value}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict${origin.protocol === 'https:' ? '; Secure' : ''}`;
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

async function bytes(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      throw new HttpError(413, '사진이나 입력 데이터가 너무 커요.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function body(req) {
  try {
    return JSON.parse(await bytes(req, 128_000));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '요청 형식이 올바르지 않아요.');
  }
}

async function login(req, res) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  for (const [key, counter] of attempts) if (counter.until < now) attempts.delete(key);
  for (const [key, session] of sessions) if (session.until < now) sessions.delete(key);
  const data = await body(req);
  const username = typeof data?.username === 'string' ? data.username.trim().toLowerCase() : '';
  const password = typeof data?.password === 'string' ? data.password : '';
  if (!username || username.length > 200 || password.length > 512) throw new HttpError(400, '로그인 정보를 확인해 주세요.');
  const keys = ['ip:' + ip, 'name:' + username];
  if (attempts.size > 5000 || keys.some(key => (attempts.get(key)?.count ?? 0) >= 15)) {
    throw new HttpError(429, '로그인 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.');
  }
  for (const key of keys) {
    const counter = attempts.get(key) ?? { until: now + 5 * 60_000, count: 0 };
    attempts.set(key, { ...counter, count: counter.count + 1 });
  }
  const account = accounts.get(username);
  const { hash, salt } = account ?? dummy;
  const submitted = await derive(password, salt, hash.length);
  if (!timingSafeEqual(submitted, hash) || !account) throw new HttpError(401, '아이디 또는 비밀번호를 확인해 주세요.');
  attempts.delete(keys[1]);
  const id = randomBytes(32).toString('hex');
  sessions.set(id, { username, until: now + ttl * 1000 });
  const payload = Buffer.from(id).toString('base64url');
  json(res, 200, { role: account.role }, { 'Set-Cookie': sessionCookie(`${payload}.${sign(payload)}`, ttl) });
}

async function notion(path, { method = 'GET', data, form } = {}) {
  const headers = { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2025-09-03' };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch('https://api.notion.com/v1/' + path, {
      method, headers, body: form ?? (data === undefined ? undefined : JSON.stringify(data)),
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 429 && attempt < 4) {
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, Math.min(10, Number(response.headers.get('retry-after')) || 1) * 1000));
      continue;
    }
    if (response.status === 404) throw new HttpError(404, '노션에서 해당 기록을 찾을 수 없어요.');
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Notion request', method, path.split('/')[0], response.status, error.code);
      throw new HttpError(502, '노션 연결 또는 데이터 형식을 확인해 주세요.');
    }
    return response.json();
  }
}

function uuidKey(value) {
  return String(value ?? '').toLowerCase().replaceAll('-', '');
}

async function record(id, table) {
  if (!uuid.test(id)) throw new HttpError(404, '기록을 찾을 수 없어요.');
  const page = await notion('pages/' + id);
  const parentId = page.parent?.data_source_id;
  const parent = [...allowlist].find(([key]) => uuidKey(key) === uuidKey(parentId))?.[1];
  if (!parent || (table && parent !== table) || page.in_trash || page.archived) throw new HttpError(404, '기록을 찾을 수 없어요.');
  return { page, table: parent };
}

function filePath(id, column) {
  return '/api/media/' + id + '/' + encodeURIComponent(column);
}

function valueOf(page, key) {
  const value = page.properties[key];
  if (!value) return '';
  if (value.type === 'files') {
    const url = value.files[0]?.file?.url;
    const path = filePath(page.id, key);
    if (!url) { mediaUrls.delete(path); return ''; }
    if (mediaUrls.size >= 2500 && !mediaUrls.has(path)) mediaUrls.delete(mediaUrls.keys().next().value);
    mediaUrls.set(path, { url, until: Math.min(Date.now() + 45 * 60_000, Date.parse(value.files[0].file.expiry_time) || Infinity) });
    return path;
  }
  return (value.title ?? value.rich_text ?? []).map(part => part.plain_text ?? part.text?.content ?? '').join('');
}

function publicRow(page, table) {
  const original = page.properties['원본 행 번호']?.number;
  const generated = Number.parseInt(createHash('sha256').update(page.id).digest('hex').slice(0, 12), 16) + 100000;
  return Object.assign({ _id: page.id, _row: Number.isSafeInteger(original) && original > 0 ? original : generated },
    Object.fromEntries(table.columns.map(column => [column, valueOf(page, column)])));
}

async function list(table) {
  const records = [];
  let cursor;
  do {
    const result = await notion(`data_sources/${table.id}/query`, {
      method: 'POST',
      data: { page_size: 100, start_cursor: cursor, sorts: [{ property: '원본 행 번호', direction: 'ascending' }, { timestamp: 'created_time', direction: 'ascending' }] },
    });
    records.push(...result.results.filter(p => p.object === 'page' && !p.in_trash).map(p => publicRow(p, table)));
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);
  return records;
}

async function upload(buffer, mime) {
  if (!Object.hasOwn(types, mime) || !buffer.length) throw new HttpError(415, 'JPG, PNG, GIF 또는 WebP 사진을 선택해 주세요.');
  if (buffer.length > limit) throw new HttpError(413, '사진을 5MB 미만으로 줄여 주세요.');
  const filename = `photo-${randomBytes(8).toString('hex')}.${types[mime]}`;
  const { id } = await notion('file_uploads', { method: 'POST', data: { filename, content_type: mime } });
  const form = new FormData();
  form.set('file', new Blob([buffer], { type: mime }), filename);
  await notion(`file_uploads/${id}/send`, { method: 'POST', form });
  return id;
}

function parseFilePath(value) {
  const match = /^\/api\/media\/([a-f0-9-]+)\/([^/]+)$/i.exec(value);
  if (!match || !uuid.test(match[1])) return null;
  return { id: match[1], column: decodeURIComponent(match[2]) };
}

async function mediaSource(id, column) {
  const path = filePath(id, column);
  const retrieve = async () => {
    const { page, table } = await record(id);
    const url = table.photo.includes(column) && valueOf(page, column);
    if (!url) throw new HttpError(404, '사진을 찾을 수 없어요.');
    return mediaUrls.get(path);
  };
  let media = mediaUrls.get(path);
  if (!media || media.until - 30_000 < Date.now()) media = await retrieve();
  let response = await fetch(media.url, { signal: AbortSignal.timeout(30_000) });
  if (response.status === 403 || response.status === 404) {
    await response.body?.cancel();
    media = await retrieve();
    response = await fetch(media.url, { signal: AbortSignal.timeout(30_000) });
  }
  if (!response.ok) throw new HttpError(502, '노션에서 사진을 불러오지 못했어요.');
  return response;
}

function rich(value) {
  const chars = Array.from(value);
  const segments = [];
  for (let i = 0; i < chars.length; i += 900) segments.push({ type: 'text', text: { content: chars.slice(i, i + 900).join('') } });
  return segments;
}

async function properties(table, values, existing) {
  if (!Array.isArray(values) || values.length > table.columns.length || values.some(v => typeof v !== 'string' || v.length > 24000)) {
    throw new HttpError(400, '기록에 저장할 데이터가 올바르지 않아요.');
  }
  const result = {};
  for (const [index, key] of table.columns.entries()) {
    if (index >= values.length && existing) continue;
    const val = values[index] ?? '';
    if (!table.photo.includes(key)) {
      const kind = key === table.title ? 'title' : 'rich_text';
      result[key] = { [kind]: rich(val || (kind === 'title' ? '(제목 없음)' : '')) };
      continue;
    }
    if (!val) {
      result[key] = { files: [] };
      continue;
    }
    if (existing && val === filePath(existing.id, key)) continue;
    let id = val.startsWith('upload:') ? val.slice(7) : null;
    if (!id) {
      const source = parseFilePath(val);
      if (!source) throw new HttpError(400, '사진을 다시 선택해 주세요.');
      const response = await mediaSource(source.id, source.column);
      id = await upload(Buffer.from(await response.arrayBuffer()), response.headers.get('content-type')?.split(';')[0]);
    }
    if (!uuid.test(id)) throw new HttpError(400, '사진 업로드 정보가 올바르지 않아요.');
    result[key] = { files: [{ type: 'file_upload', file_upload: { id } }] };
  }
  return result;
}

async function route(req, res) {
  const url = new URL(req.url, origin);
  const method = req.method;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (method === 'GET' && Object.hasOwn(assets, url.pathname)) {
    const [file, type] = assets[url.pathname];
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    return res.end(await readFile(new URL(file, import.meta.url)));
  }
  if (!url.pathname.startsWith('/api/')) throw new HttpError(404, '페이지를 찾을 수 없어요.');
  if (method !== 'GET' && req.headers.origin !== origin.origin) throw new HttpError(403, '이 주소에서만 저장할 수 있어요.');
  if (method === 'POST' && url.pathname === '/api/login') return login(req, res);
  const session = sessionFor(req);
  if (method === 'POST' && url.pathname === '/api/logout') {
    if (session) sessions.delete(Buffer.from(session.id, 'base64url').toString('ascii'));
    return json(res, 200, {}, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (!session) throw new HttpError(401, '로그인이 필요해요.');
  if (method === 'GET' && url.pathname === '/api/session') return json(res, 200, { role: session.role });
  if (method !== 'GET' && session.role !== 'editor') throw new HttpError(403, '이 계정은 읽기 전용이에요.');
  if (method === 'POST' && url.pathname === '/api/photos') {
    return json(res, 201, { upload: 'upload:' + await upload(await bytes(req, limit), req.headers['content-type']) });
  }
  if (method === 'GET' && url.pathname.startsWith('/api/media/')) {
    const source = parseFilePath(url.pathname);
    if (!source) throw new HttpError(404, '사진을 찾을 수 없어요.');
    const media = await mediaSource(source.id, source.column);
    const mime = media.headers.get('content-type')?.split(';')[0];
    if (!Object.hasOwn(types, mime)) throw new HttpError(415, '지원하지 않는 사진 형식이에요.');
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, max-age=60' });
    return Readable.fromWeb(media.body).pipe(res);
  }
  const [, , path, name, id, extra] = url.pathname.split('/');
  const tableName = name && decodeURIComponent(name);
  const table = Object.hasOwn(tables, tableName) ? tables[tableName] : null;
  if (path !== 'records' || !table || extra) throw new HttpError(404, '기록을 찾을 수 없어요.');
  if (method === 'GET' && !id) return json(res, 200, await list(table));
  if (method === 'POST' && !id) {
    const { values } = await body(req);
    const page = await notion('pages', { method: 'POST', data: {
      parent: { type: 'data_source_id', data_source_id: table.id },
      properties: await properties(table, values),
    } });
    return json(res, 201, publicRow(page, table));
  }
  if (id && (method === 'PATCH' || method === 'DELETE')) {
    const { page } = await record(id, table);
    if (method === 'DELETE') {
      await notion('pages/' + id, { method: 'PATCH', data: { in_trash: true } });
      for (const column of table.photo) mediaUrls.delete(filePath(id, column));
      return json(res, 200, {});
    }
    const { values } = await body(req);
    const updated = await notion('pages/' + id, { method: 'PATCH', data: { properties: await properties(table, values, page) } });
    return json(res, 200, publicRow(updated, table));
  }
  throw new HttpError(405, '지원하지 않는 요청이에요.');
}

createServer((req, res) => {
  route(req, res).catch(error => {
    if (res.headersSent) return res.destroy(error);
    if (!(error instanceof HttpError)) console.error(error.name, error.message);
    json(res, error.status ?? 502, { message: error.status ? error.message : '잠시 후 다시 시도해 주세요.' });
  });
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
