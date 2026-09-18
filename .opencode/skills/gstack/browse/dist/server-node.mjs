import { createRequire } from "node:module";
// ── Windows Node.js compatibility (auto-generated) ──
import { fileURLToPath as _ftp } from "node:url";
import { dirname as _dn } from "node:path";
const __browseNodeSrcDir = _dn(_dn(_ftp(import.meta.url))) + "/src";
{ const _r = createRequire(import.meta.url); _r("./bun-polyfill.cjs"); }
// ── end compatibility ──
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// browse/src/file-permissions.ts
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
function currentUserSid() {
  if (cachedSid !== undefined)
    return cachedSid;
  try {
    const systemRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
    const out = execFileSync(`${systemRoot}\\System32\\whoami.exe`, ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true
    });
    const match = out.match(/S-1-[\d-]+/);
    cachedSid = match ? match[0] : null;
  } catch {
    cachedSid = null;
  }
  return cachedSid;
}
function currentUserPrincipal() {
  const sid = currentUserSid();
  if (sid)
    return `*${sid}`;
  const domain = process.env.USERDOMAIN || os.hostname();
  return `${domain}\\${os.userInfo().username}`;
}
function warnIcaclsFailure(fsPath, err) {
  if (warnedOnce)
    return;
  warnedOnce = true;
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[gstack] Failed to restrict Windows ACL on ${fsPath}: ${msg}
` + `  Sensitive files may be readable by other accounts on this machine.
` + `  This warning appears once per process; subsequent failures are silent.`);
}
function restrictFilePermissions(filePath) {
  if (process.platform === "win32") {
    try {
      const user = currentUserPrincipal();
      execFileSync("icacls", [filePath, "/inheritance:r", "/grant:r", `${user}:(F)`], { stdio: "ignore", windowsHide: true });
    } catch (err) {
      warnIcaclsFailure(filePath, err);
    }
    return;
  }
  try {
    fs.chmodSync(filePath, 384);
  } catch {}
}
function restrictDirectoryPermissions(dirPath) {
  try {
    if (fs.lstatSync(dirPath).isSymbolicLink()) {
      console.warn(`[gstack] Refusing to restrict permissions through symlink ${dirPath} — skipping.
` + `  Restricting through a symlink would alter the link target instead. ` + `Harden the real directory directly.`);
      return;
    }
  } catch {}
  if (process.platform === "win32") {
    try {
      const user = currentUserPrincipal();
      execFileSync("icacls", [dirPath, "/inheritance:r", "/grant:r", `${user}:(OI)(CI)(F)`], { stdio: "ignore", windowsHide: true });
    } catch (err) {
      warnIcaclsFailure(dirPath, err);
    }
    return;
  }
  try {
    const fd = fs.openSync(dirPath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      if (!shouldHardenDir(fs.fstatSync(fd))) {
        warnUnhardenedDirOnce(dirPath);
        return;
      }
      fs.fchmodSync(fd, 448);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    if (err?.code === "EACCES") {
      try {
        const st = fs.lstatSync(dirPath);
        if (st.isDirectory() && shouldHardenDir(st)) {
          fs.chmodSync(dirPath, 448);
          return;
        }
      } catch {}
    }
    if (err?.code === "ELOOP" || err?.code === "ENOTDIR" || err?.code === "EACCES") {
      warnUnhardenedDirOnce(dirPath);
    }
  }
}
function shouldHardenDir(st) {
  const uid = process.geteuid?.() ?? process.getuid?.();
  if (st.uid !== uid)
    return false;
  if ((st.mode & 514) === 514)
    return false;
  if (uid === 0 && (st.mode & 2) === 2)
    return false;
  return true;
}
function warnUnhardenedDirOnce(dirPath) {
  if (unhardenedWarned.has(dirPath))
    return;
  unhardenedWarned.add(dirPath);
  console.warn(`[gstack] directory ${dirPath} is shared, symlinked, or owned by another user; ` + "gstack left its permissions untouched — use a private, non-symlinked directory for owner-only hardening");
}
function writeSecureFile(filePath, data) {
  fs.writeFileSync(filePath, data, { mode: 384 });
  restrictFilePermissions(filePath);
}
function appendSecureFile(filePath, data) {
  const existed = fs.existsSync(filePath);
  fs.appendFileSync(filePath, data, { mode: 384 });
  if (!existed)
    restrictFilePermissions(filePath);
}
function canListDir(dirPath) {
  try {
    fs.readdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}
function repairBrokenDacl(dirPath) {
  if (process.platform !== "win32")
    return;
  try {
    execFileSync("icacls", [dirPath, "/reset", "/T", "/C", "/Q"], { stdio: "ignore", windowsHide: true });
  } catch (err) {
    warnIcaclsFailure(dirPath, err);
  }
}
function mkdirSecure(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 448 });
  restrictDirectoryPermissions(dirPath);
  if (process.platform === "win32" && !canListDir(dirPath)) {
    repairBrokenDacl(dirPath);
    restrictDirectoryPermissions(dirPath);
    if (!canListDir(dirPath))
      repairBrokenDacl(dirPath);
  }
}
var warnedOnce = false, cachedSid, unhardenedWarned;
var init_file_permissions = __esm(() => {
  unhardenedWarned = new Set;
});

// browse/src/buffers.ts
class CircularBuffer {
  buffer;
  head = 0;
  _size = 0;
  _totalAdded = 0;
  capacity;
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }
  push(entry) {
    const index = (this.head + this._size) % this.capacity;
    this.buffer[index] = entry;
    if (this._size < this.capacity) {
      this._size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    this._totalAdded++;
  }
  toArray() {
    const result = [];
    for (let i = 0;i < this._size; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity]);
    }
    return result;
  }
  last(n) {
    const count = Math.min(n, this._size);
    const result = [];
    const start = (this.head + this._size - count) % this.capacity;
    for (let i = 0;i < count; i++) {
      result.push(this.buffer[(start + i) % this.capacity]);
    }
    return result;
  }
  get length() {
    return this._size;
  }
  get totalAdded() {
    return this._totalAdded;
  }
  clear() {
    this.head = 0;
    this._size = 0;
  }
  get(index) {
    if (index < 0 || index >= this._size)
      return;
    return this.buffer[(this.head + index) % this.capacity];
  }
  set(index, entry) {
    if (index < 0 || index >= this._size)
      return;
    this.buffer[(this.head + index) % this.capacity] = entry;
  }
}
function addConsoleEntry(entry) {
  consoleBuffer.push(entry);
}
function addNetworkEntry(entry) {
  networkBuffer.push(entry);
}
function addDialogEntry(entry) {
  dialogBuffer.push(entry);
}
var HIGH_WATER_MARK = 50000, consoleBuffer, networkBuffer, dialogBuffer;
var init_buffers = __esm(() => {
  consoleBuffer = new CircularBuffer(HIGH_WATER_MARK);
  networkBuffer = new CircularBuffer(HIGH_WATER_MARK);
  dialogBuffer = new CircularBuffer(HIGH_WATER_MARK);
});

// browse/src/activity.ts
function filterArgs(command, args) {
  if (!args || args.length === 0)
    return args;
  if (command === "fill" && args.length >= 2) {
    const selector = args[0];
    if (/password|passwd|secret|token/i.test(selector)) {
      return [selector, "[REDACTED]"];
    }
    return args;
  }
  if (command === "header" && args.length >= 1) {
    const headerLine = args[0];
    if (/^(authorization|x-api-key|cookie|set-cookie)/i.test(headerLine)) {
      const colonIdx = headerLine.indexOf(":");
      if (colonIdx > 0) {
        return [headerLine.substring(0, colonIdx + 1) + "[REDACTED]"];
      }
    }
    return args;
  }
  if (command === "cookie" && args.length >= 1) {
    const cookieStr = args[0];
    const eqIdx = cookieStr.indexOf("=");
    if (eqIdx > 0) {
      return [cookieStr.substring(0, eqIdx + 1) + "[REDACTED]"];
    }
    return args;
  }
  if (command === "type") {
    return ["[REDACTED]"];
  }
  return args.map((arg) => {
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      try {
        const url = new URL(arg);
        let redacted = false;
        for (const key of url.searchParams.keys()) {
          if (SENSITIVE_PARAM_PATTERN.test(key)) {
            url.searchParams.set(key, "[REDACTED]");
            redacted = true;
          }
        }
        return redacted ? url.toString() : arg;
      } catch {
        return arg;
      }
    }
    return arg;
  });
}
function truncateResult(result) {
  if (!result)
    return;
  if (result.length <= 200)
    return result;
  return result.substring(0, 200) + "...";
}
function emitActivity(entry) {
  const full = {
    ...entry,
    id: nextId++,
    timestamp: Date.now(),
    args: entry.args ? filterArgs(entry.command || "", entry.args) : undefined,
    result: truncateResult(entry.result)
  };
  activityBuffer.push(full);
  for (const notify of subscribers) {
    queueMicrotask(() => {
      try {
        notify(full);
      } catch {}
    });
  }
  return full;
}
function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
function getActivityAfter(afterId) {
  const total = activityBuffer.totalAdded;
  const allEntries = activityBuffer.toArray();
  if (afterId === 0) {
    return { entries: allEntries, gap: false, totalAdded: total };
  }
  const oldestId = allEntries.length > 0 ? allEntries[0].id : nextId;
  if (afterId < oldestId) {
    return {
      entries: allEntries,
      gap: true,
      gapFrom: afterId + 1,
      availableFrom: oldestId,
      totalAdded: total
    };
  }
  const filtered = allEntries.filter((e) => e.id > afterId);
  return { entries: filtered, gap: false, totalAdded: total };
}
function getActivityHistory(limit = 50) {
  const allEntries = activityBuffer.toArray();
  const sliced = limit < allEntries.length ? allEntries.slice(-limit) : allEntries;
  return { entries: sliced, totalAdded: activityBuffer.totalAdded };
}
function getSubscriberCount() {
  return subscribers.size;
}
var BUFFER_CAPACITY = 1000, activityBuffer, nextId = 1, subscribers, SENSITIVE_COMMANDS, SENSITIVE_PARAM_PATTERN;
var init_activity = __esm(() => {
  init_buffers();
  activityBuffer = new CircularBuffer(BUFFER_CAPACITY);
  subscribers = new Set;
  SENSITIVE_COMMANDS = new Set(["fill", "type", "cookie", "header"]);
  SENSITIVE_PARAM_PATTERN = /\b(password|token|secret|key|auth|bearer|api[_-]?key)\b/i;
});

// browse/src/platform.ts
import * as os2 from "os";
import * as path from "path";
function trustableTmpdir(dir) {
  const resolved = path.resolve(dir);
  const home = os2.homedir();
  if (resolved === path.parse(resolved).root)
    return false;
  if (resolved === home)
    return false;
  return !isPathWithin(path.resolve(process.cwd()), resolved) || isPathWithin(resolved, TEMP_DIR);
}
function isPathWithin(resolvedPath, dir) {
  return resolvedPath === dir || resolvedPath.startsWith(dir + path.sep);
}
var IS_WINDOWS, TEMP_DIR, TEMP_DIRS;
var init_platform = __esm(() => {
  IS_WINDOWS = process.platform === "win32";
  TEMP_DIR = IS_WINDOWS ? os2.tmpdir() : "/tmp";
  TEMP_DIRS = [...new Set([TEMP_DIR, os2.tmpdir()].filter((d, i) => i === 0 || trustableTmpdir(d)))];
});

// browse/src/path-security.ts
import * as fs2 from "fs";
import * as path2 from "path";
function validateOutputPath(filePath) {
  const resolved = path2.resolve(filePath);
  try {
    const stat = fs2.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      const realTarget = fs2.realpathSync(resolved);
      const isSafe = SAFE_DIRECTORIES.some((dir) => isPathWithin(realTarget, dir));
      if (!isSafe) {
        throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
      }
      return;
    }
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
  let dir = path2.dirname(resolved);
  let realDir;
  try {
    realDir = fs2.realpathSync(dir);
  } catch {
    try {
      realDir = fs2.realpathSync(path2.dirname(dir));
    } catch {
      throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
    }
  }
  const realResolved = path2.join(realDir, path2.basename(resolved));
  const isSafe = SAFE_DIRECTORIES.some((dir) => isPathWithin(realResolved, dir));
  if (!isSafe) {
    throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
  }
}
function validateReadPath(filePath) {
  const resolved = path2.resolve(filePath);
  let realPath;
  try {
    realPath = fs2.realpathSync(resolved);
  } catch (err) {
    if (err.code === "ENOENT") {
      try {
        const dir = fs2.realpathSync(path2.dirname(resolved));
        realPath = path2.join(dir, path2.basename(resolved));
      } catch {
        realPath = resolved;
      }
    } else {
      throw new Error(`Cannot resolve real path: ${filePath} (${err.code})`);
    }
  }
  const isSafe = SAFE_DIRECTORIES.some((dir) => isPathWithin(realPath, dir));
  if (!isSafe) {
    throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
  }
}
function validateTempPath(filePath) {
  const resolved = path2.resolve(filePath);
  let realPath;
  try {
    realPath = fs2.realpathSync(resolved);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error("File not found");
    }
    throw new Error(`Cannot resolve path: ${filePath}`);
  }
  const isSafe = TEMP_ONLY.some((dir) => isPathWithin(realPath, dir));
  if (!isSafe) {
    throw new Error(`Path must be within: ${TEMP_ONLY.join(", ")} (remote file serving is restricted to temp directory)`);
  }
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var SAFE_DIRECTORIES, TEMP_ONLY;
var init_path_security = __esm(() => {
  init_platform();
  SAFE_DIRECTORIES = [...TEMP_DIRS, process.cwd()].map((d) => {
    try {
      return fs2.realpathSync(d);
    } catch {
      return d;
    }
  });
  TEMP_ONLY = [TEMP_DIR].map((d) => {
    try {
      return fs2.realpathSync(d);
    } catch {
      return d;
    }
  });
});

// browse/src/url-validation.ts
import { fileURLToPath, pathToFileURL } from "node:url";
import * as path3 from "node:path";
import * as os3 from "node:os";
function isBlockedIpv6(addr) {
  const normalized = addr.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":"))
    return false;
  return BLOCKED_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
function normalizeHostname(hostname) {
  let h = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (h.endsWith("."))
    h = h.slice(0, -1);
  return h;
}
function isMetadataIp(hostname) {
  try {
    const probe = new URL(`http://${hostname}`);
    const normalized = probe.hostname;
    if (BLOCKED_METADATA_HOSTS.has(normalized) || isBlockedIpv6(normalized))
      return true;
    if (normalized.endsWith(".") && BLOCKED_METADATA_HOSTS.has(normalized.slice(0, -1)))
      return true;
  } catch {}
  return false;
}
async function resolvesToBlockedIp(hostname) {
  try {
    const dns = await import("node:dns");
    const { resolve4, resolve6 } = dns.promises;
    const v4Check = resolve4(hostname).then((addresses) => addresses.some((addr) => BLOCKED_METADATA_HOSTS.has(addr)), () => false);
    const v6Check = resolve6(hostname).then((addresses) => addresses.some((addr) => {
      const normalized = addr.toLowerCase();
      return BLOCKED_METADATA_HOSTS.has(normalized) || isBlockedIpv6(normalized);
    }), () => false);
    const [v4Blocked, v6Blocked] = await Promise.all([v4Check, v6Check]);
    return v4Blocked || v6Blocked;
  } catch {
    return false;
  }
}
function normalizeFileUrl(url) {
  if (!url.toLowerCase().startsWith("file:"))
    return url;
  const qIdx = url.indexOf("?");
  const hIdx = url.indexOf("#");
  let delimIdx = -1;
  if (qIdx >= 0 && hIdx >= 0)
    delimIdx = Math.min(qIdx, hIdx);
  else if (qIdx >= 0)
    delimIdx = qIdx;
  else if (hIdx >= 0)
    delimIdx = hIdx;
  const pathPart = delimIdx >= 0 ? url.slice(0, delimIdx) : url;
  const trailing = delimIdx >= 0 ? url.slice(delimIdx) : "";
  const rest = pathPart.slice("file:".length);
  if (rest.startsWith("///")) {
    if (rest === "///" || rest === "////") {
      throw new Error("Invalid file URL: file:/// has no path. Use file:///<absolute-path>.");
    }
    return pathPart + trailing;
  }
  if (!rest.startsWith("//")) {
    throw new Error(`Invalid file URL: ${url}. Use file:///<absolute-path> or file://./<rel> or file://~/<rel>.`);
  }
  const afterDoubleSlash = rest.slice(2);
  if (afterDoubleSlash === "") {
    throw new Error("Invalid file URL: file:// is empty. Use file:///<absolute-path>.");
  }
  if (afterDoubleSlash === "." || afterDoubleSlash === "./") {
    throw new Error("Invalid file URL: file://./ would list the current directory. Use file://./<filename> to render a specific file.");
  }
  if (afterDoubleSlash === "~" || afterDoubleSlash === "~/") {
    throw new Error("Invalid file URL: file://~/ would list the home directory. Use file://~/<filename> to render a specific file.");
  }
  if (afterDoubleSlash.startsWith("~/")) {
    const rel = afterDoubleSlash.slice(2);
    const absPath = path3.join(os3.homedir(), rel);
    return pathToFileURL(absPath).href + trailing;
  }
  if (afterDoubleSlash.startsWith("./")) {
    const rel = afterDoubleSlash.slice(2);
    const absPath = path3.resolve(process.cwd(), rel);
    return pathToFileURL(absPath).href + trailing;
  }
  if (afterDoubleSlash.toLowerCase().startsWith("localhost/")) {
    return pathPart + trailing;
  }
  const firstSlash = afterDoubleSlash.indexOf("/");
  const segment = firstSlash === -1 ? afterDoubleSlash : afterDoubleSlash.slice(0, firstSlash);
  const looksLikeHost = /[.:\\%]/.test(segment) || segment.startsWith("[");
  if (looksLikeHost) {
    throw new Error(`Unsupported file URL host: ${segment}. Use file:///<absolute-path> for local files (network/UNC paths are not supported).`);
  }
  const absPath = path3.resolve(process.cwd(), afterDoubleSlash);
  return pathToFileURL(absPath).href + trailing;
}
async function validateNavigationUrl(url) {
  let normalized = url;
  if (url.toLowerCase().startsWith("file:")) {
    normalized = normalizeFileUrl(url);
  }
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol === "file:") {
    if (parsed.host !== "" && parsed.host.toLowerCase() !== "localhost") {
      throw new Error(`Unsupported file URL host: ${parsed.host}. Use file:///<absolute-path> for local files.`);
    }
    let fsPath;
    try {
      fsPath = fileURLToPath(parsed);
    } catch (e) {
      throw new Error(`Invalid file URL: ${url} (${e.message})`);
    }
    validateReadPath(fsPath);
    return pathToFileURL(fsPath).href + parsed.search + parsed.hash;
  }
  if (parsed.protocol === "about:" && parsed.href.toLowerCase() === "about:blank") {
    return "about:blank";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked: scheme "${parsed.protocol}" is not allowed. Only http:, https:, file:, and about:blank URLs are permitted.`);
  }
  const hostname = normalizeHostname(parsed.hostname.toLowerCase());
  if (BLOCKED_METADATA_HOSTS.has(hostname) || isMetadataIp(hostname) || isBlockedIpv6(hostname)) {
    throw new Error(`Blocked: ${parsed.hostname} is a cloud metadata endpoint. Access is denied for security.`);
  }
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isPrivateNet = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
  if (!isLoopback && !isPrivateNet && await resolvesToBlockedIp(hostname)) {
    throw new Error(`Blocked: ${parsed.hostname} resolves to a cloud metadata IP. Possible DNS rebinding attack.`);
  }
  return url;
}
var BLOCKED_METADATA_HOSTS, BLOCKED_IPV6_PREFIXES;
var init_url_validation = __esm(() => {
  init_path_security();
  BLOCKED_METADATA_HOSTS = new Set([
    "169.254.169.254",
    "fe80::1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::a9fe:a9fe",
    "metadata.google.internal",
    "metadata.azure.internal"
  ]);
  BLOCKED_IPV6_PREFIXES = ["fc", "fd", "fe8", "fe9", "fea", "feb"];
});

// browse/src/tab-session.ts
class TabSession {
  page;
  refMap = new Map;
  lastSnapshot = null;
  activeFrame = null;
  loadedHtml = null;
  loadedHtmlWaitUntil;
  constructor(page) {
    this.page = page;
  }
  getPage() {
    return this.page;
  }
  setRefMap(refs) {
    this.refMap = refs;
  }
  clearRefs() {
    this.refMap.clear();
  }
  async resolveRef(selector) {
    if (selector.startsWith("@e") || selector.startsWith("@c")) {
      const ref = selector.slice(1);
      const entry = this.refMap.get(ref);
      if (!entry) {
        throw new Error(`Ref ${selector} not found. Run 'snapshot' to get fresh refs.`);
      }
      const count = await entry.locator.count();
      if (count === 0) {
        throw new Error(`Ref ${selector} (${entry.role} "${entry.name}") is stale — element no longer exists. ` + `Run 'snapshot' for fresh refs.`);
      }
      return { locator: entry.locator };
    }
    return { selector };
  }
  getRefRole(selector) {
    if (selector.startsWith("@e") || selector.startsWith("@c")) {
      const entry = this.refMap.get(selector.slice(1));
      return entry?.role ?? null;
    }
    return null;
  }
  getRefCount() {
    return this.refMap.size;
  }
  getRefEntries() {
    return Array.from(this.refMap.entries()).map(([ref, entry]) => ({
      ref,
      role: entry.role,
      name: entry.name
    }));
  }
  setLastSnapshot(text) {
    this.lastSnapshot = text;
  }
  getLastSnapshot() {
    return this.lastSnapshot;
  }
  setFrame(frame) {
    this.activeFrame = frame;
  }
  getFrame() {
    return this.activeFrame;
  }
  getActiveFrameOrPage() {
    if (this.activeFrame?.isDetached()) {
      this.activeFrame = null;
      this.clearRefs();
    }
    return this.activeFrame ?? this.page;
  }
  onMainFrameNavigated() {
    this.clearRefs();
    this.activeFrame = null;
    this.loadedHtml = null;
    this.loadedHtmlWaitUntil = undefined;
  }
  async setTabContent(html, opts = {}) {
    const waitUntil = opts.waitUntil ?? "domcontentloaded";
    await this.page.setContent(html, { waitUntil, timeout: 15000 });
    this.loadedHtml = html;
    this.loadedHtmlWaitUntil = waitUntil;
  }
  getLoadedHtml() {
    if (this.loadedHtml === null)
      return null;
    return { html: this.loadedHtml, waitUntil: this.loadedHtmlWaitUntil };
  }
  clearLoadedHtml() {
    this.loadedHtml = null;
    this.loadedHtmlWaitUntil = undefined;
  }
}

// lib/error-handling.ts
import * as fs3 from "fs";
function safeUnlink(filePath) {
  try {
    fs3.unlinkSync(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT")
      throw err;
  }
}
function safeUnlinkQuiet(filePath) {
  try {
    fs3.unlinkSync(filePath);
  } catch {}
}
function safeKill(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (err) {
    if (err?.code !== "ESRCH")
      throw err;
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}
var init_error_handling = () => {};

// browse/src/error-handling.ts
var init_error_handling2 = __esm(() => {
  init_error_handling();
});

// browse/src/config.ts
import * as fs4 from "fs";
import * as os4 from "os";
import * as path4 from "path";
function getGitRoot() {
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
      windowsHide: true,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 8000
    });
    if (proc.exitCode !== 0)
      return null;
    return proc.stdout.toString().trim() || null;
  } catch {
    return null;
  }
}
function resolveConfig(env = process.env) {
  let stateFile;
  let stateDir;
  let projectDir;
  if (env.BROWSE_STATE_FILE) {
    stateFile = env.BROWSE_STATE_FILE;
    stateDir = path4.dirname(stateFile);
    projectDir = path4.dirname(stateDir);
  } else {
    projectDir = getGitRoot() || process.cwd();
    stateDir = path4.join(projectDir, ".gstack");
    stateFile = path4.join(stateDir, "browse.json");
  }
  return {
    projectDir,
    stateDir,
    stateFile,
    consoleLog: path4.join(stateDir, "browse-console.log"),
    networkLog: path4.join(stateDir, "browse-network.log"),
    dialogLog: path4.join(stateDir, "browse-dialog.log"),
    auditLog: path4.join(stateDir, "browse-audit.jsonl")
  };
}
function isIgnoredByGit(projectDir, relPath) {
  try {
    const proc = Bun.spawnSync(["git", "check-ignore", "-q", "--", relPath], {
      windowsHide: true,
      cwd: projectDir,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 2000
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
function ensureStateDir(config) {
  try {
    mkdirSecure(config.stateDir);
  } catch (err) {
    if (err.code === "EACCES") {
      throw new Error(`Cannot create state directory ${config.stateDir}: permission denied`);
    }
    if (err.code === "ENOTDIR") {
      throw new Error(`Cannot create state directory ${config.stateDir}: a file exists at that path`);
    }
    throw err;
  }
  try {
    fs4.writeFileSync(path4.join(config.stateDir, ".gitignore"), `*
`);
  } catch {}
  if (isIgnoredByGit(config.projectDir, ".gstack/"))
    return;
  const gitignorePath = path4.join(config.projectDir, ".gitignore");
  try {
    const content = fs4.readFileSync(gitignorePath, "utf-8");
    if (!content.match(/^\.gstack\/?$/m)) {
      const separator = content.endsWith(`
`) ? "" : `
`;
      fs4.appendFileSync(gitignorePath, `${separator}.gstack/
`);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      const logPath = path4.join(config.stateDir, "browse-server.log");
      try {
        fs4.appendFileSync(logPath, `[${new Date().toISOString()}] Warning: could not update .gitignore at ${gitignorePath}: ${err.message}
`);
      } catch {}
    }
  }
}
function readVersionHash(execPath = process.execPath) {
  try {
    const versionFile = path4.resolve(path4.dirname(execPath), ".version");
    return fs4.readFileSync(versionFile, "utf-8").trim() || null;
  } catch {
    return null;
  }
}
function resolveGstackHome() {
  return process.env.GSTACK_HOME || path4.join(os4.homedir(), ".gstack");
}
function readGstackConfigYamlKey(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const yaml = fs4.readFileSync(path4.join(resolveGstackHome(), "config.yaml"), "utf-8");
    const all = [...yaml.matchAll(new RegExp(`^\\s*${escaped}\\s*:\\s*['"]?([^'"#\\n]*?)['"]?\\s*(?:#.*)?$`, "gm"))];
    return all.length > 0 ? all[all.length - 1][1] : null;
  } catch {
    return null;
  }
}
function isPairAgentEnabled() {
  const env = process.env.GSTACK_PAIR_AGENT;
  if (env === "on")
    return true;
  if (env === "off")
    return false;
  const yamlValue = readGstackConfigYamlKey("pair_agent");
  if (yamlValue === "on")
    return true;
  if (yamlValue === "off")
    return false;
  try {
    const raw = fs4.readFileSync(path4.join(resolveGstackHome(), "config.json"), "utf-8");
    return JSON.parse(raw)?.pair_agent === "on";
  } catch {
    return false;
  }
}
function resolveChromiumProfile(explicit) {
  if (explicit && explicit.length > 0)
    return explicit;
  const env = process.env.CHROMIUM_PROFILE;
  if (env && env.length > 0)
    return env;
  return path4.join(resolveGstackHome(), "chromium-profile");
}
function cleanSingletonLocks(userDataDir) {
  if (!path4.isAbsolute(userDataDir)) {
    console.warn(`[browse] cleanSingletonLocks: refusing relative path: ${userDataDir}`);
    return;
  }
  const resolved = path4.resolve(userDataDir);
  const basename = path4.basename(resolved);
  const explicitProfile = process.env.CHROMIUM_PROFILE;
  const explicitAbs = explicitProfile && path4.isAbsolute(explicitProfile) ? path4.resolve(explicitProfile) : null;
  const isSafe = basename === "chromium-profile" || explicitAbs !== null && resolved === explicitAbs;
  if (!isSafe) {
    console.warn(`[browse] cleanSingletonLocks: refusing to clean unrecognized profile dir: ${resolved}`);
    return;
  }
  for (const lockFile of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    safeUnlinkQuiet(path4.join(resolved, lockFile));
  }
}
var init_config = __esm(() => {
  init_file_permissions();
  init_error_handling2();
});

// browse/src/xprotect-heal.ts
import * as fs5 from "fs";
import * as os5 from "os";
import * as path5 from "path";
import { spawn } from "child_process";
import { chromium } from "playwright";
function logHeal(action, fields = {}) {
  console.error(`[browse:xprotect-heal] ${JSON.stringify({ action, ...fields })}`);
}
function isXProtectKillSignature(message, platform = process.platform) {
  if (platform !== "darwin")
    return false;
  if (!message)
    return false;
  for (const neg of NEGATIVE_SIGNATURES) {
    if (neg.test(message))
      return false;
  }
  for (const pos of POSITIVE_SIGNATURES) {
    if (pos.test(message))
      return true;
  }
  return /timeout \d+\s*ms exceeded/i.test(message) && /<launched>/i.test(message);
}
function findPlaywrightRevisionDir(executablePath) {
  let dir = path5.dirname(executablePath);
  for (let i = 0;i < 8; i++) {
    if (REVISION_DIR_RE.test(path5.basename(dir)))
      return dir;
    const parent = path5.dirname(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
  return null;
}
function expectedChromiumRevision(executablePath) {
  const revDir = findPlaywrightRevisionDir(executablePath);
  if (!revDir)
    return null;
  const m = path5.basename(revDir).match(/-(\d+)$/);
  return m ? m[1] : null;
}
function findGstackInstallRoot(expectedRevision, candidates) {
  const roots = candidates ?? [
    path5.resolve(__dirname, "..", ".."),
    path5.join(os5.homedir(), ".claude", "skills", "gstack")
  ];
  for (const root of roots) {
    if (!path5.isAbsolute(root))
      continue;
    try {
      const browsersJson = path5.join(root, "node_modules", "playwright-core", "browsers.json");
      if (!fs5.existsSync(browsersJson))
        continue;
      const parsed = JSON.parse(fs5.readFileSync(browsersJson, "utf-8"));
      const rev = parsed?.browsers?.find((b) => b?.name === "chromium")?.revision;
      if (String(rev) === String(expectedRevision))
        return root;
    } catch {
      continue;
    }
  }
  return null;
}
function defaultRunXattr(target) {
  const res = Bun.spawnSync(["xattr", "-dr", "com.apple.quarantine", target], {
    windowsHide: true,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 1e4
  });
  return res.exitCode;
}
function clearQuarantineOnPlaywrightCache(executablePath, runXattr = defaultRunXattr) {
  const customPath = process.env.GSTACK_CHROMIUM_PATH;
  if (customPath && path5.resolve(executablePath) === path5.resolve(customPath)) {
    logHeal("quarantine-clear-skipped", { reason: "custom-chromium-path" });
    return false;
  }
  const revDir = findPlaywrightRevisionDir(executablePath);
  if (!revDir) {
    logHeal("quarantine-clear-skipped", { reason: "not-in-playwright-cache", executablePath });
    return false;
  }
  const cacheRoot = path5.dirname(revDir);
  let cleared = 0;
  let entries;
  try {
    entries = fs5.readdirSync(cacheRoot);
  } catch (err) {
    logHeal("quarantine-clear-skipped", {
      reason: "cache-unreadable",
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
  for (const entry of entries) {
    if (!REVISION_DIR_RE.test(entry))
      continue;
    const target = path5.join(cacheRoot, entry);
    try {
      const exitCode = runXattr(target);
      logHeal("quarantine-clear", { target, exitCode });
      cleared++;
    } catch (err) {
      logHeal("quarantine-clear", {
        target,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return cleared > 0;
}
function runBoundedChromiumReinstall(installRoot, timeoutMs = XPROTECT_REINSTALL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    try {
      child = spawn("bunx", ["playwright", "install", "--force", "chromium"], {
        cwd: installRoot,
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });
    } catch (err) {
      resolve({ ok: false, reason: `spawn-error: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    let stderrTail = "";
    child.stderr?.on("data", (d) => {
      stderrTail = (stderrTail + String(d)).slice(-2000);
    });
    const timer = setTimeout(() => {
      if (settled)
        return;
      settled = true;
      try {
        if (child.pid)
          process.kill(-child.pid, "SIGKILL");
      } catch (err) {
        if (err?.code !== "ESRCH") {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }
      resolve({ ok: false, reason: "timeout" });
    }, timeoutMs);
    child.on("error", (err) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: `spawn-error: ${err.message}` });
    });
    child.on("exit", (code) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, exitCode: code });
      } else {
        resolve({
          ok: false,
          reason: `install-exit-${code}${stderrTail ? `: ${stderrTail.slice(-300)}` : ""}`,
          exitCode: code
        });
      }
    });
  });
}
async function maybeHealXProtectKill(err, opts = {}, deps = {}) {
  const message = err instanceof Error ? err.message : String(err);
  if (!isXProtectKillSignature(message, deps.platform ?? process.platform))
    return false;
  if (opts.usesCustomExecutable) {
    logHeal("skip", { reason: "custom-executable" });
    return false;
  }
  if (healAttempted) {
    logHeal("skip", { reason: "already-attempted-this-process" });
    return false;
  }
  healAttempted = true;
  logHeal("classified", { signature: "xprotect-kill" });
  const execPath = (deps.executablePath ?? (() => chromium.executablePath()))();
  (deps.clearQuarantine ?? clearQuarantineOnPlaywrightCache)(execPath);
  const revision = expectedChromiumRevision(execPath);
  if (!revision) {
    logHeal("reinstall-skipped", { reason: "no-revision-in-path", execPath });
    return false;
  }
  const root = (deps.installRoot ?? findGstackInstallRoot)(revision);
  if (!root) {
    logHeal("reinstall-skipped", { reason: "no-install-root", revision });
    return false;
  }
  logHeal("reinstall-start", { installRoot: root, revision, timeoutMs: XPROTECT_REINSTALL_TIMEOUT_MS });
  const result = await (deps.runReinstall ?? runBoundedChromiumReinstall)(root);
  if (!result.ok) {
    logHeal("reinstall-failed", { reason: result.reason });
    return false;
  }
  const verify = deps.verifyInstalled ?? ((p) => fs5.existsSync(p));
  if (!verify(execPath)) {
    logHeal("verify-failed", { expected: execPath });
    return false;
  }
  logHeal("reinstall-ok", { installRoot: root, revision });
  return true;
}
function buildXProtectGuidance(originalMessage) {
  return `${originalMessage}
` + "[browse] This launch failure matches the macOS XProtect kill signature (#2554): " + "the OS killed Playwright's Chromium at spawn. Automatic self-heal did not complete. " + "Fix manually: run `bunx playwright install chromium` from your gstack install " + "(the directory whose node_modules pins playwright — ~/.claude/skills/gstack for " + "global installs), then retry.";
}
async function launchWithXProtectHeal(doLaunch, opts = {}, deps = {}) {
  try {
    return await doLaunch();
  } catch (err) {
    const healed = await maybeHealXProtectKill(err, opts, deps);
    if (healed) {
      logHeal("retry-launch", {});
      try {
        return await doLaunch();
      } catch (retryErr) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (isXProtectKillSignature(retryMessage, deps.platform ?? process.platform)) {
          throw new Error(buildXProtectGuidance(retryMessage), { cause: retryErr });
        }
        throw retryErr;
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    if (isXProtectKillSignature(message, deps.platform ?? process.platform)) {
      throw new Error(buildXProtectGuidance(message), { cause: err });
    }
    throw err;
  }
}
var __dirname = "/private/tmp/gstack-install/browse/src", NEGATIVE_SIGNATURES, POSITIVE_SIGNATURES, REVISION_DIR_RE, XPROTECT_REINSTALL_TIMEOUT_MS = 120000, healAttempted = false;
var init_xprotect_heal = __esm(() => {
  NEGATIVE_SIGNATURES = [
    /executable doesn't exist/i,
    /spawn\s+\S+\s+(EACCES|EPERM|ENOENT)/i,
    /\b(EACCES|EPERM)\b/,
    /no usable sandbox/i,
    /failed to move to new namespace/i,
    /suid sandbox helper/i
  ];
  POSITIVE_SIGNATURES = [
    /<process did exit:[^>]*signal=SIGKILL/i,
    /signal[:=]\s*['"]?SIGKILL/i
  ];
  REVISION_DIR_RE = /^chromium(?:_headless_shell)?-\d+$/;
});

// browse/src/xvfb.ts
import * as fs6 from "fs";
function shouldSpawnXvfb(env, platform) {
  if (env.BROWSE_HEADED !== "1")
    return { spawn: false, reason: "not headed mode" };
  if (platform !== "linux")
    return { spawn: false, reason: `platform ${platform} uses native windowing` };
  if (env.DISPLAY)
    return { spawn: false, reason: `DISPLAY=${env.DISPLAY} already set` };
  if (env.WAYLAND_DISPLAY)
    return { spawn: false, reason: `WAYLAND_DISPLAY=${env.WAYLAND_DISPLAY} set; Chromium uses Wayland natively` };
  return { spawn: true, reason: "linux headed without DISPLAY/WAYLAND_DISPLAY" };
}
function isDisplayFree(displayNum) {
  try {
    const result = Bun.spawnSync(["xdpyinfo", "-display", `:${displayNum}`], {
      windowsHide: true,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 2000
    });
    return result.exitCode !== 0;
  } catch {
    return !fs6.existsSync(`/tmp/.X11-unix/X${displayNum}`) && !fs6.existsSync(`/tmp/.X${displayNum}-lock`);
  }
}
function pickFreeDisplay(rangeStart = DISPLAY_RANGE_START, rangeEnd = DISPLAY_RANGE_END) {
  for (let n = rangeStart;n <= rangeEnd; n++) {
    if (isDisplayFree(n))
      return n;
  }
  return null;
}
function readPidStartTime(pid) {
  if (!isProcessAlive(pid))
    return "";
  try {
    const result = Bun.spawnSync(["ps", "-p", String(pid), "-o", "lstart="], {
      windowsHide: true,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 2000
    });
    if (result.exitCode !== 0)
      return "";
    return result.stdout.toString().trim();
  } catch {
    return "";
  }
}
function readPidArgv0(pid) {
  try {
    const raw = fs6.readFileSync(`/proc/${pid}/cmdline`, "utf-8");
    return raw.split("\x00", 1)[0] ?? "";
  } catch {
    return "";
  }
}
function isOurXvfb(pid, recordedStartTime) {
  if (!pid || !recordedStartTime)
    return false;
  const argv0 = readPidArgv0(pid);
  if (!argv0)
    return false;
  const base = argv0.split("/").pop() ?? "";
  if (base.toLowerCase() !== "xvfb")
    return false;
  const currentStart = readPidStartTime(pid);
  if (!currentStart)
    return false;
  return currentStart === recordedStartTime;
}
async function spawnXvfb(displayNum) {
  const display = `:${displayNum}`;
  const proc = Bun.spawn(["Xvfb", display, "-screen", "0", "1920x1080x24", "-ac"], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore"]
  });
  proc.unref();
  const deadline = Date.now() + 3000;
  let ready = false;
  while (Date.now() < deadline) {
    await Bun.sleep(100);
    if (!isDisplayFree(displayNum)) {
      ready = true;
      break;
    }
    if (proc.exitCode != null) {
      throw new Error(`Xvfb on ${display} exited during startup (code ${proc.exitCode}). Hint: install xvfb (apt-get install xvfb / yum install xorg-x11-server-Xvfb).`);
    }
  }
  if (!ready) {
    try {
      proc.kill("SIGKILL");
    } catch {}
    throw new Error(`Xvfb on ${display} never became reachable within 3s timeout`);
  }
  const startTime = readPidStartTime(proc.pid);
  return {
    pid: proc.pid,
    startTime,
    display,
    close: () => cleanupXvfb({ pid: proc.pid, startTime, display })
  };
}
function cleanupXvfb(state) {
  if (!state.pid)
    return;
  if (!isOurXvfb(state.pid, state.startTime))
    return;
  try {
    safeKill(state.pid, "SIGTERM");
  } catch {}
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(state.pid))
      break;
  }
  if (isProcessAlive(state.pid)) {
    try {
      safeKill(state.pid, "SIGKILL");
    } catch {}
  }
}
function xvfbInstallHint() {
  return "Xvfb not installed. apt-get install xvfb (Debian/Ubuntu) or yum install xorg-x11-server-Xvfb (RHEL/CentOS). Note: minimal containers (alpine, distroless) may also need fonts, dbus, gtk libs for headed Chromium to render.";
}
var DISPLAY_RANGE_START = 99, DISPLAY_RANGE_END = 120;
var init_xvfb = __esm(() => {
  init_error_handling2();
});

// browse/src/cdp-allowlist.ts
function lookupCdpMethod(qualifiedName) {
  return CDP_ALLOWLIST_INDEX.get(qualifiedName) ?? null;
}
var CDP_ALLOWLIST, CDP_ALLOWLIST_INDEX;
var init_cdp_allowlist = __esm(() => {
  CDP_ALLOWLIST = Object.freeze([
    {
      domain: "Accessibility",
      method: "getFullAXTree",
      scope: "tab",
      output: "untrusted",
      justification: "Read-only AX tree extraction. Output is third-party page content; wrap in UNTRUSTED."
    },
    {
      domain: "Accessibility",
      method: "getPartialAXTree",
      scope: "tab",
      output: "untrusted",
      justification: "Read-only AX tree subtree by node. Output is third-party page content."
    },
    {
      domain: "Accessibility",
      method: "getRootAXNode",
      scope: "tab",
      output: "untrusted",
      justification: "Read-only root AX node accessor."
    },
    {
      domain: "DOM",
      method: "describeNode",
      scope: "tab",
      output: "untrusted",
      justification: "Inspect a DOM node by backend ID; pure read."
    },
    {
      domain: "DOM",
      method: "getBoxModel",
      scope: "tab",
      output: "trusted",
      justification: "Pure geometric data (box dimensions). No page content leaks; safe trusted."
    },
    {
      domain: "DOM",
      method: "getNodeForLocation",
      scope: "tab",
      output: "trusted",
      justification: "Pure coordinate→nodeId mapping; no content leak."
    },
    {
      domain: "CSS",
      method: "getMatchedStylesForNode",
      scope: "tab",
      output: "untrusted",
      justification: "Read computed cascade for a node; output may contain attacker-controlled selectors."
    },
    {
      domain: "CSS",
      method: "getComputedStyleForNode",
      scope: "tab",
      output: "trusted",
      justification: "Computed style values are bounded (CSS keywords/numbers); safe trusted."
    },
    {
      domain: "CSS",
      method: "getInlineStylesForNode",
      scope: "tab",
      output: "untrusted",
      justification: "Inline style content may contain attacker-controlled custom-property values."
    },
    {
      domain: "Performance",
      method: "getMetrics",
      scope: "tab",
      output: "trusted",
      justification: "Pure numeric metrics (timing, layout count); safe."
    },
    {
      domain: "Performance",
      method: "enable",
      scope: "tab",
      output: "trusted",
      justification: "Domain enable; no content; required prerequisite for getMetrics."
    },
    {
      domain: "Performance",
      method: "disable",
      scope: "tab",
      output: "trusted",
      justification: "Domain disable; no content."
    },
    {
      domain: "Tracing",
      method: "start",
      scope: "browser",
      output: "trusted",
      justification: "Trace category capture. Browser-scoped to serialize against other CDP ops."
    },
    {
      domain: "Tracing",
      method: "end",
      scope: "browser",
      output: "untrusted",
      justification: "Trace dump may contain URLs and page data; wrap."
    },
    {
      domain: "Emulation",
      method: "setDeviceMetricsOverride",
      scope: "tab",
      output: "trusted",
      justification: "Viewport/scale override on the active tab."
    },
    {
      domain: "Emulation",
      method: "clearDeviceMetricsOverride",
      scope: "tab",
      output: "trusted",
      justification: "Clear viewport override."
    },
    {
      domain: "Emulation",
      method: "setUserAgentOverride",
      scope: "tab",
      output: "trusted",
      justification: "UA override on the active tab. NOTE: changes affect future requests; fine for tests."
    },
    {
      domain: "Emulation",
      method: "setEmulatedMedia",
      scope: "tab",
      output: "trusted",
      justification: "Media type/feature override (prefers-color-scheme, prefers-reduced-motion, prefers-contrast, forced-colors) so a11y and dark-mode CSS branches are testable. Returns an empty result; no page content. NOTE: like setUserAgentOverride the override persists on the tab until cleared with an empty features array."
    },
    {
      domain: "Emulation",
      method: "setCPUThrottlingRate",
      scope: "tab",
      output: "trusted",
      justification: "CPU slowdown multiplier on the active tab, for measuring performance on a realistic low-end client instead of the developer workstation. Same domain and mutating character as setDeviceMetricsOverride; affects only timing, reads nothing, exfiltrates nothing. NOTE: like setEmulatedMedia the override persists on the tab until cleared (rate: 1) — callers own restoration."
    },
    {
      domain: "Network",
      method: "emulateNetworkConditions",
      scope: "tab",
      output: "trusted",
      justification: "Bandwidth/latency emulation on the active tab, for measuring page behaviour on a slow connection. Constrains traffic rather than reading it — no request bodies, headers or cookies are exposed. NOTE: like setEmulatedMedia the override persists on the tab until cleared (offline: false plus default throughput/latency) — callers own restoration."
    },
    {
      domain: "Page",
      method: "captureScreenshot",
      scope: "tab",
      output: "untrusted",
      justification: "Screenshot bytes; output is bounded image data (no marker injection vector)."
    },
    {
      domain: "Page",
      method: "printToPDF",
      scope: "tab",
      output: "untrusted",
      justification: "PDF bytes; bounded binary output."
    },
    {
      domain: "Network",
      method: "enable",
      scope: "tab",
      output: "trusted",
      justification: "Domain enable; required prerequisite. Does not return data."
    },
    {
      domain: "Network",
      method: "disable",
      scope: "tab",
      output: "trusted",
      justification: "Domain disable; mirrors Network.enable for cleanup symmetry."
    },
    {
      domain: "Runtime",
      method: "getProperties",
      scope: "tab",
      output: "untrusted",
      justification: "Inspect properties of an existing remote object. Read-only; output may contain page data."
    }
  ]);
  CDP_ALLOWLIST_INDEX = new Map(CDP_ALLOWLIST.map((e) => [`${e.domain}.${e.method}`, e]));
});

// browse/src/telemetry.ts
import { promises as fs7 } from "fs";
import * as path6 from "path";
import * as os6 from "os";
function gstackHome() {
  return process.env.GSTACK_HOME || path6.join(os6.homedir(), ".gstack");
}
function analyticsDir() {
  return path6.join(gstackHome(), "analytics");
}
function telemetryFile() {
  return path6.join(analyticsDir(), "browse-telemetry.jsonl");
}
async function ensureDir() {
  const dir = analyticsDir();
  if (lastEnsuredDir === dir)
    return;
  await fs7.mkdir(dir, { recursive: true });
  lastEnsuredDir = dir;
}
function isTelemetryDisabled() {
  if (telemetryDisabled !== null)
    return telemetryDisabled;
  if (process.env.GSTACK_TELEMETRY_OFF === "1") {
    telemetryDisabled = true;
    return true;
  }
  const tier = readGstackConfigYamlKey("telemetry");
  if (tier === "off") {
    telemetryDisabled = true;
    return true;
  }
  if (tier === "community" || tier === "anonymous") {
    telemetryDisabled = false;
    return false;
  }
  telemetryDisabled = process.env.GSTACK_TELEMETRY_OFF !== "0";
  return telemetryDisabled;
}
function logTelemetry(payload) {
  if (isTelemetryDisabled())
    return;
  const enriched = { ...payload, ts: new Date().toISOString() };
  ensureDir().then(() => fs7.appendFile(telemetryFile(), JSON.stringify(enriched) + `
`, "utf8")).catch(() => {});
}
var lastEnsuredDir = null, telemetryDisabled = null;
var init_telemetry = __esm(() => {
  init_config();
});

// browse/src/cdp-bridge.ts
async function withCdpSession(page, fn) {
  const session = await page.context().newCDPSession(page);
  try {
    return await fn(session);
  } finally {
    try {
      await session.detach();
    } catch {}
  }
}
async function getOrCreateCdpSession(page, cache) {
  let session = cache.get(page);
  if (session)
    return session;
  session = await page.context().newCDPSession(page);
  cache.set(page, session);
  page.once("close", () => {
    cache.delete(page);
    session.detach().catch(() => {});
  });
  return session;
}
async function getCdpSession(page) {
  return getOrCreateCdpSession(page, sessionCache);
}
async function dispatchCdpCall(input) {
  const qualified = `${input.domain}.${input.method}`;
  const entry = lookupCdpMethod(qualified);
  if (!entry) {
    logTelemetry({ event: "cdp_method_denied", domain: input.domain, method: input.method });
    throw new Error(`DENIED: ${qualified} is not on the CDP allowlist.
` + `Cause: deny-default posture; method has not been audited and added to cdp-allowlist.ts.
` + `Action: if this method is genuinely needed, open a PR adding it to CDP_ALLOWLIST with a one-line justification + scope (tab|browser) + output (trusted|untrusted).`);
  }
  const acquireStart = Date.now();
  const release = entry.scope === "browser" ? await input.bm.acquireGlobalCdpLock(CDP_ACQUIRE_TIMEOUT_MS) : await input.bm.acquireTabLock(input.tabId, CDP_ACQUIRE_TIMEOUT_MS);
  const acquireMs = Date.now() - acquireStart;
  logTelemetry({ event: "cdp_method_lock_acquire_ms", domain: input.domain, method: input.method, ms: acquireMs });
  logTelemetry({ event: "cdp_method_called", domain: input.domain, method: input.method, allowed: true, scope: entry.scope });
  try {
    const page = input.bm.getPageForTab(input.tabId);
    if (!page) {
      throw new Error(`Cannot dispatch: tab ${input.tabId} not found.
` + `Cause: tab was closed between command queue and dispatch.
` + "Action: $B tabs to list current tabs.");
    }
    let session;
    try {
      session = await getCdpSession(page);
    } catch (e) {
      throw new Error(`CDPSessionInvalidated: ${e.message}
` + `Cause: Playwright context was recreated (e.g., viewport scale change) and the prior CDP session is stale.
` + "Action: retry the command; the bridge will create a fresh session.");
    }
    const callPromise = session.send(qualified, input.params);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`CDPBridgeTimeout: ${qualified} did not return within ${CDP_TIMEOUT_MS}ms`)), CDP_TIMEOUT_MS));
    const raw = await Promise.race([callPromise, timeoutPromise]);
    return { raw, entry };
  } finally {
    release();
  }
}
var CDP_TIMEOUT_MS = 5000, CDP_ACQUIRE_TIMEOUT_MS = 5000, sessionCache;
var init_cdp_bridge = __esm(() => {
  init_cdp_allowlist();
  init_telemetry();
  sessionCache = new WeakMap;
});

// browse/src/stealth.ts
function readHostProfile() {
  const env = globalThis.process?.env ?? {};
  const concurrency = Number(env.GSTACK_HW_CONCURRENCY);
  const memory = Number(env.GSTACK_DEVICE_MEMORY);
  return {
    hwConcurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 8,
    deviceMemory: Number.isFinite(memory) && memory > 0 ? memory : 8
  };
}
function buildStealthScript(hw) {
  return `(() => {
  // ──── Function.prototype.toString Proxy (must run first) ────
  // Make every patched getter / function below report
  // 'function NAME() { [native code] }' at every recursion depth.
  // Defeats fn.toString.toString.toString() integrity checks.
  const patchedFns = new WeakSet();
  const nativeToString = Function.prototype.toString;
  const toStringProxy = new Proxy(nativeToString, {
    apply(target, thisArg, args) {
      if (patchedFns.has(thisArg)) {
        const name = (thisArg && thisArg.name) || '';
        return 'function ' + name + '() { [native code] }';
      }
      return Reflect.apply(target, thisArg, args);
    },
  });
  Object.defineProperty(Function.prototype, 'toString', {
    value: toStringProxy, writable: true, configurable: true,
  });
  const markNative = (fn, name) => {
    if (name) {
      try { Object.defineProperty(fn, 'name', { value: name }); } catch {}
    }
    patchedFns.add(fn);
    return fn;
  };

  // ──── navigator.webdriver (canonical mask, kept from D7) ────
  try {
    const webdriverGetter = markNative(function() { return false; }, 'get webdriver');
    Object.defineProperty(navigator, 'webdriver', { get: webdriverGetter, configurable: true });
  } catch {}

  // ──── window.chrome.* restoration ────
  // Real Chrome ships these objects with rich enum / method shape.
  // Headless Chromium / Playwright's launch strips them. Their absence
  // is a universally-checked tell (verified in Cloudflare + DataDome
  // RE catalogs). We don't try to perfectly mimic — we ship plausible
  // shape with native-code-looking methods.
  try {
    if (!('chrome' in window)) {
      window.chrome = {};
    }
    const chrome = window.chrome;
    if (!chrome.runtime) {
      chrome.runtime = {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install',
                            SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64',
                       X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64',
                           X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux',
                     MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled',
                                   UPDATE_AVAILABLE: 'update_available' },
        connect: markNative(function connect() {
          throw new TypeError('Error in invocation of runtime.connect: No matching signature.');
        }, 'connect'),
        sendMessage: markNative(function sendMessage() {
          throw new TypeError('Error in invocation of runtime.sendMessage: No matching signature.');
        }, 'sendMessage'),
        id: undefined,
      };
    }
    if (!chrome.app) {
      chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      };
    }
    if (typeof chrome.csi !== 'function') {
      chrome.csi = markNative(function csi() {
        return {
          onloadT: Date.now(),
          pageT: performance.now(),
          startE: Date.now() - 1000,
          tran: 15,
        };
      }, 'csi');
    }
    if (typeof chrome.loadTimes !== 'function') {
      chrome.loadTimes = markNative(function loadTimes() {
        const t = performance.timing;
        return {
          requestTime: t.requestStart / 1000,
          startLoadTime: t.requestStart / 1000,
          commitLoadTime: t.responseStart / 1000,
          finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
          finishLoadTime: t.loadEventEnd / 1000,
          firstPaintTime: t.responseEnd / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2',
        };
      }, 'loadTimes');
    }
  } catch (err) {
    // Non-fatal — page might have a stricter Content Security Policy
    // that blocks property mutation on window. Leave chrome.* whatever
    // shape it was; navigator.webdriver mask still applies.
  }

  // ──── Notification.permission align with Permissions API ────
  // The inline addInitScript already overrides permissions.query for
  // notifications → 'prompt'. Notification.permission must match
  // ('default' in real Chrome on pages that haven't asked yet).
  try {
    if (typeof Notification !== 'undefined') {
      const notificationPermissionGetter = markNative(function() { return 'default'; }, 'get permission');
      Object.defineProperty(Notification, 'permission', {
        get: notificationPermissionGetter,
        configurable: true,
      });
    }
  } catch {}

  // ──── Per-install hardware values from GSTACK_* env (T2) ────
  // gbd's host_profile.go fed real host values via cmdline env. Reporting
  // those (not hardcoded defaults) avoids the cross-user GBrowser
  // fingerprint cluster.
  try {
    const hwConcurrencyGetter = markNative(function() { return ${hw.hwConcurrency}; }, 'get hardwareConcurrency');
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: hwConcurrencyGetter,
      configurable: true,
    });
  } catch {}
  try {
    const deviceMemoryGetter = markNative(function() { return ${hw.deviceMemory}; }, 'get deviceMemory');
    Object.defineProperty(navigator, 'deviceMemory', {
      get: deviceMemoryGetter,
      configurable: true,
    });
  } catch {}

  // ──── Selenium / Phantom / Nightmare / Playwright global cleanup ────
  // Static known-name list of Selenium / Playwright / PhantomJS / Nightmare
  // globals. AUTOMATION_ARTIFACT_CLEANUP_SCRIPT (applied right after this on
  // every path) covers the cdc_/__webdriver dynamic prefixes; this list is the
  // fixed-name complement.
  try {
    const auto = [
      '__driver_evaluate', '__webdriver_evaluate', '__selenium_evaluate', '__fxdriver_evaluate',
      '__driver_unwrapped', '__webdriver_unwrapped', '__selenium_unwrapped', '__fxdriver_unwrapped',
      '_Selenium_IDE_Recorder', '_selenium', 'calledSelenium',
      '$chrome_asyncScriptInfo',
      '__$webdriverAsyncExecutor', '__webdriverFunc',
      'domAutomation', 'domAutomationController',
      '__lastWatirAlert', '__lastWatirConfirm', '__lastWatirPrompt',
      '__webdriver_script_fn', '_WEBDRIVER_ELEM_CACHE',
      'callPhantom', '_phantom', 'phantom', '__nightmare',
      '__pwInitScripts', '__playwright__binding__',
    ];
    for (const k of auto) {
      try { delete window[k]; } catch {}
    }
    try { delete document.__webdriver_script_fn; } catch {}
  } catch {}
})();`;
}
function extendedModeEnabled() {
  const v = process.env.GSTACK_STEALTH;
  return v === "extended" || v === "1" || v === "true";
}
async function applyStealth(context) {
  const hw = readHostProfile();
  await context.addInitScript({ content: buildStealthScript(hw) });
  await context.addInitScript({ content: AUTOMATION_ARTIFACT_CLEANUP_SCRIPT });
  if (extendedModeEnabled()) {
    await context.addInitScript({ content: EXTENDED_STEALTH_SCRIPT });
  }
}
function buildGStackLaunchArgs() {
  const env = globalThis.process?.env ?? {};
  const args = [];
  const vendor = env.GSTACK_GPU_VENDOR;
  if (vendor)
    args.push(`--gstack-gpu-vendor=${vendor}`);
  const renderer = env.GSTACK_GPU_RENDERER;
  if (renderer)
    args.push(`--gstack-gpu-renderer=${renderer}`);
  const platform = env.GSTACK_PLATFORM;
  if (platform === "MacARM" || platform === "MacIntel") {
    args.push("--gstack-ua-platform=macOS");
  } else if (platform === "Win32") {
    args.push("--gstack-ua-platform=Windows");
  } else if (platform && platform.startsWith("Linux")) {
    args.push("--gstack-ua-platform=Linux");
  }
  const chipset = env.GSTACK_GPU_CHIPSET;
  if (chipset)
    args.push(`--gstack-ua-model=${chipset}`);
  const hw = env.GSTACK_HW_CONCURRENCY;
  if (hw)
    args.push(`--gstack-hw-concurrency=${hw}`);
  const memory = env.GSTACK_DEVICE_MEMORY;
  if (memory)
    args.push(`--gstack-device-memory=${memory}`);
  const cdpStealth = env.GSTACK_CDP_STEALTH;
  if (cdpStealth === "on" || cdpStealth === "1" || cdpStealth === "true") {
    args.push("--gstack-suppress-prepare-stack-trace");
  }
  return args;
}
var EXTENDED_STEALTH_SCRIPT = `
(() => {
  try {
    // 1. Fully delete navigator.webdriver from the prototype so
    //    \`"webdriver" in navigator\` returns false (not just falsy).
    delete Object.getPrototypeOf(navigator).webdriver;
  } catch {}

  try {
    // 2. WebGL renderer spoof — SwiftShader is the canonical software-GPU
    //    tell. Spoof to a plausible Apple M1 Pro string.
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      // UNMASKED_VENDOR_WEBGL (37445) → 'Apple Inc.'
      if (parameter === 37445) return 'Apple Inc.';
      // UNMASKED_RENDERER_WEBGL (37446) → realistic Apple silicon string
      if (parameter === 37446) return 'Apple M1 Pro, OpenGL 4.1';
      return getParameter.call(this, parameter);
    };
  } catch {}

  try {
    // 3. navigator.plugins: real PluginArray with MimeType objects.
    const makePlugin = (name, filename, desc, mimes) => {
      const p = Object.create(Plugin.prototype);
      Object.defineProperties(p, {
        name: { get: () => name },
        filename: { get: () => filename },
        description: { get: () => desc },
        length: { get: () => mimes.length },
      });
      mimes.forEach((m, i) => { p[i] = m; });
      p.item = (i) => mimes[i];
      p.namedItem = (n) => mimes.find((m) => m.type === n);
      return p;
    };
    const makeMime = (type, suffixes, desc) => {
      const m = Object.create(MimeType.prototype);
      Object.defineProperties(m, {
        type: { get: () => type },
        suffixes: { get: () => suffixes },
        description: { get: () => desc },
      });
      return m;
    };
    const pdfMime = makeMime('application/pdf', 'pdf', '');
    const cpdfMime = makeMime('application/x-google-chrome-pdf', 'pdf', 'Portable Document Format');
    const plugins = [
      makePlugin('PDF Viewer', 'internal-pdf-viewer', '', [pdfMime]),
      makePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', '', [cpdfMime]),
      makePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', '', [cpdfMime]),
    ];
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = Object.create(PluginArray.prototype);
        Object.defineProperty(arr, 'length', { get: () => plugins.length });
        plugins.forEach((p, i) => { arr[i] = p; });
        arr.item = (i) => plugins[i];
        arr.namedItem = (n) => plugins.find((p) => p.name === n);
        arr.refresh = () => {};
        return arr;
      },
    });
  } catch {}

  try {
    // 4. window.chrome shape — chrome.app + chrome.runtime + loadTimes/csi.
    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = { OnInstalledReason: {}, OnRestartRequiredReason: {} };
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function () {
        return { commitLoadTime: Date.now() / 1000, finishLoadTime: Date.now() / 1000 };
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function () {
        return { startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 };
      };
    }
  } catch {}

  try {
    // 5. mediaDevices — some headless builds drop it entirely.
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        get: () => ({ enumerateDevices: () => Promise.resolve([]) }),
      });
    }
  } catch {}

  try {
    // 6. CDP cdc_* property cleanup. Chromium under CDP sets cdc_*-prefixed
    //    globals (driver injection markers); a bot detector finds them by
    //    iterating window keys. Strip all matching keys.
    //    Note: via applyStealth this is redundant with AUTOMATION_ARTIFACT_
    //    CLEANUP_SCRIPT (which runs first on every path). Kept so this script
    //    is self-sufficient if ever applied standalone.
    for (const k of Object.keys(window)) {
      if (k.startsWith('cdc_')) {
        try { delete window[k]; } catch {}
      }
    }
  } catch {}
})();
`, AUTOMATION_ARTIFACT_CLEANUP_SCRIPT = `(() => {
  // cdc_/__webdriver globals are injected by ChromeDriver/CDP. A detector
  // finds them by iterating window keys. Strip immediately and again after a
  // tick in case they are injected late.
  const cleanup = () => {
    for (const key of Object.keys(window)) {
      if (key.startsWith('cdc_') || key.startsWith('__webdriver')) {
        try { delete window[key]; } catch (e) { if (!(e instanceof TypeError)) throw e; }
      }
    }
  };
  cleanup();
  setTimeout(cleanup, 0);

  // Permissions API: automated Chromium returns 'denied' for notifications,
  // a known tell. Return 'prompt' to match real Chrome (and Layer C's
  // Notification.permission = 'default'). Tradeoff: this pins the
  // notifications state to fresh-Chrome values for the whole session, so a
  // site that actually grants/denies notifications would see a stale value.
  // Acceptable for the automation/anti-detection use case (which does not
  // drive real notification grants); only notifications is overridden.
  const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (originalQuery) {
    window.navigator.permissions.query = (params) => {
      if (params && params.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return originalQuery.call(window.navigator.permissions, params);
    };
  }
})();`, STEALTH_LAUNCH_ARGS, STEALTH_IGNORE_DEFAULT_ARGS;
var init_stealth = __esm(() => {
  STEALTH_LAUNCH_ARGS = [
    "--disable-blink-features=AutomationControlled"
  ];
  STEALTH_IGNORE_DEFAULT_ARGS = [
    "--enable-automation",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-popup-blocking",
    "--disable-component-update",
    "--disable-default-apps"
  ];
});

// browse/src/browser-manager.ts
import { chromium as chromium2 } from "playwright";
function headlessGpuArgs(platform, env) {
  if (platform !== "darwin")
    return [];
  if ((env.GSTACK_DISABLE_GPU || "").toLowerCase() === "off")
    return [];
  return [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-gpu-compositing",
    "--disable-gpu-watchdog"
  ];
}
function isCustomChromium() {
  if (process.env.GSTACK_CHROMIUM_KIND === "custom-extension-baked")
    return true;
  const p = process.env.GSTACK_CHROMIUM_PATH || "";
  return p.includes("GBrowser") || p.includes("gbrowser");
}
function shouldEnableChromiumSandbox() {
  if (process.platform === "win32")
    return false;
  if (process.env.GSTACK_CHROMIUM_NO_SANDBOX === "1")
    return false;
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  return !(process.env.CI || process.env.CONTAINER || isRoot);
}
function probePoisonedChromiumBundle(chromiumExecutablePath) {
  const fs = __require("fs");
  const path = __require("path");
  const customPath = process.env.GSTACK_CHROMIUM_PATH;
  if (customPath && path.resolve(chromiumExecutablePath) === path.resolve(customPath)) {
    return;
  }
  const chromeContentsDir = path.resolve(path.dirname(chromiumExecutablePath), "..");
  const chromePlist = path.join(chromeContentsDir, "Info.plist");
  if (!fs.existsSync(chromePlist))
    return;
  if (!fs.readFileSync(chromePlist, "utf-8").includes("GStack Browser"))
    return;
  const appDir = path.resolve(chromeContentsDir, "..");
  const revisionDir = path.resolve(appDir, "..", "..");
  if (/^chromium-\d+$/.test(path.basename(revisionDir))) {
    fs.rmSync(revisionDir, { recursive: true, force: true });
  } else {
    fs.rmSync(appDir, { recursive: true, force: true });
    for (const marker of ["INSTALLATION_COMPLETE", "DEPENDENCIES_VALIDATED"]) {
      fs.rmSync(path.join(path.dirname(appDir), marker), { force: true });
    }
  }
  throw new PoisonedBundleError("Chromium bundle was mutated by a previous gstack version (broken codesign seal — " + "GPU exit_code=5 on macOS 26). The poisoned bundle has been removed. " + "Re-fetch a clean one with: bunx playwright install chromium — then retry.");
}
async function resolveDisconnectCause(browser) {
  const proc = typeof browser?.process === "function" ? browser.process() : null;
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return proc?.exitCode === 0 && proc?.signalCode == null ? "clean" : "crash";
}
function markDaemonProcess() {
  daemonProcess = true;
}
async function handleChromiumDisconnect(browser) {
  const cause = await resolveDisconnectCause(browser);
  if (!daemonProcess) {
    console.error(`[browse] Chromium disconnected (${cause}) in an embedded context — host process continues.`);
    return;
  }
  if (cause === "clean") {
    console.error("[browse] Chromium closed cleanly (user-initiated quit). Server exiting (0).");
    process.exit(0);
  }
  console.error("[browse] FATAL: Chromium process crashed or was killed. Server exiting (1).");
  console.error("[browse] Console/network logs flushed to .gstack/browse-*.log");
  process.exit(1);
}

class BrowserManager {
  browser = null;
  context = null;
  proxyConfig = null;
  pages = new Map;
  tabSessions = new Map;
  activeTabId = 0;
  nextTabId = 1;
  extraHeaders = {};
  customUserAgent = null;
  chromiumProcInfo = null;
  getChromiumProcInfo() {
    return this.chromiumProcInfo;
  }
  deviceScaleFactor = 1;
  currentViewport = { width: 1280, height: 720 };
  serverPort = 0;
  tabOwnership = new Map;
  dialogAutoAccept = true;
  dialogPromptText = null;
  cookieImportedDomains = new Set;
  isHeaded = false;
  consecutiveFailures = 0;
  watching = false;
  watchInterval = null;
  watchSnapshots = [];
  watchStartTime = 0;
  connectionMode = "launched";
  onHeadedPromotion;
  intentionalDisconnect = false;
  static TAB_GUARDRAIL_SOFT = 50;
  static TAB_GUARDRAIL_HARD = 200;
  tabGuardrailSoftHit = false;
  tabGuardrailHardHit = false;
  checkTabGuardrails() {
    const total = this.pages.size;
    if (!this.tabGuardrailSoftHit && total >= BrowserManager.TAB_GUARDRAIL_SOFT) {
      this.tabGuardrailSoftHit = true;
      const msg = `Tab count crossed ${BrowserManager.TAB_GUARDRAIL_SOFT} (now ${total}). Consider closing unused tabs — each Chromium tab holds 50–300 MB.`;
      console.warn(`[browse] ${msg}`);
      emitActivity({ type: "error", command: "tab-guardrail", error: msg, tabs: total });
    }
    if (!this.tabGuardrailHardHit && total >= BrowserManager.TAB_GUARDRAIL_HARD) {
      this.tabGuardrailHardHit = true;
      const msg = `Tab count crossed ${BrowserManager.TAB_GUARDRAIL_HARD} (now ${total}). OOM risk imminent. Open the sidebar to see top RAM consumers.`;
      console.error(`[browse] ${msg}`);
      emitActivity({ type: "error", command: "tab-guardrail", error: msg, tabs: total });
    }
  }
  recheckTabGuardrailsOnClose() {
    const total = this.pages.size;
    if (this.tabGuardrailSoftHit && total < BrowserManager.TAB_GUARDRAIL_SOFT) {
      this.tabGuardrailSoftHit = false;
    }
    if (this.tabGuardrailHardHit && total < BrowserManager.TAB_GUARDRAIL_HARD) {
      this.tabGuardrailHardHit = false;
    }
  }
  onDisconnect = null;
  getConnectionMode() {
    return this.connectionMode;
  }
  isWatching() {
    return this.watching;
  }
  startWatch() {
    this.watching = true;
    this.watchSnapshots = [];
    this.watchStartTime = Date.now();
  }
  stopWatch() {
    this.watching = false;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    const snapshots = this.watchSnapshots;
    const duration = Date.now() - this.watchStartTime;
    this.watchSnapshots = [];
    this.watchStartTime = 0;
    return { snapshots, duration };
  }
  addWatchSnapshot(snapshot) {
    this.watchSnapshots.push(snapshot);
  }
  findExtensionPath() {
    const fs = __require("fs");
    const path = __require("path");
    const candidates = [
      process.env.BROWSE_EXTENSIONS_DIR || "",
      path.resolve(__dirname, "..", "..", "extension"),
      path.join(process.env.HOME || "", ".claude", "skills", "gstack", "extension"),
      (() => {
        const stateFile = process.env.BROWSE_STATE_FILE || "";
        if (stateFile) {
          const repoRoot = path.resolve(path.dirname(stateFile), "..");
          return path.join(repoRoot, ".claude", "skills", "gstack", "extension");
        }
        return "";
      })()
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(path.join(candidate, "manifest.json"))) {
          return candidate;
        }
      } catch (err) {
        if (err?.code !== "ENOENT" && err?.code !== "EACCES")
          throw err;
      }
    }
    return null;
  }
  setProxyConfig(cfg) {
    this.proxyConfig = cfg;
  }
  getRefMap() {
    try {
      return this.getActiveSession().getRefEntries();
    } catch {
      return [];
    }
  }
  async launch() {
    const extensionsDir = process.env.BROWSE_EXTENSIONS_DIR;
    await Promise.resolve().then(() => init_stealth());
    const launchArgs = [...STEALTH_LAUNCH_ARGS, ...buildGStackLaunchArgs()];
    let useHeadless = true;
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    if (process.env.CI || process.env.CONTAINER || isRoot) {
      launchArgs.push("--no-sandbox");
    }
    if (extensionsDir) {
      if (!isCustomChromium()) {
        launchArgs.push(`--disable-extensions-except=${extensionsDir}`, `--load-extension=${extensionsDir}`);
      }
      launchArgs.push("--window-position=-9999,-9999", "--window-size=1,1");
      useHeadless = false;
      console.log(`[browse] Extensions loaded from: ${extensionsDir}`);
    }
    if (useHeadless) {
      launchArgs.push(...headlessGpuArgs(process.platform, process.env));
    }
    this.browser = await launchWithXProtectHeal(() => chromium2.launch({
      headless: useHeadless,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      chromiumSandbox: shouldEnableChromiumSandbox(),
      ...launchArgs.length > 0 ? { args: launchArgs } : {},
      ...this.proxyConfig ? { proxy: this.proxyConfig } : {}
    }));
    this.browser.on("disconnected", () => {
      handleChromiumDisconnect(this.browser);
    });
    {
      const proc = typeof this.browser.process === "function" ? this.browser.process() : null;
      this.chromiumProcInfo = proc?.pid ? { pid: proc.pid, startTime: readPidStartTime(proc.pid) } : null;
    }
    const contextOptions = {
      viewport: { width: this.currentViewport.width, height: this.currentViewport.height },
      deviceScaleFactor: this.deviceScaleFactor
    };
    if (this.customUserAgent) {
      contextOptions.userAgent = this.customUserAgent;
    }
    this.context = await this.browser.newContext(contextOptions);
    if (Object.keys(this.extraHeaders).length > 0) {
      await this.context.setExtraHTTPHeaders(this.extraHeaders);
    }
    await Promise.resolve().then(() => init_stealth());
    await applyStealth(this.context);
    await this.newTab();
  }
  async launchHeaded(authToken) {
    this.pages.clear();
    this.tabSessions.clear();
    this.nextTabId = 1;
    const extensionPath = this.findExtensionPath();
    await Promise.resolve().then(() => init_stealth());
    const launchArgs = [
      "--hide-crash-restore-bubble",
      ...STEALTH_LAUNCH_ARGS,
      ...buildGStackLaunchArgs()
    ];
    if (extensionPath) {
      if (!isCustomChromium()) {
        launchArgs.push(`--disable-extensions-except=${extensionPath}`);
        launchArgs.push(`--load-extension=${extensionPath}`);
      }
      if (authToken) {
        const fs = __require("fs");
        const path = __require("path");
        const gstackDir = path.join(process.env.HOME || "/tmp", ".gstack");
        mkdirSecure(gstackDir);
        const authFile = path.join(gstackDir, ".auth.json");
        try {
          writeSecureFile(authFile, JSON.stringify({ token: authToken, port: this.serverPort || 34567 }));
        } catch (err) {
          console.warn(`[browse] Could not write .auth.json: ${err.message}`);
        }
      }
    }
    const fs = __require("fs");
    const path = __require("path");
    const userDataDir = resolveChromiumProfile();
    fs.mkdirSync(userDataDir, { recursive: true });
    cleanSingletonLocks(userDataDir);
    const executablePath = process.env.GSTACK_CHROMIUM_PATH || undefined;
    if (!executablePath) {
      try {
        probePoisonedChromiumBundle(chromium2.executablePath());
      } catch (err) {
        if (err instanceof PoisonedBundleError)
          throw err;
      }
    }
    let customUA;
    if (!this.customUserAgent) {
      const chromePath = executablePath || chromium2.executablePath();
      try {
        const versionProc = Bun.spawnSync([chromePath, "--version"], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 5000
        });
        const versionOutput = versionProc.stdout.toString().trim();
        const versionMatch = versionOutput.match(/(\d+\.\d+\.\d+\.\d+)/);
        const chromeVersion = versionMatch ? versionMatch[1] : "131.0.0.0";
        customUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
      } catch {
        customUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
      }
    }
    await Promise.resolve().then(() => init_stealth());
    this.context = await launchWithXProtectHeal(() => chromium2.launchPersistentContext(userDataDir, {
      headless: false,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      chromiumSandbox: shouldEnableChromiumSandbox(),
      args: launchArgs,
      viewport: null,
      userAgent: this.customUserAgent || customUA,
      ...executablePath ? { executablePath } : {},
      ...this.proxyConfig ? { proxy: this.proxyConfig } : {},
      ignoreDefaultArgs: STEALTH_IGNORE_DEFAULT_ARGS
    }), { usesCustomExecutable: Boolean(executablePath) });
    this.browser = this.context.browser();
    this.connectionMode = "headed";
    this.intentionalDisconnect = false;
    await Promise.resolve().then(() => init_stealth());
    await applyStealth(this.context);
    const indicatorScript = () => {
      const injectIndicator = () => {
        if (document.getElementById("gstack-ctrl"))
          return;
        const topLine = document.createElement("div");
        topLine.id = "gstack-ctrl";
        topLine.style.cssText = `
          position: fixed; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, #F59E0B, #FBBF24, #F59E0B);
          background-size: 200% 100%;
          animation: gstack-shimmer 3s linear infinite;
          pointer-events: none; z-index: 2147483647;
          opacity: 0.8;
        `;
        const style = document.createElement("style");
        style.textContent = `
          @keyframes gstack-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            #gstack-ctrl { animation: none !important; }
          }
        `;
        document.documentElement.appendChild(style);
        document.documentElement.appendChild(topLine);
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectIndicator);
      } else {
        injectIndicator();
      }
    };
    await this.context.addInitScript(indicatorScript);
    this.context.on("page", (page) => {
      const id = this.nextTabId++;
      this.pages.set(id, page);
      this.tabSessions.set(id, new TabSession(page));
      this.activeTabId = id;
      this.wirePageEvents(page);
      page.evaluate(indicatorScript).catch(() => {});
      console.log(`[browse] New tab detected (id=${id}, total=${this.pages.size})`);
      this.checkTabGuardrails();
    });
    const existingPages = this.context.pages();
    if (existingPages.length > 0) {
      const page = existingPages[0];
      const id = this.nextTabId++;
      this.pages.set(id, page);
      this.tabSessions.set(id, new TabSession(page));
      this.activeTabId = id;
      this.wirePageEvents(page);
      try {
        await page.evaluate(indicatorScript);
      } catch {}
    } else {
      await this.newTab();
    }
    if (this.browser) {
      this.browser.on("disconnected", () => {
        if (this.intentionalDisconnect)
          return;
        const browserRef = this.browser;
        (async () => {
          const cause = await resolveDisconnectCause(browserRef);
          const exitCode = cause === "clean" ? 0 : 2;
          if (cause === "clean") {
            console.error("[browse] Real browser closed cleanly (user-initiated quit). Server exiting (0).");
          } else {
            console.error("[browse] Real browser disconnected (crash or kill). Server exiting (2).");
            console.error("[browse] Run `$B connect` to reconnect.");
          }
          if (!this.onDisconnect) {
            process.exit(exitCode);
            return;
          }
          try {
            const result = this.onDisconnect(exitCode);
            if (result && typeof result.catch === "function") {
              result.catch((err) => {
                console.error("[browse] onDisconnect rejected:", err);
                process.exit(exitCode);
              });
            }
          } catch (err) {
            console.error("[browse] onDisconnect threw:", err);
            process.exit(exitCode);
          }
        })();
      });
    }
    this.dialogAutoAccept = false;
    this.isHeaded = true;
    this.consecutiveFailures = 0;
  }
  closeRaceMs = 5000;
  async close() {
    const raceTimeout = (ms) => new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      t.unref?.();
    });
    if (this.browser || this.connectionMode === "headed" && this.context) {
      if (this.connectionMode === "headed") {
        this.intentionalDisconnect = true;
        if (this.browser)
          this.browser.removeAllListeners("disconnected");
        await Promise.race([
          this.context ? this.context.close() : Promise.resolve(),
          raceTimeout(this.closeRaceMs)
        ]).catch(() => {});
      } else {
        this.browser.removeAllListeners("disconnected");
        const child = this.browser.process?.();
        const closed = await Promise.race([
          this.browser.close().then(() => true),
          raceTimeout(this.closeRaceMs)
        ]).catch(() => false);
        if (closed === false && child && child.exitCode === null && !child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }
      this.browser = null;
    }
  }
  async isHealthy() {
    if (!this.browser || !this.browser.isConnected())
      return false;
    try {
      const page = this.pages.get(this.activeTabId);
      if (!page)
        return true;
      await Promise.race([
        page.evaluate("1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))
      ]);
      return true;
    } catch {
      return false;
    }
  }
  async newTab(url, clientId) {
    if (!this.context)
      throw new Error("Browser not launched");
    let normalizedUrl;
    if (url) {
      normalizedUrl = await validateNavigationUrl(url);
    }
    const page = await this.context.newPage();
    const id = this.nextTabId++;
    this.pages.set(id, page);
    this.tabSessions.set(id, new TabSession(page));
    this.activeTabId = id;
    if (clientId) {
      this.tabOwnership.set(id, clientId);
    }
    this.wirePageEvents(page);
    if (normalizedUrl) {
      await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    }
    return id;
  }
  async closeTab(id) {
    const tabId = id ?? this.activeTabId;
    const page = this.pages.get(tabId);
    if (!page)
      throw new Error(`Tab ${tabId} not found`);
    const wasActive = tabId === this.activeTabId;
    await page.close();
    this.pages.delete(tabId);
    this.tabSessions.delete(tabId);
    this.tabOwnership.delete(tabId);
    if (wasActive) {
      const remaining = [...this.pages.keys()];
      if (remaining.length === 0) {
        await this.newTab();
      } else if (!this.pages.has(this.activeTabId)) {
        this.activeTabId = remaining[remaining.length - 1];
      }
    }
  }
  switchTab(id, opts) {
    if (!this.tabSessions.has(id))
      throw new Error(`Tab ${id} not found`);
    this.activeTabId = id;
    if (opts?.bringToFront !== false) {
      const page = this.pages.get(id);
      if (page)
        page.bringToFront().catch(() => {});
    }
  }
  syncActiveTabByUrl(activeUrl) {
    if (!activeUrl || this.pages.size <= 1)
      return;
    let fuzzyId = null;
    let activeOriginPath = "";
    try {
      const u = new URL(activeUrl);
      activeOriginPath = u.origin + u.pathname;
    } catch (err) {
      if (!(err instanceof TypeError))
        throw err;
    }
    for (const [id, page] of this.pages) {
      try {
        const pageUrl = page.url();
        if (pageUrl === activeUrl && id !== this.activeTabId) {
          this.activeTabId = id;
          return;
        }
        if (activeOriginPath && fuzzyId === null && id !== this.activeTabId) {
          try {
            const pu = new URL(pageUrl);
            if (pu.origin + pu.pathname === activeOriginPath) {
              fuzzyId = id;
            }
          } catch (err) {
            if (!(err instanceof TypeError))
              throw err;
          }
        }
      } catch {}
    }
    if (fuzzyId !== null) {
      this.activeTabId = fuzzyId;
    }
  }
  getActiveTabId() {
    return this.activeTabId;
  }
  getTabCount() {
    return this.pages.size;
  }
  getTabOwner(tabId) {
    return this.tabOwnership.get(tabId) || null;
  }
  checkTabAccess(tabId, clientId, options = {}) {
    if (clientId === "root")
      return true;
    if (options.ownOnly) {
      const owner = this.tabOwnership.get(tabId);
      return owner === clientId;
    }
    return true;
  }
  transferTab(tabId, toClientId) {
    if (!this.pages.has(tabId))
      throw new Error(`Tab ${tabId} not found`);
    this.tabOwnership.set(tabId, toClientId);
  }
  releaseClientTabs(clientId) {
    const released = [];
    for (const [tabId, owner] of this.tabOwnership) {
      if (owner === clientId) {
        this.tabOwnership.delete(tabId);
        released.push(tabId);
      }
    }
    return released;
  }
  async getTabListWithTitles() {
    const tabs = [];
    for (const [id, page] of this.pages) {
      tabs.push({
        id,
        url: page.url(),
        title: await page.title().catch(() => ""),
        active: id === this.activeTabId
      });
    }
    return tabs;
  }
  getActiveSession() {
    const session = this.tabSessions.get(this.activeTabId);
    if (!session)
      throw new Error('No active page. Use "browse goto <url>" first.');
    return session;
  }
  getSession(tabId) {
    const session = this.tabSessions.get(tabId);
    if (!session)
      throw new Error(`Tab ${tabId} not found`);
    return session;
  }
  getPageForTab(tabId) {
    return this.pages.get(tabId) ?? null;
  }
  tabLocks = new Map;
  globalCdpLockTail = Promise.resolve();
  async acquireTabLock(tabId, timeoutMs) {
    const existing = this.tabLocks.get(tabId) ?? Promise.resolve();
    const tail = Promise.all([existing, this.globalCdpLockTail]).then(() => {
      return;
    });
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    this.tabLocks.set(tabId, tail.then(() => next));
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`CDPMutexAcquireTimeout: tab ${tabId} lock not acquired within ${timeoutMs}ms.
Cause: a prior CDP or browser-scoped operation has held the lock too long.
` + "Action: retry; if this repeats, the prior operation may be hung — file a bug.")), timeoutMs));
    try {
      await Promise.race([tail, timeoutPromise]);
    } catch (e) {
      release();
      throw e;
    }
    return release;
  }
  async acquireGlobalCdpLock(timeoutMs) {
    const allTabTails = Array.from(this.tabLocks.values());
    const priorGlobal = this.globalCdpLockTail;
    const allPrior = Promise.all([priorGlobal, ...allTabTails]).then(() => {
      return;
    });
    let release;
    const next = new Promise((resolve) => {
      release = resolve;
    });
    this.globalCdpLockTail = allPrior.then(() => next);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`CDPMutexAcquireTimeout: global CDP lock not acquired within ${timeoutMs}ms.
Cause: in-flight tab operations have not completed.
` + "Action: retry; if this repeats, file a bug — a tab op may be hung.")), timeoutMs));
    try {
      await Promise.race([allPrior, timeoutPromise]);
    } catch (e) {
      release();
      throw e;
    }
    return release;
  }
  getPage() {
    return this.getActiveSession().page;
  }
  getCurrentUrl() {
    try {
      return this.getPage().url();
    } catch {
      return "about:blank";
    }
  }
  async getMemorySnapshot(structures) {
    const bunMem = process.memoryUsage();
    const notes = [];
    const tabs = [];
    for (const [id, page] of this.pages) {
      try {
        const url = (() => {
          try {
            return page.url();
          } catch {
            return "";
          }
        })();
        const title = await page.title().catch(() => "");
        const metrics = await withCdpSession(page, async (session) => {
          await session.send("Performance.enable").catch(() => {
            return;
          });
          const result = await session.send("Performance.getMetrics");
          return result.metrics ?? [];
        });
        const mm = {};
        for (const m of metrics)
          mm[m.name] = m.value;
        tabs.push({
          id,
          url,
          title,
          jsHeapUsed: mm.JSHeapUsedSize ?? 0,
          jsHeapTotal: mm.JSHeapTotalSize ?? 0,
          documents: mm.Documents ?? 0,
          nodes: mm.Nodes ?? 0,
          listeners: mm.JSEventListeners ?? 0
        });
      } catch {}
    }
    let processes = null;
    const browser = this.browser ?? (this.context ? this.context.browser() : null);
    if (browser) {
      try {
        const maybeFactory = browser.newBrowserCDPSession;
        if (typeof maybeFactory === "function") {
          const browserSession = await maybeFactory.call(browser);
          try {
            const info = await browserSession.send("SystemInfo.getProcessInfo");
            processes = (info.processInfo ?? []).map((p) => ({
              id: p.id,
              type: p.type,
              cpuTime: p.cpuTime
            }));
            notes.push("Per-Chromium-process RSS not collected — SystemInfo.getProcessInfo exposes PID+type+CPU only. " + 'See follow-up TODO "native/GPU memory breakdown" for the deferred fix.');
          } finally {
            await browserSession.detach().catch(() => {
              return;
            });
          }
        } else {
          notes.push("Playwright build does not expose newBrowserCDPSession; per-process info skipped.");
        }
      } catch (err) {
        notes.push(`CDP browser session unavailable: ${err?.message ?? String(err)}`);
      }
    } else {
      notes.push("Browser handle unavailable (server connection mode); per-process info skipped.");
    }
    return {
      bunServer: {
        rss: bunMem.rss,
        heapUsed: bunMem.heapUsed,
        heapTotal: bunMem.heapTotal,
        external: bunMem.external
      },
      tabs,
      processes,
      structures,
      capturedAt: Date.now(),
      notes
    };
  }
  setRefMap(refs) {
    this.getActiveSession().setRefMap(refs);
  }
  clearRefs() {
    this.getActiveSession().clearRefs();
  }
  async resolveRef(selector) {
    return this.getActiveSession().resolveRef(selector);
  }
  getRefRole(selector) {
    return this.getActiveSession().getRefRole(selector);
  }
  getRefCount() {
    return this.getActiveSession().getRefCount();
  }
  setLastSnapshot(text) {
    this.getActiveSession().setLastSnapshot(text);
  }
  getLastSnapshot() {
    return this.getActiveSession().getLastSnapshot();
  }
  setDialogAutoAccept(accept) {
    this.dialogAutoAccept = accept;
  }
  getDialogAutoAccept() {
    return this.dialogAutoAccept;
  }
  setDialogPromptText(text) {
    this.dialogPromptText = text;
  }
  getDialogPromptText() {
    return this.dialogPromptText;
  }
  trackCookieImportDomains(domains) {
    for (const d of domains)
      this.cookieImportedDomains.add(d);
  }
  getCookieImportedDomains() {
    return this.cookieImportedDomains;
  }
  hasCookieImports() {
    return this.cookieImportedDomains.size > 0;
  }
  async setViewport(width, height) {
    this.currentViewport = { width, height };
    await this.getPage().setViewportSize({ width, height });
  }
  async setExtraHeader(name, value) {
    this.extraHeaders[name] = value;
    if (this.context) {
      await this.context.setExtraHTTPHeaders(this.extraHeaders);
    }
  }
  setUserAgent(ua) {
    this.customUserAgent = ua;
  }
  getUserAgent() {
    return this.customUserAgent;
  }
  async closeAllPages() {
    for (const page of this.pages.values()) {
      await page.close().catch(() => {});
    }
    this.pages.clear();
    this.tabSessions.clear();
  }
  setFrame(frame) {
    this.getActiveSession().setFrame(frame);
  }
  getFrame() {
    return this.getActiveSession().getFrame();
  }
  getActiveFrameOrPage() {
    return this.getActiveSession().getActiveFrameOrPage();
  }
  async saveState() {
    if (!this.context)
      throw new Error("Browser not launched");
    const cookies = await this.context.cookies();
    const pages = [];
    for (const [id, page] of this.pages) {
      const url = page.url();
      let storage = null;
      try {
        storage = await page.evaluate(() => ({
          localStorage: { ...localStorage },
          sessionStorage: { ...sessionStorage }
        }));
      } catch {}
      const session = this.tabSessions.get(id);
      const loaded = session?.getLoadedHtml();
      const owner = this.tabOwnership.get(id);
      pages.push({
        url: url === "about:blank" ? "" : url,
        isActive: id === this.activeTabId,
        storage,
        loadedHtml: loaded?.html,
        loadedHtmlWaitUntil: loaded?.waitUntil,
        owner
      });
    }
    return { cookies, pages };
  }
  async restoreState(state) {
    if (!this.context)
      throw new Error("Browser not launched");
    if (state.cookies.length > 0) {
      await this.context.addCookies(state.cookies);
    }
    this.tabOwnership.clear();
    let activeId = null;
    for (const saved of state.pages) {
      const page = await this.context.newPage();
      const id = this.nextTabId++;
      this.pages.set(id, page);
      const newSession = new TabSession(page);
      this.tabSessions.set(id, newSession);
      this.wirePageEvents(page);
      if (saved.owner) {
        this.tabOwnership.set(id, saved.owner);
      }
      if (saved.loadedHtml) {
        try {
          await newSession.setTabContent(saved.loadedHtml, { waitUntil: saved.loadedHtmlWaitUntil });
        } catch (err) {
          console.warn(`[browse] Failed to replay loadedHtml for tab ${id}: ${err.message}`);
        }
      } else if (saved.url) {
        let normalizedUrl;
        try {
          normalizedUrl = await validateNavigationUrl(saved.url);
        } catch (err) {
          console.warn(`[browse] Skipping invalid URL in state file: ${saved.url} — ${err.message}`);
          continue;
        }
        await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      }
      if (saved.storage) {
        try {
          await page.evaluate((s) => {
            if (s.localStorage) {
              for (const [k, v] of Object.entries(s.localStorage)) {
                localStorage.setItem(k, v);
              }
            }
            if (s.sessionStorage) {
              for (const [k, v] of Object.entries(s.sessionStorage)) {
                sessionStorage.setItem(k, v);
              }
            }
          }, saved.storage);
        } catch {}
      }
      if (saved.isActive)
        activeId = id;
    }
    if (this.pages.size === 0) {
      await this.newTab();
    } else {
      this.activeTabId = activeId ?? [...this.pages.keys()][0];
    }
    this.clearRefs();
  }
  async recreateContext() {
    if (this.connectionMode === "headed") {
      throw new Error("Cannot recreate context in headed mode. Use disconnect first.");
    }
    if (!this.browser || !this.context) {
      throw new Error("Browser not launched");
    }
    try {
      const state = await this.saveState();
      for (const page of this.pages.values()) {
        await page.close().catch(() => {});
      }
      this.pages.clear();
      this.tabSessions.clear();
      await this.context.close().catch(() => {});
      const contextOptions = {
        viewport: { width: this.currentViewport.width, height: this.currentViewport.height },
        deviceScaleFactor: this.deviceScaleFactor
      };
      if (this.customUserAgent) {
        contextOptions.userAgent = this.customUserAgent;
      }
      this.context = await this.browser.newContext(contextOptions);
      await Promise.resolve().then(() => init_stealth());
      await applyStealth(this.context);
      if (Object.keys(this.extraHeaders).length > 0) {
        await this.context.setExtraHTTPHeaders(this.extraHeaders);
      }
      await this.restoreState(state);
      return null;
    } catch (err) {
      try {
        this.pages.clear();
        this.tabSessions.clear();
        if (this.context)
          await this.context.close().catch(() => {});
        const contextOptions = {
          viewport: { width: this.currentViewport.width, height: this.currentViewport.height },
          deviceScaleFactor: this.deviceScaleFactor
        };
        if (this.customUserAgent) {
          contextOptions.userAgent = this.customUserAgent;
        }
        this.context = await this.browser.newContext(contextOptions);
        await Promise.resolve().then(() => init_stealth());
        await applyStealth(this.context);
        await this.newTab();
        this.clearRefs();
      } catch {}
      return `Context recreation failed: ${err instanceof Error ? err.message : String(err)}. Browser reset to blank tab.`;
    }
  }
  async setDeviceScaleFactor(scale, width, height) {
    if (!Number.isFinite(scale)) {
      throw new Error(`viewport --scale: value must be a finite number, got ${scale}`);
    }
    if (scale < 1 || scale > 3) {
      throw new Error(`viewport --scale: value must be between 1 and 3 (gstack policy cap), got ${scale}`);
    }
    if (this.connectionMode === "headed") {
      throw new Error("viewport --scale is not supported in headed mode — scale is controlled by the real browser window.");
    }
    const prevScale = this.deviceScaleFactor;
    const prevViewport = { ...this.currentViewport };
    this.deviceScaleFactor = scale;
    this.currentViewport = { width, height };
    const err = await this.recreateContext();
    if (err !== null) {
      this.deviceScaleFactor = prevScale;
      this.currentViewport = prevViewport;
      const rollbackErr = await this.recreateContext();
      if (rollbackErr !== null) {
        return `${err} (rollback also encountered: ${rollbackErr})`;
      }
      return err;
    }
    return null;
  }
  getDeviceScaleFactor() {
    return this.deviceScaleFactor;
  }
  getCurrentViewport() {
    return { ...this.currentViewport };
  }
  async handoff(message) {
    if (this.connectionMode === "headed" || this.isHeaded) {
      return `HANDOFF: Already in headed mode at ${this.getCurrentUrl()}`;
    }
    if (!this.browser || !this.context) {
      throw new Error("Browser not launched");
    }
    const state = await this.saveState();
    const currentUrl = this.getCurrentUrl();
    let newContext;
    try {
      const fs = __require("fs");
      const path = __require("path");
      const extensionPath = this.findExtensionPath();
      await Promise.resolve().then(() => init_stealth());
      const launchArgs = ["--hide-crash-restore-bubble", ...STEALTH_LAUNCH_ARGS, ...buildGStackLaunchArgs()];
      if (extensionPath) {
        launchArgs.push(`--disable-extensions-except=${extensionPath}`);
        launchArgs.push(`--load-extension=${extensionPath}`);
        console.log(`[browse] Handoff: loading extension from ${extensionPath}`);
      } else {
        console.log("[browse] Handoff: extension not found — headed mode without side panel");
      }
      const userDataDir = resolveChromiumProfile();
      fs.mkdirSync(userDataDir, { recursive: true });
      cleanSingletonLocks(userDataDir);
      try {
        probePoisonedChromiumBundle(chromium2.executablePath());
      } catch (err) {
        if (err instanceof PoisonedBundleError)
          throw err;
      }
      await Promise.resolve().then(() => init_stealth());
      newContext = await launchWithXProtectHeal(() => chromium2.launchPersistentContext(userDataDir, {
        headless: false,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        chromiumSandbox: shouldEnableChromiumSandbox(),
        args: launchArgs,
        viewport: null,
        ...this.proxyConfig ? { proxy: this.proxyConfig } : {},
        ignoreDefaultArgs: STEALTH_IGNORE_DEFAULT_ARGS,
        timeout: 15000
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `ERROR: Cannot open headed browser — ${msg}. Headless browser still running.`;
    }
    try {
      const oldBrowser = this.browser;
      this.context = newContext;
      this.browser = newContext.browser();
      this.pages.clear();
      this.tabSessions.clear();
      this.connectionMode = "headed";
      this.onHeadedPromotion?.();
      await Promise.resolve().then(() => init_stealth());
      await applyStealth(newContext);
      if (Object.keys(this.extraHeaders).length > 0) {
        await newContext.setExtraHTTPHeaders(this.extraHeaders);
      }
      if (this.browser) {
        const browserRef = this.browser;
        this.browser.on("disconnected", () => {
          if (this.intentionalDisconnect)
            return;
          handleChromiumDisconnect(browserRef);
        });
      }
      await this.restoreState(state);
      this.isHeaded = true;
      this.dialogAutoAccept = false;
      oldBrowser.removeAllListeners("disconnected");
      oldBrowser.close().catch(() => {});
      return [
        `HANDOFF: Browser opened at ${currentUrl}`,
        `MESSAGE: ${message}`,
        `STATUS: Waiting for user. Run 'resume' when done.`
      ].join(`
`);
    } catch (err) {
      await newContext.close().catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      return `ERROR: Handoff failed during state restore — ${msg}. Headless browser still running.`;
    }
  }
  resume() {
    try {
      const session = this.getActiveSession();
      session.clearRefs();
      session.setFrame(null);
    } catch {}
    this.resetFailures();
  }
  getIsHeaded() {
    return this.isHeaded;
  }
  incrementFailures() {
    this.consecutiveFailures++;
  }
  resetFailures() {
    this.consecutiveFailures = 0;
  }
  getFailureHint() {
    if (this.consecutiveFailures >= 3 && !this.isHeaded) {
      return `HINT: ${this.consecutiveFailures} consecutive failures. Consider using 'handoff' to let the user help.`;
    }
    return null;
  }
  wirePageEvents(page) {
    page.on("close", () => {
      for (const [id, p] of this.pages) {
        if (p === page) {
          this.pages.delete(id);
          this.tabSessions.delete(id);
          console.log(`[browse] Tab closed (id=${id}, remaining=${this.pages.size})`);
          if (this.activeTabId === id) {
            const remaining = [...this.pages.keys()];
            this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : 0;
          }
          break;
        }
      }
      this.recheckTabGuardrailsOnClose();
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        for (const session of this.tabSessions.values()) {
          if (session.page === page) {
            session.onMainFrameNavigated();
            break;
          }
        }
      }
    });
    page.on("dialog", async (dialog) => {
      const entry = {
        timestamp: Date.now(),
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue() || undefined,
        action: this.dialogAutoAccept ? "accepted" : "dismissed",
        response: this.dialogAutoAccept ? this.dialogPromptText ?? undefined : undefined
      };
      addDialogEntry(entry);
      try {
        if (this.dialogAutoAccept) {
          await dialog.accept(this.dialogPromptText ?? undefined);
        } else {
          await dialog.dismiss();
        }
      } catch {}
    });
    page.on("console", (msg) => {
      addConsoleEntry({
        timestamp: Date.now(),
        level: msg.type(),
        text: msg.text()
      });
    });
    page.on("request", (req) => {
      addNetworkEntry({
        timestamp: Date.now(),
        method: req.method(),
        url: req.url()
      });
    });
    page.on("response", (res) => {
      const url = res.url();
      const status = res.status();
      for (let i = networkBuffer.length - 1;i >= 0; i--) {
        const entry = networkBuffer.get(i);
        if (entry && entry.url === url && !entry.status) {
          networkBuffer.set(i, { ...entry, status, duration: Date.now() - entry.timestamp });
          break;
        }
      }
    });
    page.on("requestfinished", async (req) => {
      try {
        const sizes = await req.sizes().catch(() => null);
        if (!sizes)
          return;
        const url = req.url();
        const size = sizes.responseBodySize ?? 0;
        for (let i = networkBuffer.length - 1;i >= 0; i--) {
          const entry = networkBuffer.get(i);
          if (entry && entry.url === url && !entry.size) {
            networkBuffer.set(i, { ...entry, size });
            break;
          }
        }
      } catch {}
    });
  }
}
var __dirname = "/private/tmp/gstack-install/browse/src", PoisonedBundleError, daemonProcess = false;
var init_browser_manager = __esm(() => {
  init_file_permissions();
  init_buffers();
  init_activity();
  init_url_validation();
  init_config();
  init_xprotect_heal();
  init_xvfb();
  init_cdp_bridge();
  PoisonedBundleError = class PoisonedBundleError extends Error {
    constructor(message) {
      super(message);
      this.name = "PoisonedBundleError";
    }
  };
});

// browse/src/cdp-inspector.ts
async function getOrCreateSession(page) {
  let session = cdpSessions.get(page);
  if (session) {
    try {
      await session.send("DOM.getDocument", { depth: 0 });
      return session;
    } catch (err) {
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("detached"))
        throw err;
      cdpSessions.delete(page);
      initializedPages.delete(page);
    }
  }
  session = await getOrCreateCdpSession(page, cdpSessions);
  if (!initializedPages.has(page)) {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    initializedPages.add(page);
    page.once("close", () => initializedPages.delete(page));
  }
  page.once("framenavigated", () => {
    try {
      session.detach().catch(() => {});
    } catch (err) {
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("detached"))
        throw err;
    }
    cdpSessions.delete(page);
    initializedPages.delete(page);
  });
  return session;
}
function pushModification(mod) {
  modificationHistory.push(mod);
  modHistoryTotalPushed++;
  while (modificationHistory.length > MOD_HISTORY_CAP) {
    modificationHistory.shift();
  }
}
function computeSpecificity(selector) {
  let a = 0, b = 0, c = 0;
  let cleaned = selector;
  const ids = cleaned.match(/#[a-zA-Z_-][\w-]*/g);
  if (ids)
    a += ids.length;
  const classes = cleaned.match(/\.[a-zA-Z_-][\w-]*/g);
  if (classes)
    b += classes.length;
  const attrs = cleaned.match(/\[[^\]]+\]/g);
  if (attrs)
    b += attrs.length;
  const pseudoClasses = cleaned.match(/(?<!:):[a-zA-Z][\w-]*/g);
  if (pseudoClasses)
    b += pseudoClasses.length;
  const types = cleaned.match(/(?:^|[\s+~>])([a-zA-Z][\w-]*)/g);
  if (types)
    c += types.length;
  const pseudoElements = cleaned.match(/::[a-zA-Z][\w-]*/g);
  if (pseudoElements)
    c += pseudoElements.length;
  return { a, b, c };
}
function compareSpecificity(s1, s2) {
  if (s1.a !== s2.a)
    return s1.a - s2.a;
  if (s1.b !== s2.b)
    return s1.b - s2.b;
  return s1.c - s2.c;
}
async function inspectElement(page, selector, options) {
  const session = await getOrCreateSession(page);
  const { root } = await session.send("DOM.getDocument", { depth: 0 });
  let nodeId;
  try {
    const result = await session.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector
    });
    nodeId = result.nodeId;
    if (!nodeId)
      throw new Error(`Element not found: ${selector}`);
  } catch (err) {
    throw new Error(`Element not found: ${selector} — ${err.message}`);
  }
  const { node } = await session.send("DOM.describeNode", { nodeId, depth: 0 });
  const tagName = (node.localName || node.nodeName || "").toLowerCase();
  const attrPairs = node.attributes || [];
  const attributes = {};
  for (let i = 0;i < attrPairs.length; i += 2) {
    attributes[attrPairs[i]] = attrPairs[i + 1];
  }
  const id = attributes.id || null;
  const classes = attributes.class ? attributes.class.split(/\s+/).filter(Boolean) : [];
  let boxModel = {
    content: { x: 0, y: 0, width: 0, height: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  };
  try {
    const boxData = await session.send("DOM.getBoxModel", { nodeId });
    const model = boxData.model;
    const content = model.content;
    const padding = model.padding;
    const border = model.border;
    const margin = model.margin;
    const contentX = content[0];
    const contentY = content[1];
    const contentWidth = content[2] - content[0];
    const contentHeight = content[5] - content[1];
    boxModel = {
      content: { x: contentX, y: contentY, width: contentWidth, height: contentHeight },
      padding: {
        top: content[1] - padding[1],
        right: padding[2] - content[2],
        bottom: padding[5] - content[5],
        left: content[0] - padding[0]
      },
      border: {
        top: padding[1] - border[1],
        right: border[2] - padding[2],
        bottom: border[5] - padding[5],
        left: padding[0] - border[0]
      },
      margin: {
        top: border[1] - margin[1],
        right: margin[2] - border[2],
        bottom: margin[5] - border[5],
        left: border[0] - margin[0]
      }
    };
  } catch (err) {
    if (!err?.message?.includes("box model") && !err?.message?.includes("Could not compute"))
      throw err;
  }
  const matchedData = await session.send("CSS.getMatchedStylesForNode", { nodeId });
  const computedData = await session.send("CSS.getComputedStyleForNode", { nodeId });
  const computedStyles = {};
  for (const entry of computedData.computedStyle) {
    if (KEY_CSS_SET.has(entry.name)) {
      computedStyles[entry.name] = entry.value;
    }
  }
  const inlineData = await session.send("CSS.getInlineStylesForNode", { nodeId });
  const inlineStyles = {};
  if (inlineData.inlineStyle?.cssProperties) {
    for (const prop of inlineData.inlineStyle.cssProperties) {
      if (prop.name && prop.value && !prop.disabled) {
        inlineStyles[prop.name] = prop.value;
      }
    }
  }
  const matchedRules = [];
  const seenProperties = new Map;
  if (matchedData.matchedCSSRules) {
    for (const match of matchedData.matchedCSSRules) {
      const rule = match.rule;
      const isUA = rule.origin === "user-agent";
      if (isUA && !options?.includeUA)
        continue;
      let selectorText = "";
      if (rule.selectorList?.selectors) {
        const matchingIdx = match.matchingSelectors?.[0] ?? 0;
        selectorText = rule.selectorList.selectors[matchingIdx]?.text || rule.selectorList.text || "";
      }
      let source = "inline";
      let sourceLine = 0;
      let sourceColumn = 0;
      let styleSheetId;
      let range;
      if (rule.styleSheetId) {
        styleSheetId = rule.styleSheetId;
        source = rule.origin === "regular" ? rule.styleSheetId || "stylesheet" : rule.origin;
      }
      if (rule.style?.range) {
        range = rule.style.range;
        sourceLine = rule.style.range.startLine || 0;
        sourceColumn = rule.style.range.startColumn || 0;
      }
      let media;
      if (match.rule?.media) {
        const mediaList = match.rule.media;
        if (Array.isArray(mediaList) && mediaList.length > 0) {
          media = mediaList.map((m) => m.text).filter(Boolean).join(", ");
        }
      }
      const specificity = computeSpecificity(selectorText);
      const properties = [];
      if (rule.style?.cssProperties) {
        for (const prop of rule.style.cssProperties) {
          if (!prop.name || prop.disabled)
            continue;
          if (prop.name.startsWith("-") && !KEY_CSS_SET.has(prop.name))
            continue;
          properties.push({
            name: prop.name,
            value: prop.value || "",
            important: prop.important || (prop.value?.includes("!important") ?? false),
            overridden: false
          });
        }
      }
      matchedRules.push({
        selector: selectorText,
        properties,
        source,
        sourceLine,
        sourceColumn,
        specificity,
        media,
        userAgent: isUA,
        styleSheetId,
        range
      });
    }
  }
  matchedRules.sort((a, b) => -compareSpecificity(a.specificity, b.specificity));
  for (let i = 0;i < matchedRules.length; i++) {
    for (const prop of matchedRules[i].properties) {
      const key = prop.name;
      if (!seenProperties.has(key)) {
        seenProperties.set(key, i);
      } else {
        const earlierIdx = seenProperties.get(key);
        const earlierRule = matchedRules[earlierIdx];
        const earlierProp = earlierRule.properties.find((p) => p.name === key);
        if (prop.important && earlierProp && !earlierProp.important) {
          if (earlierProp)
            earlierProp.overridden = true;
          seenProperties.set(key, i);
        } else {
          prop.overridden = true;
        }
      }
    }
  }
  const pseudoElements = [];
  if (matchedData.pseudoElements) {
    for (const pseudo of matchedData.pseudoElements) {
      const pseudoType = pseudo.pseudoType || "unknown";
      const rules = [];
      if (pseudo.matches) {
        for (const match of pseudo.matches) {
          const rule = match.rule;
          const sel = rule.selectorList?.text || "";
          const props = (rule.style?.cssProperties || []).filter((p) => p.name && !p.disabled).map((p) => `${p.name}: ${p.value}`).join("; ");
          if (props) {
            rules.push({ selector: sel, properties: props });
          }
        }
      }
      if (rules.length > 0) {
        pseudoElements.push({ pseudo: `::${pseudoType}`, rules });
      }
    }
  }
  return {
    selector,
    tagName,
    id,
    classes,
    attributes,
    boxModel,
    computedStyles,
    matchedRules,
    inlineStyles,
    pseudoElements
  };
}
async function modifyStyle(page, selector, property, value) {
  if (!/^[a-zA-Z-]+$/.test(property)) {
    throw new Error(`Invalid CSS property name: ${property}. Only letters and hyphens allowed.`);
  }
  const DANGEROUS_CSS = /url\s*\(|expression\s*\(|@import|javascript:|data:/i;
  if (DANGEROUS_CSS.test(value)) {
    throw new Error("CSS value rejected: contains potentially dangerous pattern.");
  }
  let oldValue = "";
  let source = "inline";
  let sourceLine = 0;
  let method = "inline";
  try {
    const session = await getOrCreateSession(page);
    const result = await inspectElement(page, selector);
    oldValue = result.computedStyles[property] || "";
    let targetRule = null;
    for (const rule of result.matchedRules) {
      if (rule.userAgent)
        continue;
      const hasProp = rule.properties.some((p) => p.name === property);
      if (hasProp && rule.styleSheetId && rule.range) {
        targetRule = rule;
        break;
      }
    }
    if (targetRule?.styleSheetId && targetRule.range) {
      const range = targetRule.range;
      const styleText = await session.send("CSS.getStyleSheetText", {
        styleSheetId: targetRule.styleSheetId
      });
      const currentProps = targetRule.properties;
      const newPropsText = currentProps.map((p) => {
        if (p.name === property) {
          return `${p.name}: ${value}`;
        }
        return `${p.name}: ${p.value}`;
      }).join("; ");
      try {
        await session.send("CSS.setStyleTexts", {
          edits: [{
            styleSheetId: targetRule.styleSheetId,
            range,
            text: newPropsText
          }]
        });
        method = "setStyleTexts";
        source = `${targetRule.source}:${targetRule.sourceLine}`;
        sourceLine = targetRule.sourceLine;
      } catch (err) {
        if (!err?.message?.includes("style") && !err?.message?.includes("range") && !err?.message?.includes("closed") && !err?.message?.includes("Target"))
          throw err;
      }
    }
    if (method === "inline") {
      await page.evaluate(([sel, prop, val]) => {
        const el = document.querySelector(sel);
        if (!el)
          throw new Error(`Element not found: ${sel}`);
        el.style.setProperty(prop, val);
      }, [selector, property, value]);
    }
  } catch (err) {
    await page.evaluate(([sel, prop, val]) => {
      const el = document.querySelector(sel);
      if (!el)
        throw new Error(`Element not found: ${sel}`);
      el.style.setProperty(prop, val);
    }, [selector, property, value]);
  }
  const modification = {
    selector,
    property,
    oldValue,
    newValue: value,
    source,
    sourceLine,
    timestamp: Date.now(),
    method
  };
  pushModification(modification);
  return modification;
}
async function undoModification(page, index) {
  const idx = index ?? modificationHistory.length - 1;
  if (idx < 0 || idx >= modificationHistory.length) {
    const evictedNote = modHistoryTotalPushed > MOD_HISTORY_CAP ? ` (most recent ${MOD_HISTORY_CAP} only — ${modHistoryTotalPushed - MOD_HISTORY_CAP} earlier entries evicted at the cap)` : "";
    throw new Error(`No modification at index ${idx}. History has ${modificationHistory.length} entries${evictedNote}.`);
  }
  const mod = modificationHistory[idx];
  if (mod.method === "setStyleTexts") {
    try {
      await modifyStyle(page, mod.selector, mod.property, mod.oldValue);
      modificationHistory.pop();
    } catch (err) {
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("style") && !err?.message?.includes("not found") && !err?.message?.includes("Element"))
        throw err;
      await page.evaluate(([sel, prop, val]) => {
        const el = document.querySelector(sel);
        if (!el)
          return;
        if (val) {
          el.style.setProperty(prop, val);
        } else {
          el.style.removeProperty(prop);
        }
      }, [mod.selector, mod.property, mod.oldValue]);
    }
  } else {
    await page.evaluate(([sel, prop, val]) => {
      const el = document.querySelector(sel);
      if (!el)
        return;
      if (val) {
        el.style.setProperty(prop, val);
      } else {
        el.style.removeProperty(prop);
      }
    }, [mod.selector, mod.property, mod.oldValue]);
  }
  modificationHistory.splice(idx, 1);
}
function getModificationHistory() {
  return [...modificationHistory];
}
function getModificationHistoryStats() {
  return {
    current: modificationHistory.length,
    cap: MOD_HISTORY_CAP,
    evicted: Math.max(0, modHistoryTotalPushed - MOD_HISTORY_CAP)
  };
}
async function resetModifications(page) {
  for (let i = modificationHistory.length - 1;i >= 0; i--) {
    const mod = modificationHistory[i];
    try {
      await page.evaluate(([sel, prop, val]) => {
        const el = document.querySelector(sel);
        if (!el)
          return;
        if (val) {
          el.style.setProperty(prop, val);
        } else {
          el.style.removeProperty(prop);
        }
      }, [mod.selector, mod.property, mod.oldValue]);
    } catch (err) {
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("Execution context"))
        throw err;
    }
  }
  modificationHistory.length = 0;
  modHistoryTotalPushed = 0;
}
function formatInspectorResult(result, options) {
  const lines = [];
  const classStr = result.classes.length > 0 ? ` class="${result.classes.join(" ")}"` : "";
  const idStr = result.id ? ` id="${result.id}"` : "";
  lines.push(`Element: <${result.tagName}${idStr}${classStr}>`);
  lines.push(`Selector: ${result.selector}`);
  const w = Math.round(result.boxModel.content.width + result.boxModel.padding.left + result.boxModel.padding.right);
  const h = Math.round(result.boxModel.content.height + result.boxModel.padding.top + result.boxModel.padding.bottom);
  lines.push(`Dimensions: ${w} x ${h}`);
  lines.push("");
  lines.push("Box Model:");
  const bm = result.boxModel;
  lines.push(`  margin:  ${Math.round(bm.margin.top)}px  ${Math.round(bm.margin.right)}px  ${Math.round(bm.margin.bottom)}px  ${Math.round(bm.margin.left)}px`);
  lines.push(`  padding: ${Math.round(bm.padding.top)}px  ${Math.round(bm.padding.right)}px  ${Math.round(bm.padding.bottom)}px  ${Math.round(bm.padding.left)}px`);
  lines.push(`  border:  ${Math.round(bm.border.top)}px  ${Math.round(bm.border.right)}px  ${Math.round(bm.border.bottom)}px  ${Math.round(bm.border.left)}px`);
  lines.push(`  content: ${Math.round(bm.content.width)} x ${Math.round(bm.content.height)}`);
  lines.push("");
  const displayRules = options?.includeUA ? result.matchedRules : result.matchedRules.filter((r) => !r.userAgent);
  lines.push(`Matched Rules (${displayRules.length}):`);
  if (displayRules.length === 0) {
    lines.push("  (none)");
  } else {
    for (const rule of displayRules) {
      const propsStr = rule.properties.filter((p) => !p.overridden).map((p) => `${p.name}: ${p.value}${p.important ? " !important" : ""}`).join("; ");
      if (!propsStr)
        continue;
      const spec = `[${rule.specificity.a},${rule.specificity.b},${rule.specificity.c}]`;
      lines.push(`  ${rule.selector} { ${propsStr} }`);
      lines.push(`    -> ${rule.source}:${rule.sourceLine} ${spec}${rule.media ? ` @media ${rule.media}` : ""}`);
    }
  }
  lines.push("");
  lines.push("Inline Styles:");
  const inlineEntries = Object.entries(result.inlineStyles);
  if (inlineEntries.length === 0) {
    lines.push("  (none)");
  } else {
    const inlineStr = inlineEntries.map(([k, v]) => `${k}: ${v}`).join("; ");
    lines.push(`  ${inlineStr}`);
  }
  lines.push("");
  lines.push("Computed (key):");
  const cs = result.computedStyles;
  const computedPairs = [];
  for (const prop of KEY_CSS_PROPERTIES) {
    if (cs[prop] !== undefined) {
      computedPairs.push(`${prop}: ${cs[prop]}`);
    }
  }
  for (let i = 0;i < computedPairs.length; i += 3) {
    const chunk = computedPairs.slice(i, i + 3);
    lines.push(`  ${chunk.join(" | ")}`);
  }
  if (result.pseudoElements.length > 0) {
    lines.push("");
    lines.push("Pseudo-elements:");
    for (const pseudo of result.pseudoElements) {
      for (const rule of pseudo.rules) {
        lines.push(`  ${pseudo.pseudo} ${rule.selector} { ${rule.properties} }`);
      }
    }
  }
  return lines.join(`
`);
}
function detachSession(page) {
  if (page) {
    const session = cdpSessions.get(page);
    if (session) {
      try {
        session.detach().catch(() => {});
      } catch (err) {
        if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("detached"))
          throw err;
      }
      cdpSessions.delete(page);
      initializedPages.delete(page);
    }
  }
}
var KEY_CSS_PROPERTIES, KEY_CSS_SET, cdpSessions, initializedPages, MOD_HISTORY_CAP = 200, modificationHistory, modHistoryTotalPushed = 0;
var init_cdp_inspector = __esm(() => {
  init_cdp_bridge();
  KEY_CSS_PROPERTIES = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "float",
    "clear",
    "z-index",
    "overflow",
    "overflow-x",
    "overflow-y",
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-style",
    "border-color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "color",
    "background-color",
    "background-image",
    "opacity",
    "box-shadow",
    "border-radius",
    "transform",
    "transition",
    "flex-direction",
    "flex-wrap",
    "justify-content",
    "align-items",
    "gap",
    "grid-template-columns",
    "grid-template-rows",
    "text-align",
    "text-decoration",
    "visibility",
    "cursor",
    "pointer-events"
  ];
  KEY_CSS_SET = new Set(KEY_CSS_PROPERTIES);
  cdpSessions = new WeakMap;
  initializedPages = new WeakSet;
  modificationHistory = [];
});

// browse/src/sanitize.ts
function stripLoneSurrogates(s) {
  return s.replace(LONE_SURROGATE_HIGH, "�").replace(LONE_SURROGATE_LOW, "�");
}
function sanitizeReplacer(_key, value) {
  return typeof value === "string" ? stripLoneSurrogates(value) : value;
}
function stripLoneSurrogateEscapes(s) {
  return s.replace(LONE_SURROGATE_HIGH_ESCAPE, "\\uFFFD").replace(LONE_SURROGATE_LOW_ESCAPE, "\\uFFFD");
}
function sanitizeBody(body, isJson) {
  return isJson ? stripLoneSurrogateEscapes(stripLoneSurrogates(body)) : stripLoneSurrogates(body);
}
var LONE_SURROGATE_HIGH, LONE_SURROGATE_LOW, LONE_SURROGATE_HIGH_ESCAPE, LONE_SURROGATE_LOW_ESCAPE;
var init_sanitize = __esm(() => {
  LONE_SURROGATE_HIGH = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g;
  LONE_SURROGATE_LOW = /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
  LONE_SURROGATE_HIGH_ESCAPE = /\\u[Dd][89ABab][0-9A-Fa-f]{2}(?!\\u[Dd][C-Fc-f][0-9A-Fa-f]{2})/g;
  LONE_SURROGATE_LOW_ESCAPE = /(?<!\\u[Dd][89ABab][0-9A-Fa-f]{2})\\u[Dd][C-Fc-f][0-9A-Fa-f]{2}/g;
});

// browse/src/network-capture.ts
import * as fs8 from "fs";

class SizeCappedBuffer {
  entries = [];
  totalSize = 0;
  maxSize;
  constructor(maxSize = MAX_BUFFER_SIZE) {
    this.maxSize = maxSize;
  }
  push(entry) {
    while (this.entries.length > 0 && this.totalSize + entry.size > this.maxSize) {
      const evicted = this.entries.shift();
      this.totalSize -= evicted.size;
    }
    this.entries.push(entry);
    this.totalSize += entry.size;
  }
  toArray() {
    return [...this.entries];
  }
  get length() {
    return this.entries.length;
  }
  get byteSize() {
    return this.totalSize;
  }
  clear() {
    this.entries = [];
    this.totalSize = 0;
  }
  exportToFile(filePath) {
    const lines = this.entries.map((e) => JSON.stringify(e));
    fs8.writeFileSync(filePath, lines.join(`
`) + `
`);
    return this.entries.length;
  }
  summary() {
    if (this.entries.length === 0)
      return "No captured responses.";
    const lines = this.entries.map((e, i) => `  [${i + 1}] ${e.status} ${e.url.slice(0, 100)} (${Math.round(e.size / 1024)}KB${e.bodyTruncated ? ", truncated" : ""})`);
    return `${this.entries.length} responses (${Math.round(this.totalSize / 1024)}KB total):
${lines.join(`
`)}`;
  }
}
function isCaptureActive() {
  return captureActive;
}
function getCaptureBuffer() {
  return captureBuffer;
}
function createResponseListener(filter) {
  return async (response) => {
    const url = response.url();
    if (filter && !filter.test(url))
      return;
    const status = response.status();
    if (status === 204 || status === 301 || status === 302 || status === 304)
      return;
    const contentType = response.headers()["content-type"] || "";
    let body = "";
    let bodySize = 0;
    let truncated = false;
    try {
      const rawBody = await response.body();
      bodySize = rawBody.length;
      if (bodySize > MAX_ENTRY_SIZE) {
        truncated = true;
        body = "";
      } else if (contentType.includes("json") || contentType.includes("text") || contentType.includes("xml") || contentType.includes("html")) {
        body = rawBody.toString("utf-8");
      } else {
        body = rawBody.toString("base64");
      }
    } catch {
      body = "";
      truncated = true;
    }
    const entry = {
      url,
      status,
      headers: response.headers(),
      body,
      contentType,
      timestamp: Date.now(),
      size: bodySize,
      bodyTruncated: truncated
    };
    captureBuffer.push(entry);
  };
}
function startCapture(filterPattern) {
  captureFilter = filterPattern ? new RegExp(filterPattern) : null;
  captureActive = true;
  captureListener = createResponseListener(captureFilter);
  return { filter: filterPattern || null };
}
function getCaptureListener() {
  return captureListener;
}
function stopCapture() {
  captureActive = false;
  captureListener = null;
  return {
    count: captureBuffer.length,
    sizeKB: Math.round(captureBuffer.byteSize / 1024)
  };
}
function exportCapture(filePath) {
  return captureBuffer.exportToFile(filePath);
}
var MAX_BUFFER_SIZE, MAX_ENTRY_SIZE, captureBuffer, captureActive = false, captureFilter = null, captureListener = null;
var init_network_capture = __esm(() => {
  MAX_BUFFER_SIZE = 50 * 1024 * 1024;
  MAX_ENTRY_SIZE = 5 * 1024 * 1024;
  captureBuffer = new SizeCappedBuffer;
});

// browse/src/media-extract.ts
async function extractMedia(target, options) {
  const result = await target.evaluate(({ scopeSelector, filter }) => {
    const root = scopeSelector ? document.querySelector(scopeSelector) || document : document;
    const images = [];
    const videos = [];
    const audio = [];
    const backgroundImages = [];
    if (!filter || filter === "images") {
      const imgs = root.querySelectorAll("img");
      imgs.forEach((img, i) => {
        const rect = img.getBoundingClientRect();
        images.push({
          index: i,
          src: img.src || "",
          srcset: img.srcset || "",
          currentSrc: img.currentSrc || "",
          alt: img.alt || "",
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          loading: img.loading || "",
          dataSrc: img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original") || "",
          visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        });
      });
    }
    if (!filter || filter === "videos") {
      const vids = root.querySelectorAll("video");
      vids.forEach((vid, i) => {
        const sources = Array.from(vid.querySelectorAll("source")).map((s) => ({
          src: s.src || "",
          type: s.type || ""
        }));
        const isHLS = sources.some((s) => s.type.includes("mpegURL") || s.src.includes(".m3u8"));
        const isDASH = sources.some((s) => s.type.includes("dash") || s.src.includes(".mpd"));
        videos.push({
          index: i,
          src: vid.src || "",
          currentSrc: vid.currentSrc || "",
          poster: vid.poster || "",
          width: vid.videoWidth || vid.width,
          height: vid.videoHeight || vid.height,
          duration: isFinite(vid.duration) ? vid.duration : 0,
          type: sources[0]?.type || "",
          sources,
          isHLS,
          isDASH
        });
      });
    }
    if (!filter || filter === "audio") {
      const auds = root.querySelectorAll("audio");
      auds.forEach((aud, i) => {
        const source = aud.querySelector("source");
        audio.push({
          index: i,
          src: aud.src || source?.src || "",
          currentSrc: aud.currentSrc || "",
          duration: isFinite(aud.duration) ? aud.duration : 0,
          type: source?.type || ""
        });
      });
    }
    if (!filter || filter === "images") {
      const allElements = root.querySelectorAll("*");
      let bgCount = 0;
      for (let i = 0;i < allElements.length && bgCount < 500; i++) {
        const el = allElements[i];
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") {
          const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith("data:")) {
            backgroundImages.push({
              index: bgCount,
              url: urlMatch[1],
              selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""),
              element: el.tagName.toLowerCase()
            });
            bgCount++;
          }
        }
      }
    }
    return { images, videos, audio, backgroundImages };
  }, { scopeSelector: options?.selector || null, filter: options?.filter || null });
  return {
    ...result,
    total: result.images.length + result.videos.length + result.audio.length + result.backgroundImages.length
  };
}

// browse/src/read-commands.ts
import * as fs9 from "fs";
import * as path7 from "path";
function hasAwait(code) {
  const stripped = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return /\bawait\b/.test(stripped);
}
function findBalancedClose(src, start) {
  const open = src[start];
  const close = open === "(" ? ")" : "]";
  let depth = 0;
  let inString = null;
  let escape = false;
  for (let i = start;i < src.length; i++) {
    const char = src[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\" && inString) {
      escape = true;
      continue;
    }
    if (inString) {
      if (char === inString)
        inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === open) {
      depth++;
    } else if (char === close) {
      depth--;
      if (depth === 0)
        return i;
    }
  }
  return -1;
}
function isSingleParenOrIifeExpression(code) {
  const trimmed = code.trim().replace(/;+\s*$/, "");
  let src = trimmed;
  if (src.startsWith("await ") || src.startsWith("await\t") || src.startsWith(`await
`)) {
    src = src.slice(5).trim();
  }
  if (!src.startsWith("("))
    return false;
  const mainCloseIndex = findBalancedClose(src, 0);
  if (mainCloseIndex === -1)
    return false;
  let i = mainCloseIndex + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === `
` || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "(" || ch === "[") {
      const close = findBalancedClose(src, i);
      if (close === -1)
        return false;
      i = close + 1;
      continue;
    }
    if (ch === "." || ch === "?" && src[i + 1] === ".") {
      i += ch === "." ? 1 : 2;
      while (i < src.length && /[\w$]/.test(src[i]))
        i++;
      continue;
    }
    return false;
  }
  return true;
}
function needsBlockWrapper(code) {
  const trimmed = code.trim();
  if (isSingleParenOrIifeExpression(trimmed))
    return false;
  const clean = trimmed.replace(/;+\s*$/, "");
  if (clean.split(`
`).length > 1)
    return true;
  if (/\b(const|let|var|function|class|return|throw|if|for|while|switch|try)\b/.test(clean))
    return true;
  if (clean.includes(";"))
    return true;
  return false;
}
function wrapForEvaluate(code) {
  if (!hasAwait(code))
    return code;
  const trimmed = code.trim();
  const cleanExpr = trimmed.replace(/;+\s*$/, "");
  return needsBlockWrapper(trimmed) ? `(async()=>{
${code}
})()` : `(async()=>(${cleanExpr}))()`;
}
function parseOutArgs(args) {
  let outPath;
  let raw = false;
  const rest = [];
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a === "--out") {
      if (outPath !== undefined)
        throw new Error("--out specified more than once");
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--"))
        throw new Error("--out requires a file path");
      outPath = val;
      i++;
    } else if (a.startsWith("--out=")) {
      if (outPath !== undefined)
        throw new Error("--out specified more than once");
      const val = a.slice("--out=".length);
      if (val === "")
        throw new Error("--out requires a file path");
      outPath = val;
    } else if (a === "--raw") {
      raw = true;
    } else if (a.startsWith("--raw=")) {
      const v = a.slice("--raw=".length).toLowerCase();
      if (v !== "true" && v !== "false")
        throw new Error("--raw must be true or false");
      raw = v === "true";
    } else {
      rest.push(a);
    }
  }
  return { outPath, raw, rest };
}
function hasOutArg(args) {
  return args.some((a) => a === "--out" || a.startsWith("--out="));
}
function resultToString(result) {
  return typeof result === "object" ? JSON.stringify(result, null, 2) : String(result ?? "");
}
function writeEvalResult(outPath, str, opts) {
  validateOutputPath(outPath);
  fs9.mkdirSync(path7.dirname(path7.resolve(outPath)), { recursive: true });
  if (!opts.raw && str.startsWith("data:")) {
    const comma = str.indexOf(",");
    if (comma !== -1) {
      const header = str.slice("data:".length, comma);
      const tokens = header.split(";").map((t) => t.trim().toLowerCase());
      if (tokens.includes("base64")) {
        const payload = str.slice(comma + 1).replace(/\s+/g, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
          throw new Error("--out: malformed base64 in data URL (decode would corrupt output)");
        }
        const buf = Buffer.from(payload, "base64");
        fs9.writeFileSync(outPath, buf);
        return buf.length;
      }
    }
  }
  const buf = Buffer.from(stripLoneSurrogates(str), "utf-8");
  fs9.writeFileSync(outPath, buf);
  return buf.length;
}
async function getCleanText(page) {
  const raw = await page.evaluate(() => {
    const body = document.body;
    if (!body)
      return "";
    const clone = body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
    return clone.innerText.split(`
`).map((line) => line.trim()).filter((line) => line.length > 0).join(`
`);
  });
  return stripLoneSurrogates(raw);
}
function assertJsOriginAllowed(bm, pageUrl) {
  if (!bm.hasCookieImports())
    return;
  let hostname;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return;
  }
  const importedDomains = bm.getCookieImportedDomains();
  const allowed = [...importedDomains].some((domain) => {
    const normalized = domain.startsWith(".") ? domain : "." + domain;
    return hostname === domain.replace(/^\./, "") || hostname.endsWith(normalized);
  });
  if (!allowed) {
    throw new Error(`JS execution blocked: current page (${hostname}) does not match any cookie-imported domain. ` + `Imported cookies for: ${[...importedDomains].join(", ")}. ` + `This prevents cross-origin cookie exfiltration. Navigate to an imported domain or run without imported cookies.`);
  }
}
async function handleReadCommand(command, args, session, bm) {
  const page = session.getPage();
  const target = session.getActiveFrameOrPage();
  switch (command) {
    case "text": {
      return getCleanText(target);
    }
    case "html": {
      const selector = args[0];
      if (selector) {
        const resolved = await session.resolveRef(selector);
        if ("locator" in resolved) {
          return stripLoneSurrogates(await resolved.locator.innerHTML({ timeout: 5000 }));
        }
        return stripLoneSurrogates(await target.locator(resolved.selector).innerHTML({ timeout: 5000 }));
      }
      const doctype = await target.evaluate(() => {
        const dt = document.doctype;
        return dt ? `<!DOCTYPE ${dt.name}>` : "";
      });
      const html = await target.evaluate(() => document.documentElement.outerHTML);
      return stripLoneSurrogates(doctype ? `${doctype}
${html}` : html);
    }
    case "links": {
      const links = await target.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({
        text: a.textContent?.trim().slice(0, 120) || "",
        href: a.href
      })).filter((l) => l.text && l.href));
      return links.map((l) => `${l.text} → ${l.href}`).join(`
`);
    }
    case "forms": {
      const forms = await target.evaluate(() => {
        return [...document.querySelectorAll("form")].map((form, i) => {
          const fields = [...form.querySelectorAll("input, select, textarea")].map((el) => {
            const input = el;
            return {
              tag: el.tagName.toLowerCase(),
              type: input.type || undefined,
              name: input.name || undefined,
              id: input.id || undefined,
              placeholder: input.placeholder || undefined,
              required: input.required || undefined,
              value: input.type === "password" || input.name && /(^|[_.-])(token|secret|key|password|credential|auth|jwt|session|csrf|sid)($|[_.-])|api.?key/i.test(input.name) || input.id && /(^|[_.-])(token|secret|key|password|credential|auth|jwt|session|csrf|sid)($|[_.-])|api.?key/i.test(input.id) ? "[redacted]" : input.value || undefined,
              options: el.tagName === "SELECT" ? [...el.options].map((o) => ({ value: o.value, text: o.text })) : undefined
            };
          });
          return {
            index: i,
            action: form.action || undefined,
            method: form.method || "get",
            id: form.id || undefined,
            fields
          };
        });
      });
      return JSON.stringify(forms, null, 2);
    }
    case "accessibility": {
      const snapshot = await target.locator("body").ariaSnapshot();
      return stripLoneSurrogates(snapshot);
    }
    case "js": {
      const { outPath, raw, rest } = parseOutArgs(args);
      const expr = rest[0];
      if (!expr)
        throw new Error("Usage: browse js <expression> [--out <file>] [--raw]");
      assertJsOriginAllowed(bm, page.url());
      const wrapped = wrapForEvaluate(expr);
      const result = await target.evaluate(wrapped);
      const str = resultToString(result);
      if (outPath) {
        const n = writeEvalResult(outPath, str, { raw });
        return `JS result written: ${outPath} (${n} bytes)`;
      }
      return str;
    }
    case "eval": {
      const { outPath, raw, rest } = parseOutArgs(args);
      const filePath = rest[0];
      if (!filePath)
        throw new Error("Usage: browse eval <js-file> [--out <file>] [--raw]");
      assertJsOriginAllowed(bm, page.url());
      validateReadPath(filePath);
      if (!fs9.existsSync(filePath))
        throw new Error(`File not found: ${filePath}`);
      const code = fs9.readFileSync(filePath, "utf-8");
      const wrapped = wrapForEvaluate(code);
      const result = await target.evaluate(wrapped);
      const str = resultToString(result);
      if (outPath) {
        const n = writeEvalResult(outPath, str, { raw });
        return `Eval result written: ${outPath} (${n} bytes)`;
      }
      return str;
    }
    case "css": {
      const [selector, property] = args;
      if (!selector || !property)
        throw new Error("Usage: browse css <selector> <property>");
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        const value = await resolved.locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
        return value;
      }
      const value = await target.evaluate(([sel, prop]) => {
        const el = document.querySelector(sel);
        if (!el)
          return `Element not found: ${sel}`;
        return getComputedStyle(el).getPropertyValue(prop);
      }, [resolved.selector, property]);
      return value;
    }
    case "attrs": {
      const selector = args[0];
      if (!selector)
        throw new Error("Usage: browse attrs <selector>");
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        const attrs = await resolved.locator.evaluate((el) => {
          const result = {};
          for (const attr of el.attributes) {
            result[attr.name] = attr.value;
          }
          return result;
        });
        return JSON.stringify(attrs, null, 2);
      }
      const attrs = await target.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el)
          return `Element not found: ${sel}`;
        const result = {};
        for (const attr of el.attributes) {
          result[attr.name] = attr.value;
        }
        return result;
      }, resolved.selector);
      return typeof attrs === "string" ? attrs : JSON.stringify(attrs, null, 2);
    }
    case "console": {
      if (args[0] === "--clear") {
        consoleBuffer.clear();
        return "Console buffer cleared.";
      }
      const entries = args[0] === "--errors" ? consoleBuffer.toArray().filter((e) => e.level === "error" || e.level === "warning") : consoleBuffer.toArray();
      if (entries.length === 0)
        return args[0] === "--errors" ? "(no console errors)" : "(no console messages)";
      return entries.map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.level}] ${e.text}`).join(`
`);
    }
    case "network": {
      if (args[0] === "--clear") {
        networkBuffer.clear();
        return "Network buffer cleared.";
      }
      if (args[0] === "--capture") {
        await Promise.resolve().then(() => init_network_capture());
        if (args[1] === "stop") {
          const page = bm.getPage();
          const listener = getCaptureListener();
          if (listener)
            page.removeListener("response", listener);
          const result = stopCapture();
          return `Network capture stopped. ${result.count} responses captured (${result.sizeKB}KB).`;
        }
        if (isCaptureActive())
          return "Capture already active. Use --capture stop first.";
        const filterIdx = args.indexOf("--filter");
        const filterPattern = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
        const info = startCapture(filterPattern);
        const page = bm.getPage();
        const listener = getCaptureListener();
        if (listener)
          page.on("response", listener);
        return `Network capture started${info.filter ? ` (filter: ${info.filter})` : ""}. Use --capture stop to stop.`;
      }
      if (args[0] === "--export") {
        await Promise.resolve().then(() => init_network_capture());
        await Promise.resolve().then(() => init_path_security());
        const exportPath = args[1];
        if (!exportPath)
          throw new Error("Usage: network --export <path>");
        validateOutputPath(exportPath);
        const count = exportCapture(exportPath);
        return `Exported ${count} captured responses to ${exportPath}`;
      }
      if (args[0] === "--bodies") {
        await Promise.resolve().then(() => init_network_capture());
        return getCaptureBuffer().summary();
      }
      if (networkBuffer.length === 0)
        return "(no network requests)";
      return networkBuffer.toArray().map((e) => `${e.method} ${e.url} → ${e.status || "pending"} (${e.duration || "?"}ms, ${e.size || "?"}B)`).join(`
`);
    }
    case "dialog": {
      if (args[0] === "--clear") {
        dialogBuffer.clear();
        return "Dialog buffer cleared.";
      }
      if (dialogBuffer.length === 0)
        return "(no dialogs captured)";
      return dialogBuffer.toArray().map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.type}] "${e.message}" → ${e.action}${e.response ? ` "${e.response}"` : ""}`).join(`
`);
    }
    case "is": {
      const property = args[0];
      const selector = args[1];
      if (!property || !selector)
        throw new Error(`Usage: browse is <property> <selector>
Properties: visible, hidden, enabled, disabled, checked, editable, focused`);
      const resolved = await session.resolveRef(selector);
      let locator;
      if ("locator" in resolved) {
        locator = resolved.locator;
      } else {
        locator = target.locator(resolved.selector);
      }
      switch (property) {
        case "visible":
          return String(await locator.isVisible());
        case "hidden":
          return String(await locator.isHidden());
        case "enabled":
          return String(await locator.isEnabled());
        case "disabled":
          return String(await locator.isDisabled());
        case "checked":
          return String(await locator.isChecked());
        case "editable":
          return String(await locator.isEditable());
        case "focused": {
          const isFocused = await locator.evaluate((el) => el === document.activeElement);
          return String(isFocused);
        }
        default:
          throw new Error(`Unknown property: ${property}. Use: visible, hidden, enabled, disabled, checked, editable, focused`);
      }
    }
    case "cookies": {
      const cookies = await page.context().cookies();
      const redacted = cookies.map((c) => {
        if (SENSITIVE_COOKIE_NAME.test(c.name) || SENSITIVE_COOKIE_VALUE.test(c.value)) {
          return { ...c, value: `[REDACTED — ${c.value.length} chars]` };
        }
        return c;
      });
      return JSON.stringify(redacted, null, 2);
    }
    case "storage": {
      if (args[0] === "set" && args[1]) {
        const key = args[1];
        const value = args[2] || "";
        await target.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
        return `Set localStorage["${key}"]`;
      }
      const storage = await target.evaluate(() => ({
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      }));
      const SENSITIVE_KEY = /(^|[_.-])(token|secret|key|password|credential|auth|jwt|session|csrf)($|[_.-])|api.?key/i;
      const SENSITIVE_VALUE = /^(eyJ|sk-|sk_live_|sk_test_|pk_live_|pk_test_|rk_live_|sk-ant-|ghp_|gho_|github_pat_|xox[bpsa]-|AKIA[A-Z0-9]{16}|AIza|SG\.|Bearer\s|sbp_)/;
      const redacted = JSON.parse(JSON.stringify(storage));
      for (const storeType of ["localStorage", "sessionStorage"]) {
        const store = redacted[storeType];
        if (!store)
          continue;
        for (const [key, value] of Object.entries(store)) {
          if (typeof value !== "string")
            continue;
          if (SENSITIVE_KEY.test(key) || SENSITIVE_VALUE.test(value)) {
            store[key] = `[REDACTED — ${value.length} chars]`;
          }
        }
      }
      return JSON.stringify(redacted, null, 2);
    }
    case "perf": {
      const timings = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        if (!nav)
          return "No navigation timing data available.";
        return {
          dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          tcp: Math.round(nav.connectEnd - nav.connectStart),
          ssl: Math.round(nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0),
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          download: Math.round(nav.responseEnd - nav.responseStart),
          domParse: Math.round(nav.domInteractive - nav.responseEnd),
          domReady: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          load: Math.round(nav.loadEventEnd - nav.startTime),
          total: Math.round(nav.loadEventEnd - nav.startTime)
        };
      });
      if (typeof timings === "string")
        return timings;
      return Object.entries(timings).map(([k, v]) => `${k.padEnd(12)} ${v}ms`).join(`
`);
    }
    case "inspect": {
      let includeUA = false;
      let showHistory = false;
      let selector;
      for (const arg of args) {
        if (arg === "--all") {
          includeUA = true;
        } else if (arg === "--history") {
          showHistory = true;
        } else if (!selector) {
          selector = arg;
        }
      }
      if (showHistory) {
        const history = getModificationHistory();
        if (history.length === 0)
          return "(no style modifications)";
        return history.map((m, i) => `[${i}] ${m.selector} { ${m.property}: ${m.oldValue} → ${m.newValue} } (${m.source}, ${m.method})`).join(`
`);
      }
      if (!selector) {
        const stored = bm._inspectorData;
        const storedTs = bm._inspectorTimestamp;
        if (stored) {
          const stale = storedTs && Date.now() - storedTs > 60000;
          let output = formatInspectorResult(stored, { includeUA });
          if (stale)
            output = `⚠ Data may be stale (>60s old)

` + output;
          return output;
        }
        throw new Error(`Usage: browse inspect [selector] [--all] [--history]
Or pick an element in the Chrome sidebar first.`);
      }
      const result = await inspectElement(page, selector, { includeUA });
      bm._inspectorData = result;
      bm._inspectorTimestamp = Date.now();
      return formatInspectorResult(result, { includeUA });
    }
    case "media": {
      await Promise.resolve();
      const target = bm.getActiveFrameOrPage();
      const filter = args.includes("--images") ? "images" : args.includes("--videos") ? "videos" : args.includes("--audio") ? "audio" : undefined;
      const selectorArg = args.find((a) => !a.startsWith("--"));
      const result = await extractMedia(target, { selector: selectorArg, filter });
      return JSON.stringify(result, null, 2);
    }
    case "data": {
      const target = bm.getActiveFrameOrPage();
      const wantJsonLd = args.includes("--jsonld") || args.length === 0;
      const wantOg = args.includes("--og") || args.length === 0;
      const wantTwitter = args.includes("--twitter") || args.length === 0;
      const wantMeta = args.includes("--meta") || args.length === 0;
      const result = await target.evaluate(({ wantJsonLd, wantOg, wantTwitter, wantMeta }) => {
        const data = {};
        if (wantJsonLd) {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          const jsonLd = [];
          scripts.forEach((s) => {
            try {
              jsonLd.push(JSON.parse(s.textContent || ""));
            } catch {}
          });
          data.jsonLd = jsonLd;
        }
        if (wantOg) {
          const og = {};
          document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
            const prop = m.getAttribute("property")?.replace("og:", "") || "";
            og[prop] = m.getAttribute("content") || "";
          });
          data.openGraph = og;
        }
        if (wantTwitter) {
          const tw = {};
          document.querySelectorAll('meta[name^="twitter:"]').forEach((m) => {
            const name = m.getAttribute("name")?.replace("twitter:", "") || "";
            tw[name] = m.getAttribute("content") || "";
          });
          data.twitterCards = tw;
        }
        if (wantMeta) {
          const meta = {};
          const canonical = document.querySelector('link[rel="canonical"]');
          if (canonical)
            meta.canonical = canonical.getAttribute("href") || "";
          const desc = document.querySelector('meta[name="description"]');
          if (desc)
            meta.description = desc.getAttribute("content") || "";
          const keywords = document.querySelector('meta[name="keywords"]');
          if (keywords)
            meta.keywords = keywords.getAttribute("content") || "";
          const author = document.querySelector('meta[name="author"]');
          if (author)
            meta.author = author.getAttribute("content") || "";
          const title = document.querySelector("title");
          if (title)
            meta.title = title.textContent || "";
          data.meta = meta;
        }
        return data;
      }, { wantJsonLd, wantOg, wantTwitter, wantMeta });
      return JSON.stringify(result, null, 2);
    }
    default:
      throw new Error(`Unknown read command: ${command}`);
  }
}
var SENSITIVE_COOKIE_NAME, SENSITIVE_COOKIE_VALUE;
var init_read_commands = __esm(() => {
  init_buffers();
  init_cdp_inspector();
  init_path_security();
  init_sanitize();
  init_path_security();
  SENSITIVE_COOKIE_NAME = /(^|[_.-])(token|secret|key|password|credential|auth|jwt|session|csrf|sid)($|[_.-])|api.?key/i;
  SENSITIVE_COOKIE_VALUE = /^(eyJ|sk-|sk_live_|sk_test_|pk_live_|pk_test_|rk_live_|sk-ant-|ghp_|gho_|github_pat_|xox[bpsa]-|AKIA[A-Z0-9]{16}|AIza|SG\.|Bearer\s|sbp_)/;
});

// browse/src/cookie-import-browser.ts
const Database = null; // bun:sqlite stubbed on Node
import * as crypto from "crypto";
import * as fs10 from "fs";
import * as path8 from "path";
import * as os7 from "os";
function findInstalledBrowsers() {
  return BROWSER_REGISTRY.filter((browser) => {
    if (findBrowserMatch(browser, "Default") !== null)
      return true;
    for (const platform of getSearchPlatforms()) {
      const dataDir = getDataDirForPlatform(browser, platform);
      if (!dataDir)
        continue;
      const browserDir = path8.join(getBaseDir(platform), dataDir);
      try {
        const entries = fs10.readdirSync(browserDir, { withFileTypes: true });
        if (entries.some((e) => {
          if (!e.isDirectory() || !e.name.startsWith("Profile "))
            return false;
          const profileDir = path8.join(browserDir, e.name);
          return fs10.existsSync(path8.join(profileDir, "Cookies")) || platform === "win32" && fs10.existsSync(path8.join(profileDir, "Network", "Cookies"));
        }))
          return true;
      } catch {}
    }
    return false;
  });
}
function listSupportedBrowserNames() {
  const hostPlatform = getHostPlatform();
  return BROWSER_REGISTRY.filter((browser) => hostPlatform ? getDataDirForPlatform(browser, hostPlatform) !== null : true).map((browser) => browser.name);
}
function listProfiles(browserName) {
  const browser = resolveBrowser(browserName);
  const profiles = [];
  for (const platform of getSearchPlatforms()) {
    const dataDir = getDataDirForPlatform(browser, platform);
    if (!dataDir)
      continue;
    const browserDir = path8.join(getBaseDir(platform), dataDir);
    if (!fs10.existsSync(browserDir))
      continue;
    let entries;
    try {
      entries = fs10.readdirSync(browserDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      if (entry.name !== "Default" && !entry.name.startsWith("Profile "))
        continue;
      const cookieCandidates = platform === "win32" ? [path8.join(browserDir, entry.name, "Network", "Cookies"), path8.join(browserDir, entry.name, "Cookies")] : [path8.join(browserDir, entry.name, "Cookies")];
      if (!cookieCandidates.some((p) => fs10.existsSync(p)))
        continue;
      if (profiles.some((p) => p.name === entry.name))
        continue;
      let displayName = entry.name;
      try {
        const prefsPath = path8.join(browserDir, entry.name, "Preferences");
        if (fs10.existsSync(prefsPath)) {
          const prefs = JSON.parse(fs10.readFileSync(prefsPath, "utf-8"));
          const email = prefs?.account_info?.[0]?.email;
          if (email && typeof email === "string") {
            displayName = email;
          } else {
            const profileName = prefs?.profile?.name;
            if (profileName && typeof profileName === "string") {
              displayName = profileName;
            }
          }
        }
      } catch {}
      profiles.push({ name: entry.name, displayName });
    }
    if (profiles.length > 0)
      break;
  }
  return profiles;
}
function listDomains(browserName, profile = "Default") {
  const browser = resolveBrowser(browserName);
  const match = getBrowserMatch(browser, profile);
  const db = openDb(match.dbPath, browser.name);
  try {
    const now = chromiumNow();
    const rows = db.query(`SELECT host_key AS domain, COUNT(*) AS count
       FROM cookies
       WHERE has_expires = 0 OR expires_utc > ?
       GROUP BY host_key
       ORDER BY count DESC`).all(now);
    return { domains: rows, browser: browser.name };
  } finally {
    db.close();
  }
}
async function importCookies(browserName, domains, profile = "Default") {
  if (domains.length === 0)
    return { cookies: [], count: 0, failed: 0, domainCounts: {} };
  const browser = resolveBrowser(browserName);
  const match = getBrowserMatch(browser, profile);
  const derivedKeys = await getDerivedKeys(match);
  const db = openDb(match.dbPath, browser.name);
  try {
    const now = chromiumNow();
    const placeholders = domains.map(() => "?").join(",");
    const rows = db.query(`SELECT host_key, name, value, encrypted_value, path, expires_utc,
              is_secure, is_httponly, has_expires, samesite
       FROM cookies
       WHERE host_key IN (${placeholders})
         AND (has_expires = 0 OR expires_utc > ?)
       ORDER BY host_key, name`).all(...domains, now);
    const cookies = [];
    let failed = 0;
    const domainCounts = {};
    for (const row of rows) {
      try {
        const value = decryptCookieValue(row, derivedKeys, match.platform);
        const cookie = toPlaywrightCookie(row, value);
        cookies.push(cookie);
        domainCounts[row.host_key] = (domainCounts[row.host_key] || 0) + 1;
      } catch {
        failed++;
      }
    }
    return { cookies, count: cookies.length, failed, domainCounts };
  } finally {
    db.close();
  }
}
function resolveBrowser(nameOrAlias) {
  const needle = nameOrAlias.toLowerCase().trim();
  const found = BROWSER_REGISTRY.find((b) => b.aliases.includes(needle) || b.name.toLowerCase() === needle);
  if (!found) {
    const supported = BROWSER_REGISTRY.flatMap((b) => b.aliases).join(", ");
    throw new CookieImportError(`Unknown browser '${nameOrAlias}'. Supported: ${supported}`, "unknown_browser");
  }
  return found;
}
function validateProfile(profile) {
  if (/[/\\]|\.\./.test(profile) || /[\x00-\x1f]/.test(profile)) {
    throw new CookieImportError(`Invalid profile name: '${profile}'`, "bad_request");
  }
}
function getHostPlatform() {
  const p = process.platform;
  if (p === "darwin" || p === "linux" || p === "win32")
    return p;
  return null;
}
function getSearchPlatforms() {
  const current = getHostPlatform();
  const order = [];
  if (current)
    order.push(current);
  for (const platform of ["darwin", "linux", "win32"]) {
    if (!order.includes(platform))
      order.push(platform);
  }
  return order;
}
function getDataDirForPlatform(browser, platform) {
  if (platform === "darwin")
    return browser.dataDir;
  if (platform === "linux")
    return browser.linuxDataDir || null;
  return browser.windowsDataDir || null;
}
function getBaseDir(platform) {
  if (platform === "darwin")
    return path8.join(os7.homedir(), "Library", "Application Support");
  if (platform === "win32")
    return path8.join(os7.homedir(), "AppData", "Local");
  return path8.join(os7.homedir(), ".config");
}
function findBrowserMatch(browser, profile) {
  validateProfile(profile);
  for (const platform of getSearchPlatforms()) {
    const dataDir = getDataDirForPlatform(browser, platform);
    if (!dataDir)
      continue;
    const baseProfile = path8.join(getBaseDir(platform), dataDir, profile);
    const candidates = platform === "win32" ? [path8.join(baseProfile, "Network", "Cookies"), path8.join(baseProfile, "Cookies")] : [path8.join(baseProfile, "Cookies")];
    for (const dbPath of candidates) {
      try {
        if (fs10.existsSync(dbPath)) {
          return { browser, platform, dbPath };
        }
      } catch {}
    }
  }
  return null;
}
function getBrowserMatch(browser, profile) {
  const match = findBrowserMatch(browser, profile);
  if (match)
    return match;
  const attempted = getSearchPlatforms().map((platform) => {
    const dataDir = getDataDirForPlatform(browser, platform);
    return dataDir ? path8.join(getBaseDir(platform), dataDir, profile, "Cookies") : null;
  }).filter((entry) => entry !== null);
  throw new CookieImportError(`${browser.name} is not installed (no cookie database at ${attempted.join(" or ")})`, "not_installed");
}
function openDb(dbPath, browserName) {
  if (process.platform === "win32") {
    return openDbFromCopy(dbPath, browserName);
  }
  try {
    return new Database(dbPath, { readonly: true });
  } catch (err) {
    if (err.message?.includes("SQLITE_BUSY") || err.message?.includes("database is locked")) {
      return openDbFromCopy(dbPath, browserName);
    }
    if (err.message?.includes("SQLITE_CORRUPT") || err.message?.includes("malformed")) {
      throw new CookieImportError(`Cookie database for ${browserName} is corrupt`, "db_corrupt");
    }
    throw err;
  }
}
function openDbFromCopy(dbPath, browserName) {
  const tmpPath = path8.join(os7.tmpdir(), `browse-cookies-${browserName.toLowerCase()}-${crypto.randomUUID()}.db`);
  try {
    fs10.copyFileSync(dbPath, tmpPath);
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs10.existsSync(walPath))
      fs10.copyFileSync(walPath, tmpPath + "-wal");
    if (fs10.existsSync(shmPath))
      fs10.copyFileSync(shmPath, tmpPath + "-shm");
    const db = new Database(tmpPath, { readonly: true });
    const origClose = db.close.bind(db);
    db.close = () => {
      origClose();
      try {
        fs10.unlinkSync(tmpPath);
      } catch {}
      try {
        fs10.unlinkSync(tmpPath + "-wal");
      } catch {}
      try {
        fs10.unlinkSync(tmpPath + "-shm");
      } catch {}
    };
    return db;
  } catch {
    try {
      fs10.unlinkSync(tmpPath);
    } catch {}
    throw new CookieImportError(`Cookie database is locked (${browserName} may be running). Try closing ${browserName} first.`, "db_locked", "retry");
  }
}
function deriveKey(password, iterations) {
  return crypto.pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1");
}
function getCachedDerivedKey(cacheKey, password, iterations) {
  const cached = keyCache.get(cacheKey);
  if (cached)
    return cached;
  const derived = deriveKey(password, iterations);
  keyCache.set(cacheKey, derived);
  return derived;
}
async function getDerivedKeys(match) {
  if (match.platform === "darwin") {
    const password = await getMacKeychainPassword(match.browser.keychainService);
    return new Map([
      ["v10", getCachedDerivedKey(`darwin:${match.browser.keychainService}:v10`, password, 1003)]
    ]);
  }
  if (match.platform === "win32") {
    const key = await getWindowsAesKey(match.browser);
    return new Map([["v10", key]]);
  }
  const keys = new Map;
  keys.set("v10", getCachedDerivedKey("linux:v10", "peanuts", 1));
  const linuxPassword = await getLinuxSecretPassword(match.browser);
  if (linuxPassword) {
    keys.set("v11", getCachedDerivedKey(`linux:${match.browser.keychainService}:v11`, linuxPassword, 1));
  }
  return keys;
}
async function getWindowsAesKey(browser) {
  const cacheKey = `win32:${browser.keychainService}`;
  const cached = keyCache.get(cacheKey);
  if (cached)
    return cached;
  const platform = "win32";
  const dataDir = getDataDirForPlatform(browser, platform);
  if (!dataDir)
    throw new CookieImportError(`No Windows data dir for ${browser.name}`, "not_installed");
  const localStatePath = path8.join(getBaseDir(platform), dataDir, "Local State");
  let localState;
  try {
    localState = JSON.parse(fs10.readFileSync(localStatePath, "utf-8"));
  } catch (err) {
    const reason = err instanceof Error ? `: ${err.message}` : "";
    throw new CookieImportError(`Cannot read Local State for ${browser.name} at ${localStatePath}${reason}`, "keychain_error");
  }
  const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) {
    throw new CookieImportError(`No encrypted key in Local State for ${browser.name}`, "keychain_not_found");
  }
  const encryptedKey = Buffer.from(encryptedKeyB64, "base64").slice(5);
  const key = await dpapiDecrypt(encryptedKey);
  keyCache.set(cacheKey, key);
  return key;
}
async function dpapiDecrypt(encryptedBytes) {
  const script = [
    "Add-Type -AssemblyName System.Security",
    "$stdin = [Console]::In.ReadToEnd().Trim()",
    "$bytes = [System.Convert]::FromBase64String($stdin)",
    "$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "Write-Output ([System.Convert]::ToBase64String($dec))"
  ].join("; ");
  const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", script], {
    windowsHide: true,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });
  proc.stdin.write(encryptedBytes.toString("base64"));
  proc.stdin.end();
  const timeout = new Promise((_, reject) => setTimeout(() => {
    proc.kill();
    reject(new CookieImportError("DPAPI decryption timed out", "keychain_timeout", "retry"));
  }, 1e4));
  try {
    const exitCode = await Promise.race([proc.exited, timeout]);
    const stdout = await new Response(proc.stdout).text();
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new CookieImportError(`DPAPI decryption failed: ${stderr.trim()}`, "keychain_error");
    }
    return Buffer.from(stdout.trim(), "base64");
  } catch (err) {
    if (err instanceof CookieImportError)
      throw err;
    throw new CookieImportError(`DPAPI decryption failed: ${err.message}`, "keychain_error");
  }
}
async function getMacKeychainPassword(service) {
  const proc = Bun.spawn(["security", "find-generic-password", "-s", service, "-w"], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  const timeout = new Promise((_, reject) => setTimeout(() => {
    proc.kill();
    reject(new CookieImportError(`macOS is waiting for Keychain permission. Look for a dialog asking to allow access to "${service}".`, "keychain_timeout", "retry"));
  }, 1e4));
  try {
    const exitCode = await Promise.race([proc.exited, timeout]);
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    if (exitCode !== 0) {
      const errText = stderr.trim().toLowerCase();
      if (errText.includes("user canceled") || errText.includes("denied") || errText.includes("interaction not allowed")) {
        throw new CookieImportError(`Keychain access denied. Click "Allow" in the macOS dialog for "${service}".`, "keychain_denied", "retry");
      }
      if (errText.includes("could not be found") || errText.includes("not found")) {
        throw new CookieImportError(`No Keychain entry for "${service}". Is this a Chromium-based browser?`, "keychain_not_found");
      }
      throw new CookieImportError(`Could not read Keychain: ${stderr.trim()}`, "keychain_error", "retry");
    }
    return stdout.trim();
  } catch (err) {
    if (err instanceof CookieImportError)
      throw err;
    throw new CookieImportError(`Could not read Keychain: ${err.message}`, "keychain_error", "retry");
  }
}
async function getLinuxSecretPassword(browser) {
  const attempts = [
    ["secret-tool", "lookup", "Title", browser.keychainService]
  ];
  if (browser.linuxApplication) {
    attempts.push(["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password_v2", "application", browser.linuxApplication], ["secret-tool", "lookup", "xdg:schema", "chrome_libsecret_os_crypt_password", "application", browser.linuxApplication]);
  }
  for (const cmd of attempts) {
    const password = await runPasswordLookup(cmd, 3000);
    if (password)
      return password;
  }
  return null;
}
async function runPasswordLookup(cmd, timeoutMs) {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", windowsHide: true });
    const timeout = new Promise((_, reject) => setTimeout(() => {
      proc.kill();
      reject(new Error("timeout"));
    }, timeoutMs));
    const exitCode = await Promise.race([proc.exited, timeout]);
    const stdout = await new Response(proc.stdout).text();
    if (exitCode !== 0)
      return null;
    const password = stdout.trim();
    return password.length > 0 ? password : null;
  } catch {
    return null;
  }
}
function decryptCookieValue(row, keys, platform) {
  if (row.value && row.value.length > 0)
    return row.value;
  const ev = Buffer.from(row.encrypted_value);
  if (ev.length === 0)
    return "";
  const prefix = ev.slice(0, 3).toString("utf-8");
  if (prefix === "v20")
    throw new CookieImportError("Cookie uses App-Bound Encryption (v20). Use CDP extraction instead.", "v20_encryption");
  const key = keys.get(prefix);
  if (!key)
    throw new Error(`No decryption key available for ${prefix} cookies`);
  if (platform === "win32" && prefix === "v10") {
    const nonce = ev.slice(3, 15);
    const tag = ev.slice(ev.length - 16);
    const ciphertext = ev.slice(15, ev.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
  }
  const ciphertext = ev.slice(3);
  const iv = Buffer.alloc(16, 32);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (plaintext.length <= 32)
    return "";
  return plaintext.slice(32).toString("utf-8");
}
function toPlaywrightCookie(row, value) {
  return {
    name: row.name,
    value,
    domain: row.host_key,
    path: row.path || "/",
    expires: chromiumEpochToUnix(row.expires_utc, row.has_expires),
    secure: row.is_secure === 1,
    httpOnly: row.is_httponly === 1,
    sameSite: mapSameSite(row.samesite)
  };
}
function chromiumNow() {
  return BigInt(Date.now()) * 1000n + CHROMIUM_EPOCH_OFFSET;
}
function chromiumEpochToUnix(epoch, hasExpires) {
  if (hasExpires === 0 || epoch === 0 || epoch === 0n)
    return -1;
  const epochBig = BigInt(epoch);
  const unixMicro = epochBig - CHROMIUM_EPOCH_OFFSET;
  return Number(unixMicro / 1000000n);
}
function mapSameSite(value) {
  switch (value) {
    case 0:
      return "None";
    case 1:
      return "Lax";
    case 2:
      return "Strict";
    default:
      return "Lax";
  }
}
function findBrowserExe(browserName) {
  const candidates = browserName.toLowerCase().includes("edge") ? EDGE_PATHS_WIN : CHROME_PATHS_WIN;
  for (const p of candidates) {
    if (fs10.existsSync(p))
      return p;
  }
  return null;
}
function isBrowserRunning(browserName) {
  const exe = browserName.toLowerCase().includes("edge") ? "msedge.exe" : "chrome.exe";
  return new Promise((resolve) => {
    const proc = Bun.spawn(["tasklist", "/FI", `IMAGENAME eq ${exe}`, "/NH"], {
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true
    });
    proc.exited.then(async () => {
      const out = await new Response(proc.stdout).text();
      resolve(out.toLowerCase().includes(exe));
    }).catch(() => resolve(false));
  });
}
async function importCookiesViaCdp(browserName, domains, profile = "Default") {
  if (domains.length === 0)
    return { cookies: [], count: 0, failed: 0, domainCounts: {} };
  if (process.platform !== "win32") {
    throw new CookieImportError("CDP extraction is only needed on Windows", "not_supported");
  }
  const browser = resolveBrowser(browserName);
  const exePath = findBrowserExe(browser.name);
  if (!exePath) {
    throw new CookieImportError(`Cannot find ${browser.name} executable. Install it or use /connect-chrome.`, "not_installed");
  }
  if (await isBrowserRunning(browser.name)) {
    throw new CookieImportError(`${browser.name} is running. Close it first so we can launch headless with your profile, or use /connect-chrome to control your real browser directly.`, "browser_running", "retry");
  }
  const dataDir = getDataDirForPlatform(browser, "win32");
  if (!dataDir)
    throw new CookieImportError(`No Windows data dir for ${browser.name}`, "not_installed");
  const userDataDir = path8.join(getBaseDir("win32"), dataDir);
  const debugPort = 9222 + Math.floor(Math.random() * 100);
  const chromeProc = Bun.spawn([
    exePath,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--no-default-browser-check"
  ], { stdout: "pipe", stderr: "pipe", windowsHide: true });
  let wsUrl = null;
  const startTime = Date.now();
  let loggedVersion = false;
  while (Date.now() - startTime < 15000) {
    try {
      if (!loggedVersion) {
        try {
          const versionResp = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
          if (versionResp.ok) {
            const v = await versionResp.json();
            console.log(`[cookie-import] CDP fallback: ${browser.name} ${v.Browser || "unknown version"}`);
            loggedVersion = true;
          }
        } catch {}
      }
      const resp = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (resp.ok) {
        const targets = await resp.json();
        const page = targets.find((t) => t.type === "page");
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!wsUrl) {
    chromeProc.kill();
    throw new CookieImportError(`${browser.name} headless did not start within 15s`, "cdp_timeout", "retry");
  }
  try {
    const cookies = await extractCookiesViaCdp(wsUrl, domains);
    const domainCounts = {};
    for (const c of cookies) {
      domainCounts[c.domain] = (domainCounts[c.domain] || 0) + 1;
    }
    return { cookies, count: cookies.length, failed: 0, domainCounts };
  } finally {
    chromeProc.kill();
  }
}
async function extractCookiesViaCdp(wsUrl, domains) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new CookieImportError("CDP cookie extraction timed out", "cdp_timeout"));
    }, 1e4);
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: msgId++, method: "Network.enable" }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id === 1 && !data.error) {
        ws.send(JSON.stringify({ id: msgId, method: "Network.getAllCookies" }));
        return;
      }
      if (data.id === msgId && data.result?.cookies) {
        clearTimeout(timeout);
        ws.close();
        const domainSet = new Set;
        for (const d of domains) {
          domainSet.add(d);
          domainSet.add(d.startsWith(".") ? d.slice(1) : "." + d);
        }
        const matched = [];
        for (const c of data.result.cookies) {
          if (!domainSet.has(c.domain))
            continue;
          matched.push({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || "/",
            expires: c.expires === -1 ? -1 : c.expires,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: cdpSameSite(c.sameSite)
          });
        }
        resolve(matched);
      } else if (data.id === msgId && data.error) {
        clearTimeout(timeout);
        ws.close();
        reject(new CookieImportError(`CDP error: ${data.error.message}`, "cdp_error"));
      }
    };
    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new CookieImportError(`CDP WebSocket error: ${err.message || "unknown"}`, "cdp_error"));
    };
  });
}
function cdpSameSite(value) {
  switch (value) {
    case "Strict":
      return "Strict";
    case "Lax":
      return "Lax";
    case "None":
      return "None";
    default:
      return "Lax";
  }
}
function hasV20Cookies(browserName, profile = "Default") {
  if (process.platform !== "win32")
    return false;
  try {
    const browser = resolveBrowser(browserName);
    const match = getBrowserMatch(browser, profile);
    const db = openDb(match.dbPath, browser.name);
    try {
      const rows = db.query("SELECT encrypted_value FROM cookies LIMIT 10").all();
      return rows.some((row) => {
        const ev = Buffer.from(row.encrypted_value);
        return ev.length >= 3 && ev.slice(0, 3).toString("utf-8") === "v20";
      });
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
var CookieImportError, BROWSER_REGISTRY, keyCache, CHROMIUM_EPOCH_OFFSET = 11644473600000000n, CHROME_PATHS_WIN, EDGE_PATHS_WIN;
var init_cookie_import_browser = __esm(() => {
  CookieImportError = class CookieImportError extends Error {
    code;
    action;
    constructor(message, code, action) {
      super(message);
      this.code = code;
      this.action = action;
      this.name = "CookieImportError";
    }
  };
  BROWSER_REGISTRY = [
    { name: "Comet", dataDir: "Comet/", keychainService: "Comet Safe Storage", aliases: ["comet", "perplexity"] },
    { name: "Chrome", dataDir: "Google/Chrome/", keychainService: "Chrome Safe Storage", aliases: ["chrome", "google-chrome", "google-chrome-stable"], linuxDataDir: "google-chrome/", linuxApplication: "chrome", windowsDataDir: "Google/Chrome/User Data/" },
    { name: "Chromium", dataDir: "chromium/", keychainService: "Chromium Safe Storage", aliases: ["chromium"], linuxDataDir: "chromium/", linuxApplication: "chromium", windowsDataDir: "Chromium/User Data/" },
    { name: "Arc", dataDir: "Arc/User Data/", keychainService: "Arc Safe Storage", aliases: ["arc"] },
    { name: "Brave", dataDir: "BraveSoftware/Brave-Browser/", keychainService: "Brave Safe Storage", aliases: ["brave"], linuxDataDir: "BraveSoftware/Brave-Browser/", linuxApplication: "brave", windowsDataDir: "BraveSoftware/Brave-Browser/User Data/" },
    { name: "Edge", dataDir: "Microsoft Edge/", keychainService: "Microsoft Edge Safe Storage", aliases: ["edge"], linuxDataDir: "microsoft-edge/", linuxApplication: "microsoft-edge", windowsDataDir: "Microsoft/Edge/User Data/" }
  ];
  keyCache = new Map;
  CHROME_PATHS_WIN = [
    path8.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path8.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe")
  ];
  EDGE_PATHS_WIN = [
    path8.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
    path8.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe")
  ];
});

// browse/src/cookie-picker-ui.ts
function getCookiePickerHTML(serverPort) {
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cookie Import — gstack browse</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0a;
    color: #e0e0e0;
    height: 100vh;
    overflow: hidden;
  }

  /* ─── Header ──────────────────────────── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid #222;
    background: #0f0f0f;
  }
  .header h1 {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }
  .header .port {
    font-size: 12px;
    color: #666;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .subtitle {
    padding: 10px 24px 12px;
    font-size: 13px;
    color: #999;
    line-height: 1.5;
    border-bottom: 1px solid #222;
    background: #0f0f0f;
  }

  /* ─── Layout ──────────────────────────── */
  .container {
    display: flex;
    height: calc(100vh - 53px);
  }
  .panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-left {
    border-right: 1px solid #222;
  }
  .panel-header {
    padding: 16px 20px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
  }

  /* ─── Browser Pills ───────────────────── */
  .browser-pills {
    display: flex;
    gap: 8px;
    padding: 0 20px 12px;
    flex-wrap: wrap;
  }
  .pill {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #aaa;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pill:hover { border-color: #555; color: #ddd; }
  .pill.active {
    border-color: #4ade80;
    background: #0a2a14;
    color: #4ade80;
  }
  .pill .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #4ade80;
  }

  /* ─── Profile Pills ─────────────────── */
  .profile-pills {
    display: flex;
    gap: 6px;
    padding: 0 20px 12px;
    flex-wrap: wrap;
  }
  .profile-pill {
    padding: 4px 10px;
    border-radius: 14px;
    border: 1px solid #2a2a2a;
    background: #141414;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .profile-pill:hover { border-color: #444; color: #bbb; }
  .profile-pill.active {
    border-color: #60a5fa;
    background: #0a1a2a;
    color: #60a5fa;
  }

  /* ─── Search ──────────────────────────── */
  .search-wrap {
    padding: 0 20px 12px;
  }
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #141414;
    color: #e0e0e0;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input::placeholder { color: #555; }
  .search-input:focus { border-color: #555; }

  /* ─── Domain List ─────────────────────── */
  .domain-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px;
  }
  .domain-list::-webkit-scrollbar { width: 6px; }
  .domain-list::-webkit-scrollbar-track { background: transparent; }
  .domain-list::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

  .domain-row {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    border-radius: 6px;
    transition: background 0.1s;
    gap: 8px;
  }
  .domain-row:hover { background: #1a1a1a; }
  .domain-name {
    flex: 1;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .domain-count {
    font-size: 12px;
    color: #666;
    font-family: 'SF Mono', 'Fira Code', monospace;
    min-width: 28px;
    text-align: right;
  }
  .btn-add, .btn-trash {
    width: 28px; height: 28px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #888;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .btn-add:hover { border-color: #4ade80; color: #4ade80; background: #0a2a14; }
  .btn-trash:hover { border-color: #f87171; color: #f87171; background: #2a0a0a; }
  .btn-add:disabled, .btn-trash:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    pointer-events: none;
  }
  .btn-add.imported {
    border-color: #333;
    color: #4ade80;
    background: transparent;
    cursor: default;
    font-size: 14px;
  }

  /* ─── Footer ──────────────────────────── */
  .panel-footer {
    padding: 12px 20px;
    border-top: 1px solid #222;
    font-size: 12px;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .btn-import-all {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #4ade80;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-import-all:hover { border-color: #4ade80; background: #0a2a14; }
  .btn-import-all:disabled { opacity: 0.3; cursor: not-allowed; pointer-events: none; }

  /* ─── Imported Panel ──────────────────── */
  .imported-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #444;
    font-size: 13px;
    padding: 20px;
    text-align: center;
  }

  /* ─── Banner ──────────────────────────── */
  .banner {
    padding: 10px 20px;
    font-size: 13px;
    display: none;
    align-items: center;
    gap: 10px;
  }
  .banner.error {
    background: #1a0a0a;
    border-bottom: 1px solid #3a1111;
    color: #f87171;
  }
  .banner.info {
    background: #0a1a2a;
    border-bottom: 1px solid #112233;
    color: #60a5fa;
  }
  .banner .banner-text { flex: 1; }
  .banner .banner-close, .banner .banner-retry {
    background: none;
    border: 1px solid currentColor;
    color: inherit;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  /* ─── Spinner ─────────────────────────── */
  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid #333;
    border-top-color: #4ade80;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-row {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 10px;
    color: #666;
    font-size: 13px;
  }
</style>
</head>
<body>

<div class="header">
  <h1>Cookie Import</h1>
  <span class="port">localhost:${serverPort}</span>
</div>

<p class="subtitle">Select the domains of cookies you want to import to GStack Browser. You'll be able to browse those sites with the same login as your other browser.</p>

<div id="banner" class="banner"></div>

<div class="container">
  <!-- Left Panel: Source Browser -->
  <div class="panel panel-left">
    <div class="panel-header">Source Browser</div>
    <div id="browser-pills" class="browser-pills"></div>
    <div id="profile-pills" class="profile-pills" style="display:none"></div>
    <div class="search-wrap">
      <input type="text" class="search-input" id="search" placeholder="Search domains..." />
    </div>
    <div class="domain-list" id="source-domains">
      <div class="loading-row"><span class="spinner"></span> Detecting browsers...</div>
    </div>
    <div class="panel-footer" id="source-footer"><span id="source-footer-text"></span><button class="btn-import-all" id="btn-import-all" style="display:none">Import All</button></div>
  </div>

  <!-- Right Panel: Imported -->
  <div class="panel panel-right">
    <div class="panel-header">Imported to Session</div>
    <div class="domain-list" id="imported-domains">
      <div class="imported-empty">No cookies imported yet</div>
    </div>
    <div class="panel-footer" id="imported-footer"></div>
  </div>
</div>

<script>
(function() {
  const BASE = '${baseUrl}';
  let activeBrowser = null;
  let activeProfile = 'Default';
  let allProfiles = [];
  let allDomains = [];
  let importedSet = {};  // domain → count
  let inflight = {};     // domain → true (prevents double-click)

  const $pills = document.getElementById('browser-pills');
  const $profilePills = document.getElementById('profile-pills');
  const $search = document.getElementById('search');
  const $sourceDomains = document.getElementById('source-domains');
  const $importedDomains = document.getElementById('imported-domains');
  const $sourceFooter = document.getElementById('source-footer-text');
  const $btnImportAll = document.getElementById('btn-import-all');
  const $importedFooter = document.getElementById('imported-footer');
  const $banner = document.getElementById('banner');

  // ─── Banner ────────────────────────────
  function showBanner(msg, type, retryFn) {
    $banner.className = 'banner ' + type;
    $banner.style.display = 'flex';
    let html = '<span class="banner-text">' + escHtml(msg) + '</span>';
    if (retryFn) {
      html += '<button class="banner-retry" id="banner-retry">Retry</button>';
    }
    html += '<button class="banner-close" id="banner-close">×</button>';
    $banner.innerHTML = html;
    document.getElementById('banner-close').onclick = () => { $banner.style.display = 'none'; };
    if (retryFn) {
      document.getElementById('banner-retry').onclick = () => {
        $banner.style.display = 'none';
        retryFn();
      };
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── API ────────────────────────────────
  async function api(path, opts) {
    const res = await fetch(BASE + '/cookie-picker' + path, { ...opts, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.code = data.code;
      err.action = data.action;
      throw err;
    }
    return data;
  }

  // ─── Init ───────────────────────────────
  async function init() {
    try {
      const [browserData, importedData] = await Promise.all([
        api('/browsers'),
        api('/imported'),
      ]);

      // Populate imported state
      for (const entry of importedData.domains) {
        importedSet[entry.domain] = entry.count;
      }
      renderImported();

      // Render browser pills
      const browsers = browserData.browsers;
      if (browsers.length === 0) {
        $sourceDomains.innerHTML = '<div class="imported-empty">No Chromium browsers detected</div>';
        return;
      }

      $pills.innerHTML = '';
      browsers.forEach(b => {
        const pill = document.createElement('button');
        pill.className = 'pill';
        pill.innerHTML = '<span class="dot"></span>' + escHtml(b.name);
        pill.onclick = () => selectBrowser(b.name);
        $pills.appendChild(pill);
      });

      // Auto-select first browser
      selectBrowser(browsers[0].name);
    } catch (err) {
      showBanner(err.message, 'error', init);
      $sourceDomains.innerHTML = '<div class="imported-empty">Failed to load</div>';
    }
  }

  // ─── Select Browser ────────────────────
  async function selectBrowser(name) {
    activeBrowser = name;
    activeProfile = 'Default';

    // Update pills
    $pills.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('active', p.textContent === name);
    });

    $sourceDomains.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading...</div>';
    $sourceFooter.textContent = '';
    $search.value = '';

    try {
      // Fetch profiles for this browser
      const profileData = await api('/profiles?browser=' + encodeURIComponent(name));
      allProfiles = profileData.profiles || [];

      if (allProfiles.length > 1) {
        // Show profile pills when multiple profiles exist
        $profilePills.style.display = 'flex';
        renderProfilePills();
        // Auto-select profile with the most recent/largest cookie DB, or Default
        activeProfile = allProfiles[0].name;
      } else {
        $profilePills.style.display = 'none';
        activeProfile = allProfiles.length === 1 ? allProfiles[0].name : 'Default';
      }

      await loadDomains();
    } catch (err) {
      showBanner(err.message, 'error', err.action === 'retry' ? () => selectBrowser(name) : null);
      $sourceDomains.innerHTML = '<div class="imported-empty">Failed to load</div>';
      $profilePills.style.display = 'none';
    }
  }

  // ─── Render Profile Pills ─────────────
  function renderProfilePills() {
    let html = '';
    for (const p of allProfiles) {
      const isActive = p.name === activeProfile;
      const label = p.displayName || p.name;
      html += '<button class="profile-pill' + (isActive ? ' active' : '') + '" data-profile="' + escHtml(p.name) + '">' + escHtml(label) + '</button>';
    }
    $profilePills.innerHTML = html;

    $profilePills.querySelectorAll('.profile-pill').forEach(btn => {
      btn.addEventListener('click', () => selectProfile(btn.dataset.profile));
    });
  }

  // ─── Select Profile ───────────────────
  async function selectProfile(profileName) {
    activeProfile = profileName;
    renderProfilePills();

    $sourceDomains.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading domains...</div>';
    $sourceFooter.textContent = '';
    $search.value = '';

    await loadDomains();
  }

  // ─── Load Domains ─────────────────────
  async function loadDomains() {
    try {
      const data = await api('/domains?browser=' + encodeURIComponent(activeBrowser) + '&profile=' + encodeURIComponent(activeProfile));
      allDomains = data.domains;
      renderSourceDomains();
    } catch (err) {
      showBanner(err.message, 'error', err.action === 'retry' ? () => loadDomains() : null);
      $sourceDomains.innerHTML = '<div class="imported-empty">Failed to load domains</div>';
    }
  }

  // ─── Render Source Domains ─────────────
  function renderSourceDomains() {
    const query = $search.value.toLowerCase();
    const filtered = query
      ? allDomains.filter(d => d.domain.toLowerCase().includes(query))
      : allDomains;

    if (filtered.length === 0) {
      $sourceDomains.innerHTML = '<div class="imported-empty">' +
        (query ? 'No matching domains' : 'No cookie domains found') + '</div>';
      $sourceFooter.textContent = '';
      return;
    }

    let html = '';
    for (const d of filtered) {
      const isImported = d.domain in importedSet;
      const isInflight = inflight[d.domain];
      html += '<div class="domain-row">';
      html += '<span class="domain-name">' + escHtml(d.domain) + '</span>';
      html += '<span class="domain-count">' + d.count + '</span>';
      if (isInflight) {
        html += '<span class="btn-add" disabled><span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span></span>';
      } else if (isImported) {
        html += '<span class="btn-add imported">&#10003;</span>';
      } else {
        html += '<button class="btn-add" data-domain="' + escHtml(d.domain) + '" title="Import">+</button>';
      }
      html += '</div>';
    }
    $sourceDomains.innerHTML = html;

    // Total counts
    const totalDomains = allDomains.length;
    const totalCookies = allDomains.reduce((s, d) => s + d.count, 0);
    $sourceFooter.textContent = totalDomains + ' domains · ' + totalCookies.toLocaleString() + ' cookies';

    // Show/hide Import All button
    const unimported = filtered.filter(d => !(d.domain in importedSet) && !inflight[d.domain]);
    if (unimported.length > 0) {
      $btnImportAll.style.display = '';
      $btnImportAll.disabled = false;
      $btnImportAll.textContent = 'Import All (' + unimported.length + ')';
    } else {
      $btnImportAll.style.display = 'none';
    }

    // Click handlers
    $sourceDomains.querySelectorAll('.btn-add[data-domain]').forEach(btn => {
      btn.addEventListener('click', () => importDomain(btn.dataset.domain));
    });
  }

  // ─── Import Domain ─────────────────────
  async function importDomain(domain) {
    if (inflight[domain] || domain in importedSet) return;
    inflight[domain] = true;
    renderSourceDomains();

    try {
      const data = await api('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser: activeBrowser, domains: [domain], profile: activeProfile }),
      });

      if (data.domainCounts) {
        for (const [d, count] of Object.entries(data.domainCounts)) {
          importedSet[d] = (importedSet[d] || 0) + count;
        }
      }
      renderImported();
    } catch (err) {
      showBanner('Import failed for ' + domain + ': ' + err.message, 'error',
        err.action === 'retry' ? () => importDomain(domain) : null);
    } finally {
      delete inflight[domain];
      renderSourceDomains();
    }
  }

  // ─── Import All ───────────────────────
  async function importAll() {
    const query = $search.value.toLowerCase();
    const filtered = query
      ? allDomains.filter(d => d.domain.toLowerCase().includes(query))
      : allDomains;
    const toImport = filtered.filter(d => !(d.domain in importedSet) && !inflight[d.domain]);
    if (toImport.length === 0) return;

    $btnImportAll.disabled = true;
    $btnImportAll.textContent = 'Importing...';

    const domains = toImport.map(d => d.domain);
    try {
      const data = await api('/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ browser: activeBrowser, domains: domains, profile: activeProfile }),
      });

      if (data.domainCounts) {
        for (const [d, count] of Object.entries(data.domainCounts)) {
          importedSet[d] = (importedSet[d] || 0) + count;
        }
      }
      renderImported();
    } catch (err) {
      showBanner('Import all failed: ' + err.message, 'error',
        err.action === 'retry' ? () => importAll() : null);
    } finally {
      renderSourceDomains();
    }
  }

  $btnImportAll.addEventListener('click', importAll);

  // ─── Render Imported ───────────────────
  function renderImported() {
    const entries = Object.entries(importedSet).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
      $importedDomains.innerHTML = '<div class="imported-empty">No cookies imported yet</div>';
      $importedFooter.textContent = '';
      return;
    }

    let html = '';
    for (const [domain, count] of entries) {
      const isInflight = inflight['remove:' + domain];
      html += '<div class="domain-row">';
      html += '<span class="domain-name">' + escHtml(domain) + '</span>';
      html += '<span class="domain-count">' + count + '</span>';
      if (isInflight) {
        html += '<span class="btn-trash" disabled><span class="spinner" style="width:12px;height:12px;border-width:1.5px;border-top-color:#f87171;"></span></span>';
      } else {
        html += '<button class="btn-trash" data-domain="' + escHtml(domain) + '" title="Remove">&#128465;</button>';
      }
      html += '</div>';
    }
    $importedDomains.innerHTML = html;

    const totalCookies = entries.reduce((s, e) => s + e[1], 0);
    $importedFooter.textContent = entries.length + ' domains · ' + totalCookies.toLocaleString() + ' cookies imported';

    // Click handlers
    $importedDomains.querySelectorAll('.btn-trash[data-domain]').forEach(btn => {
      btn.addEventListener('click', () => removeDomain(btn.dataset.domain));
    });
  }

  // ─── Remove Domain ─────────────────────
  async function removeDomain(domain) {
    if (inflight['remove:' + domain]) return;
    inflight['remove:' + domain] = true;
    renderImported();

    try {
      await api('/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: [domain] }),
      });
      delete importedSet[domain];
      renderImported();
      renderSourceDomains(); // update checkmarks
    } catch (err) {
      showBanner('Remove failed for ' + domain + ': ' + err.message, 'error',
        err.action === 'retry' ? () => removeDomain(domain) : null);
    } finally {
      delete inflight['remove:' + domain];
      renderImported();
    }
  }

  // ─── Search ────────────────────────────
  $search.addEventListener('input', renderSourceDomains);

  // ─── Start ─────────────────────────────
  init();
})();
</script>
</body>
</html>`;
}

// browse/src/cookie-picker-routes.ts
import * as crypto2 from "crypto";
function generatePickerCode() {
  const code = crypto2.randomUUID();
  pendingCodes.set(code, Date.now() + CODE_TTL_MS);
  return code;
}
function hasActivePicker() {
  const now = Date.now();
  for (const [code, expiry] of pendingCodes) {
    if (expiry > now)
      return true;
    pendingCodes.delete(code);
  }
  for (const [session, expiry] of validSessions) {
    if (expiry > now)
      return true;
    validSessions.delete(session);
  }
  return false;
}
function getSessionFromCookie(req) {
  const cookie = req.headers.get("cookie");
  if (!cookie)
    return null;
  const match = cookie.match(/gstack_picker=([^;]+)/);
  return match ? match[1] : null;
}
function isValidSession(session) {
  const expiry = validSessions.get(session);
  if (!expiry)
    return false;
  if (Date.now() > expiry) {
    validSessions.delete(session);
    return false;
  }
  return true;
}
function corsOrigin(port) {
  return `http://127.0.0.1:${port}`;
}
function jsonResponse(data, opts) {
  return new Response(JSON.stringify(data), {
    status: opts.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin(opts.port)
    }
  });
}
function errorResponse(message, code, opts) {
  return jsonResponse({ error: message, code, ...opts.action ? { action: opts.action } : {} }, { port: opts.port, status: opts.status ?? 400 });
}
async function handleCookiePickerRoute(url, req, bm, authToken) {
  const pathname = url.pathname;
  const port = parseInt(url.port, 10) || 9400;
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin(port),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }
  try {
    if (pathname === "/cookie-picker" && req.method === "GET") {
      const code = url.searchParams.get("code");
      if (code) {
        const expiry = pendingCodes.get(code);
        if (!expiry || Date.now() > expiry) {
          pendingCodes.delete(code);
          return new Response("Invalid or expired code. Re-run cookie-import-browser.", {
            status: 403,
            headers: { "Content-Type": "text/plain" }
          });
        }
        pendingCodes.delete(code);
        const session = crypto2.randomUUID();
        validSessions.set(session, Date.now() + SESSION_TTL_MS);
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/cookie-picker",
            "Set-Cookie": `gstack_picker=${session}; HttpOnly; SameSite=Strict; Path=/cookie-picker; Max-Age=3600`,
            "Cache-Control": "no-store"
          }
        });
      }
      const session = getSessionFromCookie(req);
      if (session && isValidSession(session)) {
        const html = getCookiePickerHTML(port);
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }
      return new Response("Access denied. Open the cookie picker from gstack.", {
        status: 403,
        headers: { "Content-Type": "text/plain" }
      });
    }
    const authHeader = req.headers.get("authorization");
    const sessionId = getSessionFromCookie(req);
    const hasBearer = !!authToken && !!authHeader && authHeader === `Bearer ${authToken}`;
    const hasSession = sessionId !== null && isValidSession(sessionId);
    if (!hasBearer && !hasSession) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (pathname === "/cookie-picker/browsers" && req.method === "GET") {
      const browsers = findInstalledBrowsers();
      return jsonResponse({
        browsers: browsers.map((b) => ({
          name: b.name,
          aliases: b.aliases
        }))
      }, { port });
    }
    if (pathname === "/cookie-picker/profiles" && req.method === "GET") {
      const browserName = url.searchParams.get("browser");
      if (!browserName) {
        return errorResponse("Missing 'browser' parameter", "missing_param", { port });
      }
      const profiles = listProfiles(browserName);
      return jsonResponse({ profiles }, { port });
    }
    if (pathname === "/cookie-picker/domains" && req.method === "GET") {
      const browserName = url.searchParams.get("browser");
      if (!browserName) {
        return errorResponse("Missing 'browser' parameter", "missing_param", { port });
      }
      const profile = url.searchParams.get("profile") || "Default";
      const result = listDomains(browserName, profile);
      return jsonResponse({
        browser: result.browser,
        domains: result.domains
      }, { port });
    }
    if (pathname === "/cookie-picker/import" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return errorResponse("Invalid JSON body", "bad_request", { port });
      }
      const { browser, domains, profile } = body;
      if (!browser)
        return errorResponse("Missing 'browser' field", "missing_param", { port });
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return errorResponse("Missing or empty 'domains' array", "missing_param", { port });
      }
      const selectedProfile = profile || "Default";
      let result = await importCookies(browser, domains, selectedProfile);
      if (result.cookies.length === 0 && result.failed > 0 && hasV20Cookies(browser, selectedProfile)) {
        console.log(`[cookie-picker] v20 App-Bound Encryption detected, trying CDP extraction...`);
        try {
          result = await importCookiesViaCdp(browser, domains, selectedProfile);
        } catch (cdpErr) {
          console.log(`[cookie-picker] CDP fallback failed: ${cdpErr.message}`);
          return jsonResponse({
            imported: 0,
            failed: result.failed,
            domainCounts: {},
            message: `Cookies use App-Bound Encryption (v20). Close ${browser}, retry, or use /connect-chrome to browse with your real browser directly.`,
            code: "v20_encryption"
          }, { port });
        }
      }
      if (result.cookies.length === 0) {
        return jsonResponse({
          imported: 0,
          failed: result.failed,
          domainCounts: {},
          message: result.failed > 0 ? `All ${result.failed} cookies failed to decrypt` : "No cookies found for the specified domains"
        }, { port });
      }
      const page = bm.getActiveSession().getPage();
      await page.context().addCookies(result.cookies);
      for (const domain of Object.keys(result.domainCounts)) {
        importedDomains.add(domain);
        importedCounts.set(domain, (importedCounts.get(domain) || 0) + result.domainCounts[domain]);
      }
      console.log(`[cookie-picker] Imported ${result.count} cookies for ${Object.keys(result.domainCounts).length} domains`);
      return jsonResponse({
        imported: result.count,
        failed: result.failed,
        domainCounts: result.domainCounts
      }, { port });
    }
    if (pathname === "/cookie-picker/remove" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return errorResponse("Invalid JSON body", "bad_request", { port });
      }
      const { domains } = body;
      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return errorResponse("Missing or empty 'domains' array", "missing_param", { port });
      }
      const page = bm.getActiveSession().getPage();
      const context = page.context();
      for (const domain of domains) {
        await context.clearCookies({ domain });
        importedDomains.delete(domain);
        importedCounts.delete(domain);
      }
      console.log(`[cookie-picker] Removed cookies for ${domains.length} domains`);
      return jsonResponse({
        removed: domains.length,
        domains
      }, { port });
    }
    if (pathname === "/cookie-picker/imported" && req.method === "GET") {
      const entries = [];
      for (const domain of importedDomains) {
        entries.push({ domain, count: importedCounts.get(domain) || 0 });
      }
      entries.sort((a, b) => b.count - a.count);
      return jsonResponse({
        domains: entries,
        totalDomains: entries.length,
        totalCookies: entries.reduce((sum, e) => sum + e.count, 0)
      }, { port });
    }
    return new Response("Not found", { status: 404 });
  } catch (err) {
    if (err instanceof CookieImportError) {
      return errorResponse(err.message, err.code, { port, status: 400, action: err.action });
    }
    console.error(`[cookie-picker] Error: ${err.message}`);
    return errorResponse(err.message || "Internal error", "internal_error", { port, status: 500 });
  }
}
var pendingCodes, CODE_TTL_MS = 30000, validSessions, SESSION_TTL_MS = 3600000, importedDomains, importedCounts;
var init_cookie_picker_routes = __esm(() => {
  init_cookie_import_browser();
  pendingCodes = new Map;
  validSessions = new Map;
  importedDomains = new Set;
  importedCounts = new Map;
});

// node_modules/sharp/dist/is.mjs
var defined = (val) => typeof val !== "undefined" && val !== null, object = (val) => typeof val === "object", plainObject = (val) => Object.prototype.toString.call(val) === "[object Object]", fn = (val) => typeof val === "function", bool = (val) => typeof val === "boolean", buffer = (val) => val instanceof Buffer, typedArray = (val) => {
  if (defined(val)) {
    switch (val.constructor) {
      case Uint8Array:
      case Uint8ClampedArray:
      case Int8Array:
      case Uint16Array:
      case Int16Array:
      case Uint32Array:
      case Int32Array:
      case Float32Array:
      case Float64Array:
        return true;
    }
  }
  return false;
}, arrayBuffer = (val) => val instanceof ArrayBuffer, string = (val) => typeof val === "string" && val.length > 0, number = (val) => typeof val === "number" && Number.isFinite(val), integer = (val) => Number.isInteger(val), inRange = (val, min, max) => val >= min && val <= max, inArray = (val, list) => list.includes(val), invalidParameterError = (name, expected, actual) => new Error(`Expected ${expected} for ${name} but received ${actual} of type ${typeof actual}`), nativeError = (native, context) => {
  context.message = native.message;
  return context;
}, is_default;
var init_is = __esm(() => {
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  is_default = {
    defined,
    object,
    plainObject,
    fn,
    bool,
    buffer,
    typedArray,
    arrayBuffer,
    string,
    number,
    integer,
    inRange,
    inArray,
    invalidParameterError,
    nativeError
  };
});

// node_modules/detect-libc/lib/process.js
var require_process = __commonJS(function(exports, module) {
  var isLinux = () => process.platform === "linux";
  var report = null;
  var getReport = () => {
    if (!report) {
      if (isLinux() && process.report) {
        const orig = process.report.excludeNetwork;
        process.report.excludeNetwork = true;
        report = process.report.getReport();
        process.report.excludeNetwork = orig;
      } else {
        report = {};
      }
    }
    return report;
  };
  module.exports = { isLinux, getReport };
});

// node_modules/detect-libc/lib/filesystem.js
var require_filesystem = __commonJS(function(exports, module) {
  var fs = __require("fs");
  var LDD_PATH = "/usr/bin/ldd";
  var SELF_PATH = "/proc/self/exe";
  var MAX_LENGTH = 2048;
  var readFileSync = (path) => {
    const fd = fs.openSync(path, "r");
    const buffer = Buffer.alloc(MAX_LENGTH);
    const bytesRead = fs.readSync(fd, buffer, 0, MAX_LENGTH, 0);
    fs.close(fd, () => {});
    return buffer.subarray(0, bytesRead);
  };
  var readFile = (path) => new Promise((resolve, reject) => {
    fs.open(path, "r", (err, fd) => {
      if (err) {
        reject(err);
      } else {
        const buffer = Buffer.alloc(MAX_LENGTH);
        fs.read(fd, buffer, 0, MAX_LENGTH, 0, (_, bytesRead) => {
          resolve(buffer.subarray(0, bytesRead));
          fs.close(fd, () => {});
        });
      }
    });
  });
  module.exports = {
    LDD_PATH,
    SELF_PATH,
    readFileSync,
    readFile
  };
});

// node_modules/detect-libc/lib/elf.js
var require_elf = __commonJS(function(exports, module) {
  var interpreterPath = (elf) => {
    if (elf.length < 64) {
      return null;
    }
    if (elf.readUInt32BE(0) !== 2135247942) {
      return null;
    }
    if (elf.readUInt8(4) !== 2) {
      return null;
    }
    if (elf.readUInt8(5) !== 1) {
      return null;
    }
    const offset = elf.readUInt32LE(32);
    const size = elf.readUInt16LE(54);
    const count = elf.readUInt16LE(56);
    for (let i = 0;i < count; i++) {
      const headerOffset = offset + i * size;
      const type = elf.readUInt32LE(headerOffset);
      if (type === 3) {
        const fileOffset = elf.readUInt32LE(headerOffset + 8);
        const fileSize = elf.readUInt32LE(headerOffset + 32);
        return elf.subarray(fileOffset, fileOffset + fileSize).toString().replace(/\0.*$/g, "");
      }
    }
    return null;
  };
  module.exports = {
    interpreterPath
  };
});

// node_modules/detect-libc/lib/detect-libc.js
var require_detect_libc = __commonJS(function(exports, module) {
  var childProcess = __require("child_process");
  var { isLinux, getReport } = require_process();
  var { LDD_PATH, SELF_PATH, readFile, readFileSync } = require_filesystem();
  var { interpreterPath } = require_elf();
  var cachedFamilyInterpreter;
  var cachedFamilyFilesystem;
  var cachedVersionFilesystem;
  var command = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true";
  var commandOut = "";
  var safeCommand = () => {
    if (!commandOut) {
      return new Promise((resolve) => {
        childProcess.exec(command, (err, out) => {
          commandOut = err ? " " : out;
          resolve(commandOut);
        });
      });
    }
    return commandOut;
  };
  var safeCommandSync = () => {
    if (!commandOut) {
      try {
        commandOut = childProcess.execSync(command, { encoding: "utf8" });
      } catch (_err) {
        commandOut = " ";
      }
    }
    return commandOut;
  };
  var GLIBC = "glibc";
  var RE_GLIBC_VERSION = /LIBC[a-z0-9 \-).]*?(\d+\.\d+)/i;
  var MUSL = "musl";
  var isFileMusl = (f) => f.includes("libc.musl-") || f.includes("ld-musl-");
  var familyFromReport = () => {
    const report = getReport();
    if (report.header && report.header.glibcVersionRuntime) {
      return GLIBC;
    }
    if (Array.isArray(report.sharedObjects)) {
      if (report.sharedObjects.some(isFileMusl)) {
        return MUSL;
      }
    }
    return null;
  };
  var familyFromCommand = (out) => {
    const [getconf, ldd1] = out.split(/[\r\n]+/);
    if (getconf && getconf.includes(GLIBC)) {
      return GLIBC;
    }
    if (ldd1 && ldd1.includes(MUSL)) {
      return MUSL;
    }
    return null;
  };
  var familyFromInterpreterPath = (path) => {
    if (path) {
      if (path.includes("/ld-musl-")) {
        return MUSL;
      } else if (path.includes("/ld-linux-")) {
        return GLIBC;
      }
    }
    return null;
  };
  var getFamilyFromLddContent = (content) => {
    content = content.toString();
    if (content.includes("musl")) {
      return MUSL;
    }
    if (content.includes("GNU C Library")) {
      return GLIBC;
    }
    return null;
  };
  var familyFromFilesystem = async () => {
    if (cachedFamilyFilesystem !== undefined) {
      return cachedFamilyFilesystem;
    }
    cachedFamilyFilesystem = null;
    try {
      const lddContent = await readFile(LDD_PATH);
      cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
    } catch (e) {}
    return cachedFamilyFilesystem;
  };
  var familyFromFilesystemSync = () => {
    if (cachedFamilyFilesystem !== undefined) {
      return cachedFamilyFilesystem;
    }
    cachedFamilyFilesystem = null;
    try {
      const lddContent = readFileSync(LDD_PATH);
      cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
    } catch (e) {}
    return cachedFamilyFilesystem;
  };
  var familyFromInterpreter = async () => {
    if (cachedFamilyInterpreter !== undefined) {
      return cachedFamilyInterpreter;
    }
    cachedFamilyInterpreter = null;
    try {
      const selfContent = await readFile(SELF_PATH);
      const path = interpreterPath(selfContent);
      cachedFamilyInterpreter = familyFromInterpreterPath(path);
    } catch (e) {}
    return cachedFamilyInterpreter;
  };
  var familyFromInterpreterSync = () => {
    if (cachedFamilyInterpreter !== undefined) {
      return cachedFamilyInterpreter;
    }
    cachedFamilyInterpreter = null;
    try {
      const selfContent = readFileSync(SELF_PATH);
      const path = interpreterPath(selfContent);
      cachedFamilyInterpreter = familyFromInterpreterPath(path);
    } catch (e) {}
    return cachedFamilyInterpreter;
  };
  var family = async () => {
    let family = null;
    if (isLinux()) {
      family = await familyFromInterpreter();
      if (!family) {
        family = await familyFromFilesystem();
        if (!family) {
          family = familyFromReport();
        }
        if (!family) {
          const out = await safeCommand();
          family = familyFromCommand(out);
        }
      }
    }
    return family;
  };
  var familySync = () => {
    let family = null;
    if (isLinux()) {
      family = familyFromInterpreterSync();
      if (!family) {
        family = familyFromFilesystemSync();
        if (!family) {
          family = familyFromReport();
        }
        if (!family) {
          const out = safeCommandSync();
          family = familyFromCommand(out);
        }
      }
    }
    return family;
  };
  var isNonGlibcLinux = async () => isLinux() && await family() !== GLIBC;
  var isNonGlibcLinuxSync = () => isLinux() && familySync() !== GLIBC;
  var versionFromFilesystem = async () => {
    if (cachedVersionFilesystem !== undefined) {
      return cachedVersionFilesystem;
    }
    cachedVersionFilesystem = null;
    try {
      const lddContent = await readFile(LDD_PATH);
      const versionMatch = lddContent.match(RE_GLIBC_VERSION);
      if (versionMatch) {
        cachedVersionFilesystem = versionMatch[1];
      }
    } catch (e) {}
    return cachedVersionFilesystem;
  };
  var versionFromFilesystemSync = () => {
    if (cachedVersionFilesystem !== undefined) {
      return cachedVersionFilesystem;
    }
    cachedVersionFilesystem = null;
    try {
      const lddContent = readFileSync(LDD_PATH);
      const versionMatch = lddContent.match(RE_GLIBC_VERSION);
      if (versionMatch) {
        cachedVersionFilesystem = versionMatch[1];
      }
    } catch (e) {}
    return cachedVersionFilesystem;
  };
  var versionFromReport = () => {
    const report = getReport();
    if (report.header && report.header.glibcVersionRuntime) {
      return report.header.glibcVersionRuntime;
    }
    return null;
  };
  var versionSuffix = (s) => s.trim().split(/\s+/)[1];
  var versionFromCommand = (out) => {
    const [getconf, ldd1, ldd2] = out.split(/[\r\n]+/);
    if (getconf && getconf.includes(GLIBC)) {
      return versionSuffix(getconf);
    }
    if (ldd1 && ldd2 && ldd1.includes(MUSL)) {
      return versionSuffix(ldd2);
    }
    return null;
  };
  var version = async () => {
    let version = null;
    if (isLinux()) {
      version = await versionFromFilesystem();
      if (!version) {
        version = versionFromReport();
      }
      if (!version) {
        const out = await safeCommand();
        version = versionFromCommand(out);
      }
    }
    return version;
  };
  var versionSync = () => {
    let version = null;
    if (isLinux()) {
      version = versionFromFilesystemSync();
      if (!version) {
        version = versionFromReport();
      }
      if (!version) {
        const out = safeCommandSync();
        version = versionFromCommand(out);
      }
    }
    return version;
  };
  module.exports = {
    GLIBC,
    MUSL,
    family,
    familySync,
    isNonGlibcLinux,
    isNonGlibcLinuxSync,
    version,
    versionSync
  };
});

// node_modules/semver/internal/constants.js
var require_constants = __commonJS(function(exports, module) {
  var SEMVER_SPEC_VERSION = "2.0.0";
  var MAX_LENGTH = 256;
  var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;
  var MAX_SAFE_COMPONENT_LENGTH = 16;
  var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
  var RELEASE_TYPES = [
    "major",
    "premajor",
    "minor",
    "preminor",
    "patch",
    "prepatch",
    "prerelease"
  ];
  module.exports = {
    MAX_LENGTH,
    MAX_SAFE_COMPONENT_LENGTH,
    MAX_SAFE_BUILD_LENGTH,
    MAX_SAFE_INTEGER,
    RELEASE_TYPES,
    SEMVER_SPEC_VERSION,
    FLAG_INCLUDE_PRERELEASE: 1,
    FLAG_LOOSE: 2
  };
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS(function(exports, module) {
  var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {};
  module.exports = debug;
});

// node_modules/semver/internal/re.js
var require_re = __commonJS(function(exports, module) {
  var {
    MAX_SAFE_COMPONENT_LENGTH,
    MAX_SAFE_BUILD_LENGTH,
    MAX_LENGTH
  } = require_constants();
  var debug = require_debug();
  exports = module.exports = {};
  var re = exports.re = [];
  var safeRe = exports.safeRe = [];
  var src = exports.src = [];
  var safeSrc = exports.safeSrc = [];
  var t = exports.t = {};
  var R = 0;
  var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
  var safeRegexReplacements = [
    ["\\s", 1],
    ["\\d", MAX_LENGTH],
    [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
  ];
  var makeSafeRegex = (value) => {
    for (const [token, max] of safeRegexReplacements) {
      value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
    }
    return value;
  };
  var createToken = (name, value, isGlobal) => {
    const safe = makeSafeRegex(value);
    const index = R++;
    debug(name, index, value);
    t[name] = index;
    src[index] = value;
    safeSrc[index] = safe;
    re[index] = new RegExp(value, isGlobal ? "g" : undefined);
    safeRe[index] = new RegExp(safe, isGlobal ? "g" : undefined);
  };
  createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
  createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
  createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
  createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.` + `(${src[t.NUMERICIDENTIFIER]})\\.` + `(${src[t.NUMERICIDENTIFIER]})`);
  createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` + `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` + `(${src[t.NUMERICIDENTIFIERLOOSE]})`);
  createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
  createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
  createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
  createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
  createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
  createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
  createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
  createToken("FULL", `^${src[t.FULLPLAIN]}$`);
  createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
  createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
  createToken("GTLT", "((?:<|>)?=?)");
  createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
  createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
  createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})` + `(?:\\.(${src[t.XRANGEIDENTIFIER]})` + `(?:\\.(${src[t.XRANGEIDENTIFIER]})` + `(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?` + `)?)?`);
  createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})` + `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` + `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` + `(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?` + `)?)?`);
  createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
  createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
  createToken("COERCEPLAIN", `${"(^|[^\\d])" + "(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})` + `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` + `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
  createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
  createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?` + `(?:${src[t.BUILD]})?` + `(?:$|[^\\d])`);
  createToken("COERCERTL", src[t.COERCE], true);
  createToken("COERCERTLFULL", src[t.COERCEFULL], true);
  createToken("LONETILDE", "(?:~>?)");
  createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
  exports.tildeTrimReplace = "$1~";
  createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
  createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
  createToken("LONECARET", "(?:\\^)");
  createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
  exports.caretTrimReplace = "$1^";
  createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
  createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
  createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
  createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
  createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
  exports.comparatorTrimReplace = "$1$2$3";
  createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})` + `\\s+-\\s+` + `(${src[t.XRANGEPLAIN]})` + `\\s*$`);
  createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})` + `\\s+-\\s+` + `(${src[t.XRANGEPLAINLOOSE]})` + `\\s*$`);
  createToken("STAR", "(<|>)?=?\\s*\\*");
  createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
  createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS(function(exports, module) {
  var looseOption = Object.freeze({ loose: true });
  var emptyOpts = Object.freeze({});
  var parseOptions = (options) => {
    if (!options) {
      return emptyOpts;
    }
    if (typeof options !== "object") {
      return looseOption;
    }
    return options;
  };
  module.exports = parseOptions;
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS(function(exports, module) {
  var numeric = /^[0-9]+$/;
  var compareIdentifiers = (a, b) => {
    if (typeof a === "number" && typeof b === "number") {
      return a === b ? 0 : a < b ? -1 : 1;
    }
    const anum = numeric.test(a);
    const bnum = numeric.test(b);
    if (anum && bnum) {
      a = +a;
      b = +b;
    }
    return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
  };
  var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
  module.exports = {
    compareIdentifiers,
    rcompareIdentifiers
  };
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS(function(exports, module) {
  var debug = require_debug();
  var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
  var { safeRe: re, t } = require_re();
  var parseOptions = require_parse_options();
  var { compareIdentifiers } = require_identifiers();
  var isPrereleaseIdentifier = (prerelease, identifier) => {
    const identifiers = identifier.split(".");
    if (identifiers.length > prerelease.length) {
      return false;
    }
    for (let i = 0;i < identifiers.length; i++) {
      if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
        return false;
      }
    }
    return true;
  };

  class SemVer {
    constructor(version, options) {
      options = parseOptions(options);
      if (version instanceof SemVer) {
        if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
          return version;
        } else {
          version = version.version;
        }
      } else if (typeof version !== "string") {
        throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
      }
      if (version.length > MAX_LENGTH) {
        throw new TypeError(`version is longer than ${MAX_LENGTH} characters`);
      }
      debug("SemVer", version, options);
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
      if (!m) {
        throw new TypeError(`Invalid Version: ${version}`);
      }
      this.raw = version;
      this.major = +m[1];
      this.minor = +m[2];
      this.patch = +m[3];
      if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
        throw new TypeError("Invalid major version");
      }
      if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
        throw new TypeError("Invalid minor version");
      }
      if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
        throw new TypeError("Invalid patch version");
      }
      if (!m[4]) {
        this.prerelease = [];
      } else {
        this.prerelease = m[4].split(".").map((id) => {
          if (/^[0-9]+$/.test(id)) {
            const num = +id;
            if (num >= 0 && num < MAX_SAFE_INTEGER) {
              return num;
            }
          }
          return id;
        });
      }
      this.build = m[5] ? m[5].split(".") : [];
      this.format();
    }
    format() {
      this.version = `${this.major}.${this.minor}.${this.patch}`;
      if (this.prerelease.length) {
        this.version += `-${this.prerelease.join(".")}`;
      }
      return this.version;
    }
    toString() {
      return this.version;
    }
    compare(other) {
      debug("SemVer.compare", this.version, this.options, other);
      if (!(other instanceof SemVer)) {
        if (typeof other === "string" && other === this.version) {
          return 0;
        }
        other = new SemVer(other, this.options);
      }
      if (other.version === this.version) {
        return 0;
      }
      return this.compareMain(other) || this.comparePre(other);
    }
    compareMain(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      if (this.major < other.major) {
        return -1;
      }
      if (this.major > other.major) {
        return 1;
      }
      if (this.minor < other.minor) {
        return -1;
      }
      if (this.minor > other.minor) {
        return 1;
      }
      if (this.patch < other.patch) {
        return -1;
      }
      if (this.patch > other.patch) {
        return 1;
      }
      return 0;
    }
    comparePre(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      if (this.prerelease.length && !other.prerelease.length) {
        return -1;
      } else if (!this.prerelease.length && other.prerelease.length) {
        return 1;
      } else if (!this.prerelease.length && !other.prerelease.length) {
        return 0;
      }
      let i = 0;
      do {
        const a = this.prerelease[i];
        const b = other.prerelease[i];
        debug("prerelease compare", i, a, b);
        if (a === undefined && b === undefined) {
          return 0;
        } else if (b === undefined) {
          return 1;
        } else if (a === undefined) {
          return -1;
        } else if (a === b) {
          continue;
        } else {
          return compareIdentifiers(a, b);
        }
      } while (++i);
    }
    compareBuild(other) {
      if (!(other instanceof SemVer)) {
        other = new SemVer(other, this.options);
      }
      let i = 0;
      do {
        const a = this.build[i];
        const b = other.build[i];
        debug("build compare", i, a, b);
        if (a === undefined && b === undefined) {
          return 0;
        } else if (b === undefined) {
          return 1;
        } else if (a === undefined) {
          return -1;
        } else if (a === b) {
          continue;
        } else {
          return compareIdentifiers(a, b);
        }
      } while (++i);
    }
    inc(release, identifier, identifierBase) {
      if (release.startsWith("pre")) {
        if (!identifier && identifierBase === false) {
          throw new Error("invalid increment argument: identifier is empty");
        }
        if (identifier) {
          const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
          if (!match || match[1] !== identifier) {
            throw new Error(`invalid identifier: ${identifier}`);
          }
        }
      }
      switch (release) {
        case "premajor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor = 0;
          this.major++;
          this.inc("pre", identifier, identifierBase);
          break;
        case "preminor":
          this.prerelease.length = 0;
          this.patch = 0;
          this.minor++;
          this.inc("pre", identifier, identifierBase);
          break;
        case "prepatch":
          this.prerelease.length = 0;
          this.inc("patch", identifier, identifierBase);
          this.inc("pre", identifier, identifierBase);
          break;
        case "prerelease":
          if (this.prerelease.length === 0) {
            this.inc("patch", identifier, identifierBase);
          }
          this.inc("pre", identifier, identifierBase);
          break;
        case "release":
          if (this.prerelease.length === 0) {
            throw new Error(`version ${this.raw} is not a prerelease`);
          }
          this.prerelease.length = 0;
          break;
        case "major":
          if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
            this.major++;
          }
          this.minor = 0;
          this.patch = 0;
          this.prerelease = [];
          break;
        case "minor":
          if (this.patch !== 0 || this.prerelease.length === 0) {
            this.minor++;
          }
          this.patch = 0;
          this.prerelease = [];
          break;
        case "patch":
          if (this.prerelease.length === 0) {
            this.patch++;
          }
          this.prerelease = [];
          break;
        case "pre": {
          const base = Number(identifierBase) ? 1 : 0;
          if (this.prerelease.length === 0) {
            this.prerelease = [base];
          } else {
            let i = this.prerelease.length;
            while (--i >= 0) {
              if (typeof this.prerelease[i] === "number") {
                this.prerelease[i]++;
                i = -2;
              }
            }
            if (i === -1) {
              if (identifier === this.prerelease.join(".") && identifierBase === false) {
                throw new Error("invalid increment argument: identifier already exists");
              }
              this.prerelease.push(base);
            }
          }
          if (identifier) {
            let prerelease = [identifier, base];
            if (identifierBase === false) {
              prerelease = [identifier];
            }
            if (isPrereleaseIdentifier(this.prerelease, identifier)) {
              const prereleaseBase = this.prerelease[identifier.split(".").length];
              if (isNaN(prereleaseBase)) {
                this.prerelease = prerelease;
              }
            } else {
              this.prerelease = prerelease;
            }
          }
          break;
        }
        default:
          throw new Error(`invalid increment argument: ${release}`);
      }
      this.raw = this.format();
      if (this.build.length) {
        this.raw += `+${this.build.join(".")}`;
      }
      return this;
    }
  }
  module.exports = SemVer;
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var parse = (version, options, throwErrors = false) => {
    if (version instanceof SemVer) {
      return version;
    }
    try {
      return new SemVer(version, options);
    } catch (er) {
      if (!throwErrors) {
        return null;
      }
      throw er;
    }
  };
  module.exports = parse;
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS(function(exports, module) {
  var parse = require_parse();
  var valid = (version, options) => {
    const v = parse(version, options);
    return v ? v.version : null;
  };
  module.exports = valid;
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS(function(exports, module) {
  var parse = require_parse();
  var clean = (version, options) => {
    const s = parse(version.trim().replace(/^[=v]+/, ""), options);
    return s ? s.version : null;
  };
  module.exports = clean;
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var inc = (version, release, options, identifier, identifierBase) => {
    if (typeof options === "string") {
      identifierBase = identifier;
      identifier = options;
      options = undefined;
    }
    try {
      return new SemVer(version instanceof SemVer ? version.version : version, options).inc(release, identifier, identifierBase).version;
    } catch (er) {
      return null;
    }
  };
  module.exports = inc;
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS(function(exports, module) {
  var parse = require_parse();
  var diff = (version1, version2) => {
    const v1 = parse(version1, null, true);
    const v2 = parse(version2, null, true);
    const comparison = v1.compare(v2);
    if (comparison === 0) {
      return null;
    }
    const v1Higher = comparison > 0;
    const highVersion = v1Higher ? v1 : v2;
    const lowVersion = v1Higher ? v2 : v1;
    const highHasPre = !!highVersion.prerelease.length;
    const lowHasPre = !!lowVersion.prerelease.length;
    if (lowHasPre && !highHasPre) {
      if (!lowVersion.patch && !lowVersion.minor) {
        return "major";
      }
      if (lowVersion.compareMain(highVersion) === 0) {
        if (lowVersion.minor && !lowVersion.patch) {
          return "minor";
        }
        return "patch";
      }
    }
    const prefix = highHasPre ? "pre" : "";
    if (v1.major !== v2.major) {
      return prefix + "major";
    }
    if (v1.minor !== v2.minor) {
      return prefix + "minor";
    }
    if (v1.patch !== v2.patch) {
      return prefix + "patch";
    }
    return "prerelease";
  };
  module.exports = diff;
});

// node_modules/semver/functions/major.js
var require_major = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var major = (a, loose) => new SemVer(a, loose).major;
  module.exports = major;
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var minor = (a, loose) => new SemVer(a, loose).minor;
  module.exports = minor;
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var patch = (a, loose) => new SemVer(a, loose).patch;
  module.exports = patch;
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS(function(exports, module) {
  var parse = require_parse();
  var prerelease = (version, options) => {
    const parsed = parse(version, options);
    return parsed && parsed.prerelease.length ? parsed.prerelease : null;
  };
  module.exports = prerelease;
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
  module.exports = compare;
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS(function(exports, module) {
  var compare = require_compare();
  var rcompare = (a, b, loose) => compare(b, a, loose);
  module.exports = rcompare;
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS(function(exports, module) {
  var compare = require_compare();
  var compareLoose = (a, b) => compare(a, b, true);
  module.exports = compareLoose;
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var compareBuild = (a, b, loose) => {
    const versionA = new SemVer(a, loose);
    const versionB = new SemVer(b, loose);
    return versionA.compare(versionB) || versionA.compareBuild(versionB);
  };
  module.exports = compareBuild;
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS(function(exports, module) {
  var compareBuild = require_compare_build();
  var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
  module.exports = sort;
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS(function(exports, module) {
  var compareBuild = require_compare_build();
  var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
  module.exports = rsort;
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS(function(exports, module) {
  var compare = require_compare();
  var gt = (a, b, loose) => compare(a, b, loose) > 0;
  module.exports = gt;
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS(function(exports, module) {
  var compare = require_compare();
  var lt = (a, b, loose) => compare(a, b, loose) < 0;
  module.exports = lt;
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS(function(exports, module) {
  var compare = require_compare();
  var eq = (a, b, loose) => compare(a, b, loose) === 0;
  module.exports = eq;
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS(function(exports, module) {
  var compare = require_compare();
  var neq = (a, b, loose) => compare(a, b, loose) !== 0;
  module.exports = neq;
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS(function(exports, module) {
  var compare = require_compare();
  var gte = (a, b, loose) => compare(a, b, loose) >= 0;
  module.exports = gte;
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS(function(exports, module) {
  var compare = require_compare();
  var lte = (a, b, loose) => compare(a, b, loose) <= 0;
  module.exports = lte;
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS(function(exports, module) {
  var eq = require_eq();
  var neq = require_neq();
  var gt = require_gt();
  var gte = require_gte();
  var lt = require_lt();
  var lte = require_lte();
  var cmp = (a, op, b, loose) => {
    switch (op) {
      case "===":
        if (typeof a === "object") {
          a = a.version;
        }
        if (typeof b === "object") {
          b = b.version;
        }
        return a === b;
      case "!==":
        if (typeof a === "object") {
          a = a.version;
        }
        if (typeof b === "object") {
          b = b.version;
        }
        return a !== b;
      case "":
      case "=":
      case "==":
        return eq(a, b, loose);
      case "!=":
        return neq(a, b, loose);
      case ">":
        return gt(a, b, loose);
      case ">=":
        return gte(a, b, loose);
      case "<":
        return lt(a, b, loose);
      case "<=":
        return lte(a, b, loose);
      default:
        throw new TypeError(`Invalid operator: ${op}`);
    }
  };
  module.exports = cmp;
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var parse = require_parse();
  var { safeRe: re, t } = require_re();
  var coerce = (version, options) => {
    if (version instanceof SemVer) {
      return version;
    }
    if (typeof version === "number") {
      version = String(version);
    }
    if (typeof version !== "string") {
      return null;
    }
    options = options || {};
    let match = null;
    if (!options.rtl) {
      match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
    } else {
      const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
      let next;
      while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
        if (!match || next.index + next[0].length !== match.index + match[0].length) {
          match = next;
        }
        coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
      }
      coerceRtlRegex.lastIndex = -1;
    }
    if (match === null) {
      return null;
    }
    const major = match[2];
    const minor = match[3] || "0";
    const patch = match[4] || "0";
    const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
    const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
    return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
  };
  module.exports = coerce;
});

// node_modules/semver/functions/truncate.js
var require_truncate = __commonJS(function(exports, module) {
  var parse = require_parse();
  var constants = require_constants();
  var SemVer = require_semver();
  var truncate = (version, truncation, options) => {
    if (!constants.RELEASE_TYPES.includes(truncation)) {
      return null;
    }
    const clonedVersion = cloneInputVersion(version, options);
    return clonedVersion && doTruncation(clonedVersion, truncation);
  };
  var cloneInputVersion = (version, options) => {
    const versionStringToParse = version instanceof SemVer ? version.version : version;
    return parse(versionStringToParse, options);
  };
  var doTruncation = (version, truncation) => {
    if (isPrerelease(truncation)) {
      return version.version;
    }
    version.prerelease = [];
    switch (truncation) {
      case "major":
        version.minor = 0;
        version.patch = 0;
        break;
      case "minor":
        version.patch = 0;
        break;
    }
    return version.format();
  };
  var isPrerelease = (type) => {
    return type.startsWith("pre");
  };
  module.exports = truncate;
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS(function(exports, module) {
  class LRUCache {
    constructor() {
      this.max = 1000;
      this.map = new Map;
    }
    get(key) {
      const value = this.map.get(key);
      if (value === undefined) {
        return;
      } else {
        this.map.delete(key);
        this.map.set(key, value);
        return value;
      }
    }
    delete(key) {
      return this.map.delete(key);
    }
    set(key, value) {
      const deleted = this.delete(key);
      if (!deleted && value !== undefined) {
        if (this.map.size >= this.max) {
          const firstKey = this.map.keys().next().value;
          this.delete(firstKey);
        }
        this.map.set(key, value);
      }
      return this;
    }
  }
  module.exports = LRUCache;
});

// node_modules/semver/classes/range.js
var require_range = __commonJS(function(exports, module) {
  var SPACE_CHARACTERS = /\s+/g;

  class Range {
    constructor(range, options) {
      options = parseOptions(options);
      if (range instanceof Range) {
        if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
          return range;
        } else {
          return new Range(range.raw, options);
        }
      }
      if (range instanceof Comparator) {
        this.raw = range.value;
        this.set = [[range]];
        this.formatted = undefined;
        return this;
      }
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
      this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
      if (!this.set.length) {
        throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
      }
      if (this.set.length > 1) {
        const first = this.set[0];
        this.set = this.set.filter((c) => !isNullSet(c[0]));
        if (this.set.length === 0) {
          this.set = [first];
        } else if (this.set.length > 1) {
          for (const c of this.set) {
            if (c.length === 1 && isAny(c[0])) {
              this.set = [c];
              break;
            }
          }
        }
      }
      this.formatted = undefined;
    }
    get range() {
      if (this.formatted === undefined) {
        this.formatted = "";
        for (let i = 0;i < this.set.length; i++) {
          if (i > 0) {
            this.formatted += "||";
          }
          const comps = this.set[i];
          for (let k = 0;k < comps.length; k++) {
            if (k > 0) {
              this.formatted += " ";
            }
            this.formatted += comps[k].toString().trim();
          }
        }
      }
      return this.formatted;
    }
    format() {
      return this.range;
    }
    toString() {
      return this.range;
    }
    parseRange(range) {
      range = range.replace(BUILDSTRIPRE, "");
      const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
      const memoKey = memoOpts + ":" + range;
      const cached = cache.get(memoKey);
      if (cached) {
        return cached;
      }
      const loose = this.options.loose;
      const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
      range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
      debug("hyphen replace", range);
      range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
      debug("comparator trim", range);
      range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
      debug("tilde trim", range);
      range = range.replace(re[t.CARETTRIM], caretTrimReplace);
      debug("caret trim", range);
      let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
      if (loose) {
        rangeList = rangeList.filter((comp) => {
          debug("loose invalid filter", comp, this.options);
          return !!comp.match(re[t.COMPARATORLOOSE]);
        });
      }
      debug("range list", rangeList);
      const rangeMap = new Map;
      const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
      for (const comp of comparators) {
        if (isNullSet(comp)) {
          return [comp];
        }
        rangeMap.set(comp.value, comp);
      }
      if (rangeMap.size > 1 && rangeMap.has("")) {
        rangeMap.delete("");
      }
      const result = [...rangeMap.values()];
      cache.set(memoKey, result);
      return result;
    }
    intersects(range, options) {
      if (!(range instanceof Range)) {
        throw new TypeError("a Range is required");
      }
      return this.set.some((thisComparators) => {
        return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
          return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
            return rangeComparators.every((rangeComparator) => {
              return thisComparator.intersects(rangeComparator, options);
            });
          });
        });
      });
    }
    test(version) {
      if (!version) {
        return false;
      }
      if (typeof version === "string") {
        try {
          version = new SemVer(version, this.options);
        } catch (er) {
          return false;
        }
      }
      for (let i = 0;i < this.set.length; i++) {
        if (testSet(this.set[i], version, this.options)) {
          return true;
        }
      }
      return false;
    }
  }
  module.exports = Range;
  var LRU = require_lrucache();
  var cache = new LRU;
  var parseOptions = require_parse_options();
  var Comparator = require_comparator();
  var debug = require_debug();
  var SemVer = require_semver();
  var {
    safeRe: re,
    src,
    t,
    comparatorTrimReplace,
    tildeTrimReplace,
    caretTrimReplace
  } = require_re();
  var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
  var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
  var isNullSet = (c) => c.value === "<0.0.0-0";
  var isAny = (c) => c.value === "";
  var isSatisfiable = (comparators, options) => {
    let result = true;
    const remainingComparators = comparators.slice();
    let testComparator = remainingComparators.pop();
    while (result && remainingComparators.length) {
      result = remainingComparators.every((otherComparator) => {
        return testComparator.intersects(otherComparator, options);
      });
      testComparator = remainingComparators.pop();
    }
    return result;
  };
  var parseComparator = (comp, options) => {
    comp = comp.replace(re[t.BUILD], "");
    debug("comp", comp, options);
    comp = replaceCarets(comp, options);
    debug("caret", comp);
    comp = replaceTildes(comp, options);
    debug("tildes", comp);
    comp = replaceXRanges(comp, options);
    debug("xrange", comp);
    comp = replaceStars(comp, options);
    debug("stars", comp);
    return comp;
  };
  var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
  var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
  var replaceTildes = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
  };
  var replaceTilde = (comp, options) => {
    const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
    const z = options.includePrerelease ? "-0" : "";
    return comp.replace(r, (_, M, m, p, pr) => {
      debug("tilde", comp, _, M, m, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m)) {
        ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
      } else if (pr) {
        debug("replaceTilde pr", pr);
        ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
      } else {
        ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
      }
      debug("tilde return", ret);
      return ret;
    });
  };
  var replaceCarets = (comp, options) => {
    return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
  };
  var replaceCaret = (comp, options) => {
    debug("caret", comp, options);
    const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
    const z = options.includePrerelease ? "-0" : "";
    return comp.replace(r, (_, M, m, p, pr) => {
      debug("caret", comp, _, M, m, p, pr);
      let ret;
      if (isX(M)) {
        ret = "";
      } else if (isX(m)) {
        ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
      } else if (isX(p)) {
        if (M === "0") {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
        }
      } else if (pr) {
        debug("replaceCaret pr", pr);
        if (M === "0") {
          if (m === "0") {
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
        }
      } else {
        debug("no pr");
        if (M === "0") {
          if (m === "0") {
            ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
          } else {
            ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
          }
        } else {
          ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
        }
      }
      debug("caret return", ret);
      return ret;
    });
  };
  var replaceXRanges = (comp, options) => {
    debug("replaceXRanges", comp, options);
    return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
  };
  var replaceXRange = (comp, options) => {
    comp = comp.trim();
    const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
    return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
      debug("xRange", comp, ret, gtlt, M, m, p, pr);
      if (invalidXRangeOrder(M, m, p)) {
        return comp;
      }
      const xM = isX(M);
      const xm = xM || isX(m);
      const xp = xm || isX(p);
      const anyX = xp;
      if (gtlt === "=" && anyX) {
        gtlt = "";
      }
      pr = options.includePrerelease ? "-0" : "";
      if (xM) {
        if (gtlt === ">" || gtlt === "<") {
          ret = "<0.0.0-0";
        } else {
          ret = "*";
        }
      } else if (gtlt && anyX) {
        if (xm) {
          m = 0;
        }
        p = 0;
        if (gtlt === ">") {
          gtlt = ">=";
          if (xm) {
            M = +M + 1;
            m = 0;
            p = 0;
          } else {
            m = +m + 1;
            p = 0;
          }
        } else if (gtlt === "<=") {
          gtlt = "<";
          if (xm) {
            M = +M + 1;
          } else {
            m = +m + 1;
          }
        }
        if (gtlt === "<") {
          pr = "-0";
        }
        ret = `${gtlt + M}.${m}.${p}${pr}`;
      } else if (xm) {
        ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
      } else if (xp) {
        ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
      }
      debug("xRange return", ret);
      return ret;
    });
  };
  var replaceStars = (comp, options) => {
    debug("replaceStars", comp, options);
    return comp.trim().replace(re[t.STAR], "");
  };
  var replaceGTE0 = (comp, options) => {
    debug("replaceGTE0", comp, options);
    return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
  };
  var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
    if (isX(fM)) {
      from = "";
    } else if (isX(fm)) {
      from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
    } else if (isX(fp)) {
      from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
    } else if (fpr) {
      from = `>=${from}`;
    } else {
      from = `>=${from}${incPr ? "-0" : ""}`;
    }
    if (isX(tM)) {
      to = "";
    } else if (isX(tm)) {
      to = `<${+tM + 1}.0.0-0`;
    } else if (isX(tp)) {
      to = `<${tM}.${+tm + 1}.0-0`;
    } else if (tpr) {
      to = `<=${tM}.${tm}.${tp}-${tpr}`;
    } else if (incPr) {
      to = `<${tM}.${tm}.${+tp + 1}-0`;
    } else {
      to = `<=${to}`;
    }
    return `${from} ${to}`.trim();
  };
  var testSet = (set, version, options) => {
    for (let i = 0;i < set.length; i++) {
      if (!set[i].test(version)) {
        return false;
      }
    }
    if (version.prerelease.length && !options.includePrerelease) {
      for (let i = 0;i < set.length; i++) {
        debug(set[i].semver);
        if (set[i].semver === Comparator.ANY) {
          continue;
        }
        if (set[i].semver.prerelease.length > 0) {
          const allowed = set[i].semver;
          if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
            return true;
          }
        }
      }
      return false;
    }
    return true;
  };
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS(function(exports, module) {
  var ANY = Symbol("SemVer ANY");

  class Comparator {
    static get ANY() {
      return ANY;
    }
    constructor(comp, options) {
      options = parseOptions(options);
      if (comp instanceof Comparator) {
        if (comp.loose === !!options.loose) {
          return comp;
        } else {
          comp = comp.value;
        }
      }
      comp = comp.trim().split(/\s+/).join(" ");
      debug("comparator", comp, options);
      this.options = options;
      this.loose = !!options.loose;
      this.parse(comp);
      if (this.semver === ANY) {
        this.value = "";
      } else {
        this.value = this.operator + this.semver.version;
      }
      debug("comp", this);
    }
    parse(comp) {
      const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
      const m = comp.match(r);
      if (!m) {
        throw new TypeError(`Invalid comparator: ${comp}`);
      }
      this.operator = m[1] !== undefined ? m[1] : "";
      if (this.operator === "=") {
        this.operator = "";
      }
      if (!m[2]) {
        this.semver = ANY;
      } else {
        this.semver = new SemVer(m[2], this.options.loose);
      }
    }
    toString() {
      return this.value;
    }
    test(version) {
      debug("Comparator.test", version, this.options.loose);
      if (this.semver === ANY || version === ANY) {
        return true;
      }
      if (typeof version === "string") {
        try {
          version = new SemVer(version, this.options);
        } catch (er) {
          return false;
        }
      }
      return cmp(version, this.operator, this.semver, this.options);
    }
    intersects(comp, options) {
      if (!(comp instanceof Comparator)) {
        throw new TypeError("a Comparator is required");
      }
      if (this.operator === "") {
        if (this.value === "") {
          return true;
        }
        return new Range(comp.value, options).test(this.value);
      } else if (comp.operator === "") {
        if (comp.value === "") {
          return true;
        }
        return new Range(this.value, options).test(comp.semver);
      }
      options = parseOptions(options);
      if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
        return false;
      }
      if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
        return false;
      }
      if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
        return true;
      }
      if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
        return true;
      }
      if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
        return true;
      }
      if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
        return true;
      }
      if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
        return true;
      }
      return false;
    }
  }
  module.exports = Comparator;
  var parseOptions = require_parse_options();
  var { safeRe: re, t } = require_re();
  var cmp = require_cmp();
  var debug = require_debug();
  var SemVer = require_semver();
  var Range = require_range();
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS(function(exports, module) {
  var Range = require_range();
  var satisfies = (version, range, options) => {
    try {
      range = new Range(range, options);
    } catch (er) {
      return false;
    }
    return range.test(version);
  };
  module.exports = satisfies;
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS(function(exports, module) {
  var Range = require_range();
  var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
  module.exports = toComparators;
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var Range = require_range();
  var maxSatisfying = (versions, range, options) => {
    let max = null;
    let maxSV = null;
    let rangeObj = null;
    try {
      rangeObj = new Range(range, options);
    } catch (er) {
      return null;
    }
    versions.forEach((v) => {
      if (rangeObj.test(v)) {
        if (!max || maxSV.compare(v) === -1) {
          max = v;
          maxSV = new SemVer(max, options);
        }
      }
    });
    return max;
  };
  module.exports = maxSatisfying;
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var Range = require_range();
  var minSatisfying = (versions, range, options) => {
    let min = null;
    let minSV = null;
    let rangeObj = null;
    try {
      rangeObj = new Range(range, options);
    } catch (er) {
      return null;
    }
    versions.forEach((v) => {
      if (rangeObj.test(v)) {
        if (!min || minSV.compare(v) === 1) {
          min = v;
          minSV = new SemVer(min, options);
        }
      }
    });
    return min;
  };
  module.exports = minSatisfying;
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var Range = require_range();
  var gt = require_gt();
  var minVersion = (range, loose) => {
    range = new Range(range, loose);
    let minver = new SemVer("0.0.0");
    if (range.test(minver)) {
      return minver;
    }
    minver = new SemVer("0.0.0-0");
    if (range.test(minver)) {
      return minver;
    }
    minver = null;
    for (let i = 0;i < range.set.length; ++i) {
      const comparators = range.set[i];
      let setMin = null;
      comparators.forEach((comparator) => {
        const compver = new SemVer(comparator.semver.version);
        switch (comparator.operator) {
          case ">":
            if (compver.prerelease.length === 0) {
              compver.patch++;
            } else {
              compver.prerelease.push(0);
            }
            compver.raw = compver.format();
          case "":
          case ">=":
            if (!setMin || gt(compver, setMin)) {
              setMin = compver;
            }
            break;
          case "<":
          case "<=":
            break;
          default:
            throw new Error(`Unexpected operation: ${comparator.operator}`);
        }
      });
      if (setMin && (!minver || gt(minver, setMin))) {
        minver = setMin;
      }
    }
    if (minver && range.test(minver)) {
      return minver;
    }
    return null;
  };
  module.exports = minVersion;
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS(function(exports, module) {
  var Range = require_range();
  var validRange = (range, options) => {
    try {
      return new Range(range, options).range || "*";
    } catch (er) {
      return null;
    }
  };
  module.exports = validRange;
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS(function(exports, module) {
  var SemVer = require_semver();
  var Comparator = require_comparator();
  var { ANY } = Comparator;
  var Range = require_range();
  var satisfies = require_satisfies();
  var gt = require_gt();
  var lt = require_lt();
  var lte = require_lte();
  var gte = require_gte();
  var outside = (version, range, hilo, options) => {
    version = new SemVer(version, options);
    range = new Range(range, options);
    let gtfn, ltefn, ltfn, comp, ecomp;
    switch (hilo) {
      case ">":
        gtfn = gt;
        ltefn = lte;
        ltfn = lt;
        comp = ">";
        ecomp = ">=";
        break;
      case "<":
        gtfn = lt;
        ltefn = gte;
        ltfn = gt;
        comp = "<";
        ecomp = "<=";
        break;
      default:
        throw new TypeError('Must provide a hilo val of "<" or ">"');
    }
    if (satisfies(version, range, options)) {
      return false;
    }
    for (let i = 0;i < range.set.length; ++i) {
      const comparators = range.set[i];
      let high = null;
      let low = null;
      comparators.forEach((comparator) => {
        if (comparator.semver === ANY) {
          comparator = new Comparator(">=0.0.0");
        }
        high = high || comparator;
        low = low || comparator;
        if (gtfn(comparator.semver, high.semver, options)) {
          high = comparator;
        } else if (ltfn(comparator.semver, low.semver, options)) {
          low = comparator;
        }
      });
      if (high.operator === comp || high.operator === ecomp) {
        return false;
      }
      if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
        return false;
      } else if (low.operator === ecomp && ltfn(version, low.semver)) {
        return false;
      }
    }
    return true;
  };
  module.exports = outside;
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS(function(exports, module) {
  var outside = require_outside();
  var gtr = (version, range, options) => outside(version, range, ">", options);
  module.exports = gtr;
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS(function(exports, module) {
  var outside = require_outside();
  var ltr = (version, range, options) => outside(version, range, "<", options);
  module.exports = ltr;
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS(function(exports, module) {
  var Range = require_range();
  var intersects = (r1, r2, options) => {
    r1 = new Range(r1, options);
    r2 = new Range(r2, options);
    return r1.intersects(r2, options);
  };
  module.exports = intersects;
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS(function(exports, module) {
  var satisfies = require_satisfies();
  var compare = require_compare();
  module.exports = (versions, range, options) => {
    const set = [];
    let first = null;
    let prev = null;
    const v = versions.sort((a, b) => compare(a, b, options));
    for (const version of v) {
      const included = satisfies(version, range, options);
      if (included) {
        prev = version;
        if (!first) {
          first = version;
        }
      } else {
        if (prev) {
          set.push([first, prev]);
        }
        prev = null;
        first = null;
      }
    }
    if (first) {
      set.push([first, null]);
    }
    const ranges = [];
    for (const [min, max] of set) {
      if (min === max) {
        ranges.push(min);
      } else if (!max && min === v[0]) {
        ranges.push("*");
      } else if (!max) {
        ranges.push(`>=${min}`);
      } else if (min === v[0]) {
        ranges.push(`<=${max}`);
      } else {
        ranges.push(`${min} - ${max}`);
      }
    }
    const simplified = ranges.join(" || ");
    const original = typeof range.raw === "string" ? range.raw : String(range);
    return simplified.length < original.length ? simplified : range;
  };
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS(function(exports, module) {
  var Range = require_range();
  var Comparator = require_comparator();
  var { ANY } = Comparator;
  var satisfies = require_satisfies();
  var compare = require_compare();
  var subset = (sub, dom, options = {}) => {
    if (sub === dom) {
      return true;
    }
    sub = new Range(sub, options);
    dom = new Range(dom, options);
    let sawNonNull = false;
    OUTER:
      for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
    return true;
  };
  var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
  var minimumVersion = [new Comparator(">=0.0.0")];
  var simpleSubset = (sub, dom, options) => {
    if (sub === dom) {
      return true;
    }
    if (sub.length === 1 && sub[0].semver === ANY) {
      if (dom.length === 1 && dom[0].semver === ANY) {
        return true;
      } else if (options.includePrerelease) {
        sub = minimumVersionWithPreRelease;
      } else {
        sub = minimumVersion;
      }
    }
    if (dom.length === 1 && dom[0].semver === ANY) {
      if (options.includePrerelease) {
        return true;
      } else {
        dom = minimumVersion;
      }
    }
    const eqSet = new Set;
    let gt, lt;
    for (const c of sub) {
      if (c.operator === ">" || c.operator === ">=") {
        gt = higherGT(gt, c, options);
      } else if (c.operator === "<" || c.operator === "<=") {
        lt = lowerLT(lt, c, options);
      } else {
        eqSet.add(c.semver);
      }
    }
    if (eqSet.size > 1) {
      return null;
    }
    let gtltComp;
    if (gt && lt) {
      gtltComp = compare(gt.semver, lt.semver, options);
      if (gtltComp > 0) {
        return null;
      } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
        return null;
      }
    }
    for (const eq of eqSet) {
      if (gt && !satisfies(eq, String(gt), options)) {
        return null;
      }
      if (lt && !satisfies(eq, String(lt), options)) {
        return null;
      }
      for (const c of dom) {
        if (!satisfies(eq, String(c), options)) {
          return false;
        }
      }
      return true;
    }
    let higher, lower;
    let hasDomLT, hasDomGT;
    let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
    let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
    if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
      needDomLTPre = false;
    }
    for (const c of dom) {
      hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
      hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
      if (gt) {
        if (needDomGTPre) {
          if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
            needDomGTPre = false;
          }
        }
        if (c.operator === ">" || c.operator === ">=") {
          higher = higherGT(gt, c, options);
          if (higher === c && higher !== gt) {
            return false;
          }
        } else if (gt.operator === ">=" && !c.test(gt.semver)) {
          return false;
        }
      }
      if (lt) {
        if (needDomLTPre) {
          if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
            needDomLTPre = false;
          }
        }
        if (c.operator === "<" || c.operator === "<=") {
          lower = lowerLT(lt, c, options);
          if (lower === c && lower !== lt) {
            return false;
          }
        } else if (lt.operator === "<=" && !c.test(lt.semver)) {
          return false;
        }
      }
      if (!c.operator && (lt || gt) && gtltComp !== 0) {
        return false;
      }
    }
    if (gt && hasDomLT && !lt && gtltComp !== 0) {
      return false;
    }
    if (lt && hasDomGT && !gt && gtltComp !== 0) {
      return false;
    }
    if (needDomGTPre || needDomLTPre) {
      return false;
    }
    return true;
  };
  var higherGT = (a, b, options) => {
    if (!a) {
      return b;
    }
    const comp = compare(a.semver, b.semver, options);
    return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
  };
  var lowerLT = (a, b, options) => {
    if (!a) {
      return b;
    }
    const comp = compare(a.semver, b.semver, options);
    return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
  };
  module.exports = subset;
});

// node_modules/semver/index.js
var require_semver2 = __commonJS(function(exports, module) {
  var internalRe = require_re();
  var constants = require_constants();
  var SemVer = require_semver();
  var identifiers = require_identifiers();
  var parse = require_parse();
  var valid = require_valid();
  var clean = require_clean();
  var inc = require_inc();
  var diff = require_diff();
  var major = require_major();
  var minor = require_minor();
  var patch = require_patch();
  var prerelease = require_prerelease();
  var compare = require_compare();
  var rcompare = require_rcompare();
  var compareLoose = require_compare_loose();
  var compareBuild = require_compare_build();
  var sort = require_sort();
  var rsort = require_rsort();
  var gt = require_gt();
  var lt = require_lt();
  var eq = require_eq();
  var neq = require_neq();
  var gte = require_gte();
  var lte = require_lte();
  var cmp = require_cmp();
  var coerce = require_coerce();
  var truncate = require_truncate();
  var Comparator = require_comparator();
  var Range = require_range();
  var satisfies = require_satisfies();
  var toComparators = require_to_comparators();
  var maxSatisfying = require_max_satisfying();
  var minSatisfying = require_min_satisfying();
  var minVersion = require_min_version();
  var validRange = require_valid2();
  var outside = require_outside();
  var gtr = require_gtr();
  var ltr = require_ltr();
  var intersects = require_intersects();
  var simplifyRange = require_simplify();
  var subset = require_subset();
  module.exports = {
    parse,
    valid,
    clean,
    inc,
    diff,
    major,
    minor,
    patch,
    prerelease,
    compare,
    rcompare,
    compareLoose,
    compareBuild,
    sort,
    rsort,
    gt,
    lt,
    eq,
    neq,
    gte,
    lte,
    cmp,
    coerce,
    truncate,
    Comparator,
    Range,
    satisfies,
    toComparators,
    maxSatisfying,
    minSatisfying,
    minVersion,
    validRange,
    outside,
    gtr,
    ltr,
    intersects,
    simplifyRange,
    subset,
    SemVer,
    re: internalRe.re,
    src: internalRe.src,
    tokens: internalRe.t,
    SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
    RELEASE_TYPES: constants.RELEASE_TYPES,
    compareIdentifiers: identifiers.compareIdentifiers,
    rcompareIdentifiers: identifiers.rcompareIdentifiers
  };
});

// node_modules/sharp/package.json
var package_default;
var init_package = __esm(() => {
  package_default = {
    name: "sharp",
    description: "High performance Node.js image processing, the fastest module to resize JPEG, PNG, WebP, GIF, AVIF and TIFF images",
    version: "0.35.4",
    author: "Lovell Fuller <npm@lovell.info>",
    homepage: "https://sharp.pixelplumbing.com",
    contributors: [
      "Pierre Inglebert <pierre.inglebert@gmail.com>",
      "Jonathan Ong <jonathanrichardong@gmail.com>",
      "Chanon Sajjamanochai <chanon.s@gmail.com>",
      "Juliano Julio <julianojulio@gmail.com>",
      "Daniel Gasienica <daniel@gasienica.ch>",
      "Julian Walker <julian@fiftythree.com>",
      "Amit Pitaru <pitaru.amit@gmail.com>",
      "Brandon Aaron <hello.brandon@aaron.sh>",
      "Andreas Lind <andreas@one.com>",
      "Maurus Cuelenaere <mcuelenaere@gmail.com>",
      "Linus Unnebäck <linus@folkdatorn.se>",
      "Victor Mateevitsi <mvictoras@gmail.com>",
      "Alaric Holloway <alaric.holloway@gmail.com>",
      "Bernhard K. Weisshuhn <bkw@codingforce.com>",
      "Chris Riley <criley@primedia.com>",
      "David Carley <dacarley@gmail.com>",
      "John Tobin <john@limelightmobileinc.com>",
      "Kenton Gray <kentongray@gmail.com>",
      "Felix Bünemann <Felix.Buenemann@gmail.com>",
      "Samy Al Zahrani <samyalzahrany@gmail.com>",
      "Chintan Thakkar <lemnisk8@gmail.com>",
      "F. Orlando Galashan <frulo@gmx.de>",
      "Kleis Auke Wolthuizen <info@kleisauke.nl>",
      "Matt Hirsch <mhirsch@media.mit.edu>",
      "Matthias Thoemmes <thoemmes@gmail.com>",
      "Patrick Paskaris <patrick@paskaris.gr>",
      "Jérémy Lal <kapouer@melix.org>",
      "Rahul Nanwani <r.nanwani@gmail.com>",
      "Alice Monday <alice0meta@gmail.com>",
      "Kristo Jorgenson <kristo.jorgenson@gmail.com>",
      "YvesBos <yves_bos@outlook.com>",
      "Guy Maliar <guy@tailorbrands.com>",
      "Nicolas Coden <nicolas@ncoden.fr>",
      "Matt Parrish <matt.r.parrish@gmail.com>",
      "Marcel Bretschneider <marcel.bretschneider@gmail.com>",
      "Matthew McEachen <matthew+github@mceachen.org>",
      "Jarda Kotěšovec <jarda.kotesovec@gmail.com>",
      "Kenric D'Souza <kenric.dsouza@gmail.com>",
      "Oleh Aleinyk <oleg.aleynik@gmail.com>",
      "Marcel Bretschneider <marcel.bretschneider@gmail.com>",
      "Andrea Bianco <andrea.bianco@unibas.ch>",
      "Rik Heywood <rik@rik.org>",
      "Thomas Parisot <hi@oncletom.io>",
      "Nathan Graves <nathanrgraves+github@gmail.com>",
      "Tom Lokhorst <tom@lokhorst.eu>",
      "Espen Hovlandsdal <espen@hovlandsdal.com>",
      "Sylvain Dumont <sylvain.dumont35@gmail.com>",
      "Alun Davies <alun.owain.davies@googlemail.com>",
      "Aidan Hoolachan <ajhoolachan21@gmail.com>",
      "Axel Eirola <axel.eirola@iki.fi>",
      "Freezy <freezy@xbmc.org>",
      "Daiz <taneli.vatanen@gmail.com>",
      "Julian Aubourg <j@ubourg.net>",
      "Keith Belovay <keith@picthrive.com>",
      "Michael B. Klein <mbklein@gmail.com>",
      "Jordan Prudhomme <jordan@raboland.fr>",
      "Ilya Ovdin <iovdin@gmail.com>",
      "Andargor <andargor@yahoo.com>",
      "Paul Neave <paul.neave@gmail.com>",
      "Brendan Kennedy <brenwken@gmail.com>",
      "Brychan Bennett-Odlum <git@brychan.io>",
      "Edward Silverton <e.silverton@gmail.com>",
      "Roman Malieiev <aromaleev@gmail.com>",
      "Tomas Szabo <tomas.szabo@deftomat.com>",
      "Robert O'Rourke <robert@o-rourke.org>",
      "Guillermo Alfonso Varela Chouciño <guillevch@gmail.com>",
      "Christian Flintrup <chr@gigahost.dk>",
      "Manan Jadhav <manan@motionden.com>",
      "Leon Radley <leon@radley.se>",
      "alza54 <alza54@thiocod.in>",
      "Jacob Smith <jacob@frende.me>",
      "Michael Nutt <michael@nutt.im>",
      "Brad Parham <baparham@gmail.com>",
      "Taneli Vatanen <taneli.vatanen@gmail.com>",
      "Joris Dugué <zaruike10@gmail.com>",
      "Chris Banks <christopher.bradley.banks@gmail.com>",
      "Ompal Singh <ompal.hitm09@gmail.com>",
      "Brodan <christopher.hranj@gmail.com>",
      "Ankur Parihar <ankur.github@gmail.com>",
      "Brahim Ait elhaj <brahima@gmail.com>",
      "Mart Jansink <m.jansink@gmail.com>",
      "Lachlan Newman <lachnewman007@gmail.com>",
      "Dennis Beatty <dennis@dcbeatty.com>",
      "Ingvar Stepanyan <me@rreverser.com>",
      "Don Denton <don@happycollision.com>",
      "Dmytro Tiapukhin <cool.gegeg@gmail.com>",
      "Florian Lefebvre <contact@florian-lefebvre.dev>"
    ],
    scripts: {
      build: "node install/build.js",
      "build:dist": "node scripts/build.mjs",
      clean: "rm -rf src/build/ test/fixtures/output.*",
      test: "npm run lint && npm run test-unit",
      lint: "npm run lint-cpp && npm run lint-js && npm run lint-types && npm run lint-publish",
      "lint-cpp": "cpplint --quiet src/*.h src/*.cc",
      "lint-js": "biome lint",
      "lint-publish": "publint --strict",
      "lint-types": "tsd --files ./test/types/sharp.test-d.{cts,mts}",
      "test-leak": "./test/leak/leak.sh",
      "test-unit": "node --experimental-test-coverage test/unit.mjs",
      "package-from-local-build": "node npm/from-local-build.js",
      "package-wasm-wrappers": "node npm/wasm-wrappers.js",
      "package-release-notes": "node npm/release-notes.js",
      "docs-build": "node docs/build.mjs",
      "docs-serve": "cd docs && npm start",
      "docs-publish": "cd docs && npm run build && npx firebase-tools deploy --project pixelplumbing --only hosting:pixelplumbing-sharp"
    },
    type: "commonjs",
    files: [
      "dist",
      "install",
      "lib/index.d.ts",
      "src/*.{cc,h,gyp}"
    ],
    main: "./dist/index.cjs",
    module: "./dist/index.mjs",
    types: "./dist/index.d.mts",
    exports: {
      ".": {
        import: {
          types: "./dist/index.d.mts",
          default: "./dist/index.mjs"
        },
        require: {
          types: "./dist/index.d.cts",
          default: "./dist/index.cjs"
        }
      }
    },
    sideEffects: true,
    repository: {
      type: "git",
      url: "git+https://github.com/lovell/sharp.git"
    },
    keywords: [
      "jpeg",
      "png",
      "webp",
      "avif",
      "tiff",
      "gif",
      "svg",
      "jp2",
      "dzi",
      "image",
      "resize",
      "thumbnail",
      "crop",
      "embed",
      "libvips",
      "vips"
    ],
    dependencies: {
      "@img/colour": "^1.1.0",
      "detect-libc": "^2.1.2",
      semver: "^7.8.5"
    },
    optionalDependencies: {
      "@img/sharp-darwin-arm64": "0.35.4",
      "@img/sharp-darwin-x64": "0.35.4",
      "@img/sharp-freebsd-wasm32": "0.35.4",
      "@img/sharp-libvips-darwin-arm64": "1.3.3",
      "@img/sharp-libvips-darwin-x64": "1.3.3",
      "@img/sharp-libvips-linux-arm": "1.3.3",
      "@img/sharp-libvips-linux-arm64": "1.3.3",
      "@img/sharp-libvips-linux-ppc64": "1.3.3",
      "@img/sharp-libvips-linux-riscv64": "1.3.3",
      "@img/sharp-libvips-linux-s390x": "1.3.3",
      "@img/sharp-libvips-linux-x64": "1.3.3",
      "@img/sharp-libvips-linuxmusl-arm64": "1.3.3",
      "@img/sharp-libvips-linuxmusl-x64": "1.3.3",
      "@img/sharp-linux-arm": "0.35.4",
      "@img/sharp-linux-arm64": "0.35.4",
      "@img/sharp-linux-ppc64": "0.35.4",
      "@img/sharp-linux-riscv64": "0.35.4",
      "@img/sharp-linux-s390x": "0.35.4",
      "@img/sharp-linux-x64": "0.35.4",
      "@img/sharp-linuxmusl-arm64": "0.35.4",
      "@img/sharp-linuxmusl-x64": "0.35.4",
      "@img/sharp-webcontainers-wasm32": "0.35.4",
      "@img/sharp-win32-arm64": "0.35.4",
      "@img/sharp-win32-ia32": "0.35.4",
      "@img/sharp-win32-x64": "0.35.4"
    },
    peerDependenciesMeta: {
      "@types/node": {
        optional: true
      }
    },
    devDependencies: {
      "@biomejs/biome": "^2.5.10",
      "@cpplint/cli": "^0.1.0",
      "@emnapi/runtime": "^1.11.3",
      "@img/sharp-libvips-dev": "1.3.3",
      "@img/sharp-libvips-dev-wasm32": "1.3.3",
      "@img/sharp-libvips-win32-arm64": "1.3.3",
      "@img/sharp-libvips-win32-ia32": "1.3.3",
      "@img/sharp-libvips-win32-x64": "1.3.3",
      "@types/node": "*",
      emnapi: "^1.11.3",
      "exif-reader": "^2.0.3",
      yauzl: "^3.4.0",
      icc: "^4.0.0",
      "node-addon-api": "^8.9.2",
      "node-gyp": "^12.4.0",
      publint: "^0.3.24",
      "tar-fs": "^3.1.3",
      tsd: "^0.33.0"
    },
    license: "Apache-2.0",
    engines: {
      node: ">=20.9.0"
    },
    config: {
      libvips: ">=8.18.6"
    },
    funding: {
      url: "https://opencollective.com/libvips"
    }
  };
});

// node_modules/sharp/dist/libvips.mjs
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
var import_semver, import_detect_libc, minimumLibvipsVersionLabelled, minimumLibvipsVersion, prebuiltPlatforms, spawnSyncOptions, log = (item) => {
  if (item instanceof Error) {
    console.error(`sharp: Installation error: ${item.message}`);
  } else {
    console.log(`sharp: ${item}`);
  }
}, runtimeLibc = () => import_detect_libc.default.isNonGlibcLinuxSync() ? import_detect_libc.default.familySync() : "", runtimePlatformArch = () => `${process.platform}${runtimeLibc()}-${process.arch}`, buildPlatformArch = () => {
  if (isEmscripten()) {
    return "wasm32";
  }
  const { npm_config_arch, npm_config_platform, npm_config_libc } = process.env;
  const libc = typeof npm_config_libc === "string" ? npm_config_libc : runtimeLibc();
  return `${npm_config_platform || process.platform}${libc}-${npm_config_arch || process.arch}`;
}, buildSharpLibvipsIncludeDir = () => {
  try {
    return __require(`@img/sharp-libvips-dev-${buildPlatformArch()}/include`);
  } catch {
    try {
      return (()=>{throw new Error("Cannot require module "+"@img/sharp-libvips-dev/include");})();
    } catch {}
  }
  return "";
}, buildSharpLibvipsCPlusPlusDir = () => {
  try {
    return (()=>{throw new Error("Cannot require module "+"@img/sharp-libvips-dev/cplusplus");})();
  } catch {}
  return "";
}, buildSharpLibvipsLibDir = () => {
  try {
    return __require(`@img/sharp-libvips-dev-${buildPlatformArch()}/lib`);
  } catch {
    try {
      return __require(`@img/sharp-libvips-${buildPlatformArch()}/lib`);
    } catch {}
  }
  return "";
}, isUnsupportedNodeRuntime = () => {
  if (process.release?.name === "node" && process.versions) {
    if (!import_semver.default.satisfies(process.versions.node, package_default.engines.node)) {
      return { found: process.versions.node, expected: package_default.engines.node };
    }
  }
}, isEmscripten = () => {
  const { CC } = process.env;
  return Boolean(CC?.endsWith("/emcc"));
}, isRosetta = () => {
  if (process.platform === "darwin" && process.arch === "x64") {
    const translated = spawnSync("sysctl sysctl.proc_translated", spawnSyncOptions).stdout;
    return (translated || "").trim() === "sysctl.proc_translated: 1";
  }
  return false;
}, sha512 = (s) => createHash("sha512").update(s).digest("hex"), yarnLocator = () => {
  try {
    const identHash = sha512(`imgsharp-libvips-${buildPlatformArch()}`);
    const npmVersion = import_semver.default.coerce(package_default.optionalDependencies[`@img/sharp-libvips-${buildPlatformArch()}`], {
      includePrerelease: true
    }).version;
    return sha512(`${identHash}npm:${npmVersion}`).slice(0, 10);
  } catch {}
  return "";
}, spawnRebuild = () => spawnSync(`node-gyp rebuild --directory=src ${isEmscripten() ? "--nodedir=emscripten" : ""}`, {
  ...spawnSyncOptions,
  stdio: "inherit"
}).status, globalLibvipsVersion = () => {
  if (process.platform !== "win32") {
    const globalLibvipsVersion = spawnSync("pkg-config --modversion vips-cpp", {
      ...spawnSyncOptions,
      env: {
        ...process.env,
        PKG_CONFIG_PATH: pkgConfigPath()
      }
    }).stdout;
    return (globalLibvipsVersion || "").trim();
  } else {
    return "";
  }
}, getBrewPkgConfigPath = () => {
  try {
    const brewPrefix = (spawnSync("brew", ["--prefix"], { encoding: "utf8" }).stdout || "").trim();
    if (brewPrefix) {
      return `${brewPrefix}/lib/pkgconfig`;
    }
  } catch (_err) {}
  return;
}, getPkgConfigPath = () => {
  try {
    const pkgConfigPath = (spawnSync("pkg-config", ["--variable", "pc_path", "pkg-config"], { encoding: "utf8" }).stdout || "").trim();
    if (pkgConfigPath) {
      return pkgConfigPath;
    }
  } catch (_err) {}
  return;
}, pkgConfigPath = () => {
  if (process.platform !== "win32") {
    return [
      getBrewPkgConfigPath(),
      getPkgConfigPath(),
      process.env.PKG_CONFIG_PATH
    ].filter(Boolean).join(":");
  } else {
    return "";
  }
}, skipSearch = (status, reason, logger) => {
  if (logger) {
    logger(`Detected ${reason}, skipping search for globally-installed libvips`);
  }
  return status;
}, useGlobalLibvips = (logger) => {
  if (Boolean(process.env.SHARP_IGNORE_GLOBAL_LIBVIPS) === true) {
    return skipSearch(false, "SHARP_IGNORE_GLOBAL_LIBVIPS", logger);
  }
  if (Boolean(process.env.SHARP_FORCE_GLOBAL_LIBVIPS) === true) {
    return skipSearch(true, "SHARP_FORCE_GLOBAL_LIBVIPS", logger);
  }
  if (isRosetta()) {
    return skipSearch(false, "Rosetta", logger);
  }
  const globalVipsVersion = globalLibvipsVersion();
  return !!globalVipsVersion && import_semver.default.gte(globalVipsVersion, minimumLibvipsVersion);
}, libvips_default;
var init_libvips = __esm(() => {
  init_package();
  import_semver = __toESM(require_semver2(), 1);
  import_detect_libc = __toESM(require_detect_libc(), 1);
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  minimumLibvipsVersionLabelled = process.env.npm_package_config_libvips || package_default.config.libvips;
  minimumLibvipsVersion = import_semver.default.coerce(minimumLibvipsVersionLabelled).version;
  prebuiltPlatforms = [
    "darwin-arm64",
    "darwin-x64",
    "freebsd-arm64",
    "freebsd-x64",
    "linux-arm",
    "linux-arm64",
    "linux-ppc64",
    "linux-riscv64",
    "linux-s390x",
    "linux-wasm32",
    "linux-x64",
    "linuxmusl-arm64",
    "linuxmusl-x64",
    "win32-arm64",
    "win32-ia32",
    "win32-x64"
  ];
  spawnSyncOptions = {
    encoding: "utf8",
    shell: true
  };
  libvips_default = {
    minimumLibvipsVersion,
    prebuiltPlatforms,
    buildPlatformArch,
    buildSharpLibvipsIncludeDir,
    buildSharpLibvipsCPlusPlusDir,
    buildSharpLibvipsLibDir,
    isUnsupportedNodeRuntime,
    runtimePlatformArch,
    log,
    yarnLocator,
    spawnRebuild,
    globalLibvipsVersion,
    pkgConfigPath,
    useGlobalLibvips
  };
});

// node_modules/sharp/dist/sharp.mjs
import { createRequire as createRequire2 } from "node:module";
var import_detect_libc2, require2, version, runtimePlatformArch2, isUnsupportedNodeRuntime2, prebuiltPlatforms2, minimumLibvipsVersion2, runtimePlatform, sharp, errors, sharp_default;
var init_sharp = __esm(() => {
  init_libvips();
  init_package();
  import_detect_libc2 = __toESM(require_detect_libc(), 1);
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  require2 = createRequire2(import.meta.url);
  ({ version } = package_default);
  ({ runtimePlatformArch: runtimePlatformArch2, isUnsupportedNodeRuntime: isUnsupportedNodeRuntime2, prebuiltPlatforms: prebuiltPlatforms2, minimumLibvipsVersion: minimumLibvipsVersion2 } = libvips_default);
  runtimePlatform = runtimePlatformArch2();
  errors = [];
  try {
    sharp = require2(`../src/build/Release/sharp-${runtimePlatform}-${version}.node`);
  } catch (err) {
    errors.push(err);
  }
  if (!sharp) {
    try {
      sharp = require2(`../src/build/Release/sharp-wasm32-${version}.node`);
    } catch (err) {
      errors.push(err);
    }
  }
  if (!sharp) {
    try {
      switch (runtimePlatform) {
        case "darwin-arm64":
          sharp = require2("@img/sharp-darwin-arm64/sharp.node");
          break;
        case "darwin-x64":
          sharp = require2("@img/sharp-darwin-x64/sharp.node");
          break;
        case "linux-arm":
          sharp = require2("@img/sharp-linux-arm/sharp.node");
          break;
        case "linux-arm64":
          sharp = require2("@img/sharp-linux-arm64/sharp.node");
          break;
        case "linux-ppc64":
          sharp = require2("@img/sharp-linux-ppc64/sharp.node");
          break;
        case "linux-riscv64":
          sharp = require2("@img/sharp-linux-riscv64/sharp.node");
          break;
        case "linux-s390x":
          sharp = require2("@img/sharp-linux-s390x/sharp.node");
          break;
        case "linux-x64":
          sharp = require2("@img/sharp-linux-x64/sharp.node");
          break;
        case "linuxmusl-arm64":
          sharp = require2("@img/sharp-linuxmusl-arm64/sharp.node");
          break;
        case "linuxmusl-x64":
          sharp = require2("@img/sharp-linuxmusl-x64/sharp.node");
          break;
        case "win32-arm64":
          sharp = require2("@img/sharp-win32-arm64/sharp.node");
          break;
        case "win32-ia32":
          sharp = require2("@img/sharp-win32-ia32/sharp.node");
          break;
        case "win32-x64":
          sharp = require2("@img/sharp-win32-x64/sharp.node");
          break;
        case "freebsd-arm64":
        case "freebsd-x64":
          sharp = require2("@img/sharp-freebsd-wasm32/sharp.node");
          break;
        case "linux-wasm32":
          sharp = require2("@img/sharp-webcontainers-wasm32/sharp.node");
          break;
      }
      if (sharp && ["linux-x64", "linuxmusl-x64"].includes(runtimePlatform) && !sharp._isUsingX64V2()) {
        const err = new Error("Prebuilt binaries for Linux x64 require v2 microarchitecture");
        err.code = "Unsupported CPU";
        errors.push(err);
        sharp = null;
      }
      if (sharp && process.versions.electron && runtimePlatform.startsWith("linux")) {
        process.emitWarning("Binaries provided by Electron for use on Linux may be incompatible with sharp - see https://sharp.pixelplumbing.com/install#electron-and-linux", { code: "SharpElectronLinux" });
      }
    } catch (err) {
      errors.push(err);
    }
  }
  if (!sharp) {
    try {
      sharp = require2("@img/sharp-wasm32/sharp.node");
    } catch (err) {
      errors.push(err);
    }
  }
  if (!sharp) {
    const [isLinux, isMacOs, isWindows] = ["linux", "darwin", "win32"].map((os) => runtimePlatform.startsWith(os));
    const help = [`Could not load the "sharp" module using the ${runtimePlatform} runtime`];
    errors.forEach((err) => {
      if (!err.code.endsWith("MODULE_NOT_FOUND")) {
        help.push(`${err.code}: ${err.message}`);
      }
    });
    const messages = errors.map((err) => err.message).join(" ");
    help.push("Possible solutions:");
    if (isUnsupportedNodeRuntime2()) {
      const { found, expected } = isUnsupportedNodeRuntime2();
      help.push("- Please upgrade Node.js:", `    Found ${found}`, `    Requires ${expected}`);
    } else if (prebuiltPlatforms2.includes(runtimePlatform)) {
      const [os, cpu] = runtimePlatform.split("-");
      const libc = os.endsWith("musl") ? " --libc=musl" : "";
      help.push("- Ensure optional dependencies can be installed:", "    npm install --include=optional sharp", "- Ensure your package manager supports multi-platform installation:", "    See https://sharp.pixelplumbing.com/install#cross-platform", "- Add platform-specific dependencies:", `    npm install --os=${os.replace("musl", "")}${libc} --cpu=${cpu} sharp`);
    } else {
      help.push(`- Manually install libvips >= ${minimumLibvipsVersion2}`, "    See https://sharp.pixelplumbing.com/install#building-from-source", "- Add WebAssembly-based dependencies:", "    npm install sharp @img/sharp-wasm32");
    }
    if (isLinux && /(symbol not found|CXXABI_)/i.test(messages)) {
      try {
        const { config } = require2(`@img/sharp-libvips-${runtimePlatform}/package`);
        const libcFound = `${import_detect_libc2.familySync()} ${import_detect_libc2.versionSync()}`;
        const libcRequires = `${config.musl ? "musl" : "glibc"} ${config.musl || config.glibc}`;
        help.push("- Update your OS:", `    Found ${libcFound}`, `    Requires ${libcRequires}`);
      } catch (_errEngines) {}
    }
    if (isLinux && /\/snap\/core[0-9]{2}/.test(messages)) {
      help.push("- Remove the Node.js Snap, which does not support native modules", "    snap remove node");
    }
    if (isMacOs && /Incompatible library version/.test(messages)) {
      help.push("- Update Homebrew:", "    brew update && brew upgrade vips");
    }
    if (errors.some((err) => err.code === "ERR_DLOPEN_DISABLED")) {
      help.push("- Run Node.js without using the --no-addons flag");
    }
    if (isWindows && /The specified procedure could not be found/.test(messages)) {
      help.push("- Using the canvas package on Windows?", "    See https://sharp.pixelplumbing.com/install#canvas-and-windows", "- Check for outdated versions of sharp in the dependency tree:", "    npm ls sharp");
    }
    help.push("- Consult the installation documentation:", "    See https://sharp.pixelplumbing.com/install");
    throw new Error(help.join(`
`));
  }
  sharp_default = sharp;
});

// node_modules/sharp/dist/constructor.mjs
import util from "node:util";
import stream from "node:stream";
function clone() {
  const clone = this.constructor.call();
  const { debuglog, queueListener, ...options } = this.options;
  clone.options = structuredClone(options);
  clone.options.debuglog = debuglog;
  clone.options.queueListener = queueListener;
  if (this._isStreamInput()) {
    this._whenStreamInFinished(() => {
      this._flattenBufferIn();
      clone.options.input.buffer = this.options.input.buffer;
      clone.emit("finish");
    });
  }
  return clone;
}
var debuglog, queueListener = (queueLength) => {
  Sharp.queue.emit("change", queueLength);
}, Sharp = function(input, options) {
  if (arguments.length === 1 && !is_default.defined(input)) {
    throw new Error("Invalid input");
  }
  if (!(this instanceof Sharp)) {
    return new Sharp(input, options);
  }
  stream.Duplex.call(this);
  this.options = {
    topOffsetPre: -1,
    leftOffsetPre: -1,
    widthPre: -1,
    heightPre: -1,
    topOffsetPost: -1,
    leftOffsetPost: -1,
    widthPost: -1,
    heightPost: -1,
    width: -1,
    height: -1,
    canvas: "crop",
    position: 0,
    resizeBackground: [0, 0, 0, 255],
    angle: 0,
    rotationAngle: 0,
    rotationBackground: [0, 0, 0, 255],
    rotateBefore: false,
    orientBefore: false,
    flip: false,
    flop: false,
    extendTop: 0,
    extendBottom: 0,
    extendLeft: 0,
    extendRight: 0,
    extendBackground: [0, 0, 0, 255],
    extendWith: "background",
    withoutEnlargement: false,
    withoutReduction: false,
    affineMatrix: [],
    affineBackground: [0, 0, 0, 255],
    affineIdx: 0,
    affineIdy: 0,
    affineOdx: 0,
    affineOdy: 0,
    affineInterpolator: this.constructor.interpolators.bilinear,
    kernel: "lanczos3",
    fastShrinkOnLoad: true,
    tint: [-1, 0, 0, 0],
    flatten: false,
    flattenBackground: [0, 0, 0],
    unflatten: false,
    negate: false,
    negateAlpha: true,
    medianSize: 0,
    blurSigma: 0,
    precision: "integer",
    minAmpl: 0.2,
    sharpenSigma: 0,
    sharpenM1: 1,
    sharpenM2: 2,
    sharpenX1: 2,
    sharpenY2: 10,
    sharpenY3: 20,
    threshold: 0,
    thresholdGrayscale: true,
    trimBackground: [],
    trimThreshold: -1,
    trimLineArt: false,
    trimMargin: 0,
    dilateWidth: 0,
    erodeWidth: 0,
    gamma: 0,
    gammaOut: 0,
    greyscale: false,
    normalise: false,
    normaliseLower: 1,
    normaliseUpper: 99,
    claheWidth: 0,
    claheHeight: 0,
    claheMaxSlope: 3,
    brightness: 1,
    saturation: 1,
    hue: 0,
    lightness: 0,
    booleanBufferIn: null,
    booleanFileIn: "",
    joinChannelIn: [],
    extractChannel: -1,
    removeAlpha: false,
    ensureAlpha: -1,
    colourspace: "srgb",
    colourspacePipeline: "last",
    composite: [],
    fileOut: "",
    formatOut: "input",
    streamOut: false,
    typedArrayOut: false,
    keepMetadata: 0,
    withMetadataOrientation: -1,
    withMetadataDensity: 0,
    withIccProfile: "",
    withExif: {},
    withExifMerge: true,
    withXmp: "",
    keepGainMap: false,
    withGainMap: false,
    resolveWithObject: false,
    loop: -1,
    delay: [],
    jpegQuality: 80,
    jpegProgressive: false,
    jpegChromaSubsampling: "4:2:0",
    jpegTrellisQuantisation: false,
    jpegOvershootDeringing: false,
    jpegOptimiseScans: false,
    jpegOptimiseCoding: true,
    jpegQuantisationTable: 0,
    pngProgressive: false,
    pngCompressionLevel: 6,
    pngAdaptiveFiltering: false,
    pngPalette: false,
    pngQuality: 100,
    pngEffort: 7,
    pngBitdepth: 8,
    pngDither: 1,
    jp2Quality: 80,
    jp2TileHeight: 512,
    jp2TileWidth: 512,
    jp2Lossless: false,
    jp2ChromaSubsampling: "4:4:4",
    webpQuality: 80,
    webpAlphaQuality: 100,
    webpLossless: false,
    webpNearLossless: false,
    webpSmartSubsample: false,
    webpSmartDeblock: false,
    webpPreset: "default",
    webpEffort: 4,
    webpMinSize: false,
    webpMixed: false,
    webpExact: false,
    gifBitdepth: 8,
    gifEffort: 7,
    gifDither: 1,
    gifInterFrameMaxError: 0,
    gifInterPaletteMaxError: 3,
    gifKeepDuplicateFrames: false,
    gifReuse: true,
    gifProgressive: false,
    tiffQuality: 80,
    tiffCompression: "jpeg",
    tiffBigtiff: false,
    tiffPredictor: "horizontal",
    tiffPyramid: false,
    tiffMiniswhite: false,
    tiffBitdepth: 0,
    tiffTile: false,
    tiffTileHeight: 256,
    tiffTileWidth: 256,
    tiffXres: 1,
    tiffYres: 1,
    tiffResolutionUnit: "inch",
    heifQuality: 50,
    heifLossless: false,
    heifCompression: "av1",
    heifEffort: 4,
    heifChromaSubsampling: "4:4:4",
    heifBitdepth: 8,
    heifTune: "auto",
    jxlDistance: 1,
    jxlDecodingTier: 0,
    jxlEffort: 7,
    jxlLossless: false,
    rawDepth: "uchar",
    tileSize: 256,
    tileOverlap: 0,
    tileContainer: "fs",
    tileLayout: "dz",
    tileFormat: "last",
    tileDepth: "last",
    tileAngle: 0,
    tileSkipBlanks: -1,
    tileBackground: [255, 255, 255, 255],
    tileCentre: false,
    tileId: "https://example.com/iiif",
    tileBasename: "",
    timeoutSeconds: 0,
    linearA: [],
    linearB: [],
    pdfBackground: [255, 255, 255, 255],
    debuglog: (warning) => {
      this.emit("warning", warning);
      debuglog(warning);
    },
    queueListener
  };
  this.options.input = this._createInputDescriptor(input, options, { allowStream: true });
  return this;
}, constructor_default;
var init_constructor = __esm(() => {
  init_is();
  init_sharp();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  debuglog = util.debuglog("sharp");
  Object.setPrototypeOf(Sharp.prototype, stream.Duplex.prototype);
  Object.setPrototypeOf(Sharp, stream.Duplex);
  Object.assign(Sharp.prototype, { clone });
  constructor_default = Sharp;
});

// node_modules/sharp/dist/input.mjs
function _inputOptionsFromObject(obj) {
  const params = inputStreamParameters.filter((p) => is_default.defined(obj[p])).map((p) => [p, obj[p]]);
  return params.length ? Object.fromEntries(params) : undefined;
}
function _createInputDescriptor(input, inputOptions, containerOptions) {
  const inputDescriptor = {
    autoOrient: false,
    failOn: "warning",
    limitInputPixels: 16383 ** 2,
    limitInputChannels: 5,
    ignoreIcc: false,
    unlimited: false,
    sequentialRead: true
  };
  if (is_default.string(input)) {
    inputDescriptor.file = input;
  } else if (is_default.buffer(input)) {
    if (input.length === 0) {
      throw Error("Input Buffer is empty");
    }
    inputDescriptor.buffer = input;
  } else if (is_default.arrayBuffer(input)) {
    if (input.byteLength === 0) {
      throw Error("Input bit Array is empty");
    }
    inputDescriptor.buffer = Buffer.from(input, 0, input.byteLength);
  } else if (is_default.typedArray(input)) {
    if (input.length === 0) {
      throw Error("Input Bit Array is empty");
    }
    inputDescriptor.buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else if (is_default.plainObject(input) && !is_default.defined(inputOptions)) {
    inputOptions = input;
    if (_inputOptionsFromObject(inputOptions)) {
      inputDescriptor.buffer = [];
    }
  } else if (!is_default.defined(input) && !is_default.defined(inputOptions) && is_default.object(containerOptions) && containerOptions.allowStream) {
    inputDescriptor.buffer = [];
  } else if (Array.isArray(input)) {
    if (input.length > 1) {
      if (!this.options.joining) {
        this.options.joining = true;
        this.options.join = input.map((i) => this._createInputDescriptor(i));
      } else {
        throw new Error("Recursive join is unsupported");
      }
    } else {
      throw new Error("Expected at least two images to join");
    }
  } else {
    throw new Error(`Unsupported input '${input}' of type ${typeof input}${is_default.defined(inputOptions) ? ` when also providing options of type ${typeof inputOptions}` : ""}`);
  }
  if (is_default.object(inputOptions)) {
    if (is_default.defined(inputOptions.failOn)) {
      if (is_default.string(inputOptions.failOn) && is_default.inArray(inputOptions.failOn, ["none", "truncated", "error", "warning"])) {
        inputDescriptor.failOn = inputOptions.failOn;
      } else {
        throw is_default.invalidParameterError("failOn", "one of: none, truncated, error, warning", inputOptions.failOn);
      }
    }
    if (is_default.defined(inputOptions.autoOrient)) {
      if (is_default.bool(inputOptions.autoOrient)) {
        inputDescriptor.autoOrient = inputOptions.autoOrient;
      } else {
        throw is_default.invalidParameterError("autoOrient", "boolean", inputOptions.autoOrient);
      }
    }
    if (is_default.defined(inputOptions.density)) {
      if (is_default.number(inputOptions.density) && is_default.inRange(inputOptions.density, 1, 1e5)) {
        inputDescriptor.density = inputOptions.density;
      } else {
        throw is_default.invalidParameterError("density", "number between 1 and 100000", inputOptions.density);
      }
    }
    if (is_default.defined(inputOptions.ignoreIcc)) {
      if (is_default.bool(inputOptions.ignoreIcc)) {
        inputDescriptor.ignoreIcc = inputOptions.ignoreIcc;
      } else {
        throw is_default.invalidParameterError("ignoreIcc", "boolean", inputOptions.ignoreIcc);
      }
    }
    if (is_default.defined(inputOptions.limitInputPixels)) {
      if (is_default.bool(inputOptions.limitInputPixels)) {
        inputDescriptor.limitInputPixels = inputOptions.limitInputPixels ? 16383 ** 2 : 0;
      } else if (is_default.integer(inputOptions.limitInputPixels) && is_default.inRange(inputOptions.limitInputPixels, 0, Number.MAX_SAFE_INTEGER)) {
        inputDescriptor.limitInputPixels = inputOptions.limitInputPixels;
      } else {
        throw is_default.invalidParameterError("limitInputPixels", "positive integer", inputOptions.limitInputPixels);
      }
    }
    if (is_default.defined(inputOptions.limitInputChannels)) {
      if (is_default.bool(inputOptions.limitInputChannels)) {
        inputDescriptor.limitInputChannels = inputOptions.limitInputChannels ? 5 : 0;
      } else if (is_default.integer(inputOptions.limitInputChannels) && is_default.inRange(inputOptions.limitInputChannels, 0, Number.MAX_SAFE_INTEGER)) {
        inputDescriptor.limitInputChannels = inputOptions.limitInputChannels;
      } else {
        throw is_default.invalidParameterError("limitInputChannels", "positive integer", inputOptions.limitInputChannels);
      }
    }
    if (is_default.defined(inputOptions.unlimited)) {
      if (is_default.bool(inputOptions.unlimited)) {
        inputDescriptor.unlimited = inputOptions.unlimited;
      } else {
        throw is_default.invalidParameterError("unlimited", "boolean", inputOptions.unlimited);
      }
    }
    if (is_default.defined(inputOptions.sequentialRead)) {
      if (is_default.bool(inputOptions.sequentialRead)) {
        inputDescriptor.sequentialRead = inputOptions.sequentialRead;
      } else {
        throw is_default.invalidParameterError("sequentialRead", "boolean", inputOptions.sequentialRead);
      }
    }
    if (is_default.defined(inputOptions.raw)) {
      if (is_default.object(inputOptions.raw) && is_default.integer(inputOptions.raw.width) && is_default.inRange(inputOptions.raw.width, 1, 1e8) && is_default.integer(inputOptions.raw.height) && is_default.inRange(inputOptions.raw.height, 1, 1e8) && is_default.integer(inputOptions.raw.channels) && is_default.inRange(inputOptions.raw.channels, 1, 4)) {
        inputDescriptor.rawWidth = inputOptions.raw.width;
        inputDescriptor.rawHeight = inputOptions.raw.height;
        inputDescriptor.rawChannels = inputOptions.raw.channels;
        switch (input.constructor) {
          case Uint8Array:
          case Uint8ClampedArray:
            inputDescriptor.rawDepth = "uchar";
            break;
          case Int8Array:
            inputDescriptor.rawDepth = "char";
            break;
          case Uint16Array:
            inputDescriptor.rawDepth = "ushort";
            break;
          case Int16Array:
            inputDescriptor.rawDepth = "short";
            break;
          case Uint32Array:
            inputDescriptor.rawDepth = "uint";
            break;
          case Int32Array:
            inputDescriptor.rawDepth = "int";
            break;
          case Float32Array:
            inputDescriptor.rawDepth = "float";
            break;
          case Float64Array:
            inputDescriptor.rawDepth = "double";
            break;
          default:
            inputDescriptor.rawDepth = "uchar";
            break;
        }
      } else {
        throw new Error("Expected width, height and channels for raw pixel input");
      }
      inputDescriptor.rawPremultiplied = false;
      if (is_default.defined(inputOptions.raw.premultiplied)) {
        if (is_default.bool(inputOptions.raw.premultiplied)) {
          inputDescriptor.rawPremultiplied = inputOptions.raw.premultiplied;
        } else {
          throw is_default.invalidParameterError("raw.premultiplied", "boolean", inputOptions.raw.premultiplied);
        }
      }
      inputDescriptor.rawPageHeight = 0;
      if (is_default.defined(inputOptions.raw.pageHeight)) {
        if (is_default.integer(inputOptions.raw.pageHeight) && inputOptions.raw.pageHeight > 0 && inputOptions.raw.pageHeight <= inputOptions.raw.height) {
          if (inputOptions.raw.height % inputOptions.raw.pageHeight !== 0) {
            throw new Error(`Expected raw.height ${inputOptions.raw.height} to be a multiple of raw.pageHeight ${inputOptions.raw.pageHeight}`);
          }
          inputDescriptor.rawPageHeight = inputOptions.raw.pageHeight;
        } else {
          throw is_default.invalidParameterError("raw.pageHeight", "positive integer", inputOptions.raw.pageHeight);
        }
      }
    }
    if (is_default.defined(inputOptions.animated)) {
      if (is_default.bool(inputOptions.animated)) {
        inputDescriptor.pages = inputOptions.animated ? -1 : 1;
      } else {
        throw is_default.invalidParameterError("animated", "boolean", inputOptions.animated);
      }
    }
    if (is_default.defined(inputOptions.pages)) {
      if (is_default.integer(inputOptions.pages) && is_default.inRange(inputOptions.pages, -1, 1e5)) {
        inputDescriptor.pages = inputOptions.pages;
      } else {
        throw is_default.invalidParameterError("pages", "integer between -1 and 100000", inputOptions.pages);
      }
    }
    if (is_default.defined(inputOptions.page)) {
      if (is_default.integer(inputOptions.page) && is_default.inRange(inputOptions.page, 0, 1e5)) {
        inputDescriptor.page = inputOptions.page;
      } else {
        throw is_default.invalidParameterError("page", "integer between 0 and 100000", inputOptions.page);
      }
    }
    if (is_default.object(inputOptions.openSlide) && is_default.defined(inputOptions.openSlide.level)) {
      if (is_default.integer(inputOptions.openSlide.level) && is_default.inRange(inputOptions.openSlide.level, 0, 256)) {
        inputDescriptor.openSlideLevel = inputOptions.openSlide.level;
      } else {
        throw is_default.invalidParameterError("openSlide.level", "integer between 0 and 256", inputOptions.openSlide.level);
      }
    } else if (is_default.defined(inputOptions.level)) {
      if (is_default.integer(inputOptions.level) && is_default.inRange(inputOptions.level, 0, 256)) {
        inputDescriptor.openSlideLevel = inputOptions.level;
      } else {
        throw is_default.invalidParameterError("level", "integer between 0 and 256", inputOptions.level);
      }
    }
    if (is_default.object(inputOptions.tiff) && is_default.defined(inputOptions.tiff.subifd)) {
      if (is_default.integer(inputOptions.tiff.subifd) && is_default.inRange(inputOptions.tiff.subifd, -1, 1e5)) {
        inputDescriptor.tiffSubifd = inputOptions.tiff.subifd;
      } else {
        throw is_default.invalidParameterError("tiff.subifd", "integer between -1 and 100000", inputOptions.tiff.subifd);
      }
    } else if (is_default.defined(inputOptions.subifd)) {
      if (is_default.integer(inputOptions.subifd) && is_default.inRange(inputOptions.subifd, -1, 1e5)) {
        inputDescriptor.tiffSubifd = inputOptions.subifd;
      } else {
        throw is_default.invalidParameterError("subifd", "integer between -1 and 100000", inputOptions.subifd);
      }
    }
    if (is_default.object(inputOptions.svg)) {
      if (is_default.defined(inputOptions.svg.stylesheet)) {
        if (is_default.string(inputOptions.svg.stylesheet)) {
          inputDescriptor.svgStylesheet = inputOptions.svg.stylesheet;
        } else {
          throw is_default.invalidParameterError("svg.stylesheet", "string", inputOptions.svg.stylesheet);
        }
      }
      if (is_default.defined(inputOptions.svg.highBitdepth)) {
        if (is_default.bool(inputOptions.svg.highBitdepth)) {
          inputDescriptor.svgHighBitdepth = inputOptions.svg.highBitdepth;
        } else {
          throw is_default.invalidParameterError("svg.highBitdepth", "boolean", inputOptions.svg.highBitdepth);
        }
      }
    }
    if (is_default.object(inputOptions.pdf) && is_default.defined(inputOptions.pdf.background)) {
      inputDescriptor.pdfBackground = this._getBackgroundColourOption(inputOptions.pdf.background);
    } else if (is_default.defined(inputOptions.pdfBackground)) {
      inputDescriptor.pdfBackground = this._getBackgroundColourOption(inputOptions.pdfBackground);
    }
    if (is_default.object(inputOptions.jp2) && is_default.defined(inputOptions.jp2.oneshot)) {
      if (is_default.bool(inputOptions.jp2.oneshot)) {
        inputDescriptor.jp2Oneshot = inputOptions.jp2.oneshot;
      } else {
        throw is_default.invalidParameterError("jp2.oneshot", "boolean", inputOptions.jp2.oneshot);
      }
    }
    if (is_default.defined(inputOptions.create)) {
      if (is_default.object(inputOptions.create) && is_default.integer(inputOptions.create.width) && is_default.inRange(inputOptions.create.width, 1, 1e8) && is_default.integer(inputOptions.create.height) && is_default.inRange(inputOptions.create.height, 1, 1e8) && is_default.integer(inputOptions.create.channels)) {
        inputDescriptor.createWidth = inputOptions.create.width;
        inputDescriptor.createHeight = inputOptions.create.height;
        inputDescriptor.createChannels = inputOptions.create.channels;
        inputDescriptor.createPageHeight = 0;
        if (is_default.defined(inputOptions.create.pageHeight)) {
          if (is_default.integer(inputOptions.create.pageHeight) && inputOptions.create.pageHeight > 0 && inputOptions.create.pageHeight <= inputOptions.create.height) {
            if (inputOptions.create.height % inputOptions.create.pageHeight !== 0) {
              throw new Error(`Expected create.height ${inputOptions.create.height} to be a multiple of create.pageHeight ${inputOptions.create.pageHeight}`);
            }
            inputDescriptor.createPageHeight = inputOptions.create.pageHeight;
          } else {
            throw is_default.invalidParameterError("create.pageHeight", "positive integer", inputOptions.create.pageHeight);
          }
        }
        if (is_default.defined(inputOptions.create.noise)) {
          if (!is_default.object(inputOptions.create.noise)) {
            throw new Error("Expected noise to be an object");
          }
          if (inputOptions.create.noise.type !== "gaussian") {
            throw new Error("Only gaussian noise is supported at the moment");
          }
          inputDescriptor.createNoiseType = inputOptions.create.noise.type;
          if (!is_default.inRange(inputOptions.create.channels, 1, 4)) {
            throw is_default.invalidParameterError("create.channels", "number between 1 and 4", inputOptions.create.channels);
          }
          inputDescriptor.createNoiseMean = 128;
          if (is_default.defined(inputOptions.create.noise.mean)) {
            if (is_default.number(inputOptions.create.noise.mean) && is_default.inRange(inputOptions.create.noise.mean, 0, 1e4)) {
              inputDescriptor.createNoiseMean = inputOptions.create.noise.mean;
            } else {
              throw is_default.invalidParameterError("create.noise.mean", "number between 0 and 10000", inputOptions.create.noise.mean);
            }
          }
          inputDescriptor.createNoiseSigma = 30;
          if (is_default.defined(inputOptions.create.noise.sigma)) {
            if (is_default.number(inputOptions.create.noise.sigma) && is_default.inRange(inputOptions.create.noise.sigma, 0, 1e4)) {
              inputDescriptor.createNoiseSigma = inputOptions.create.noise.sigma;
            } else {
              throw is_default.invalidParameterError("create.noise.sigma", "number between 0 and 10000", inputOptions.create.noise.sigma);
            }
          }
        } else if (is_default.defined(inputOptions.create.background)) {
          if (!is_default.inRange(inputOptions.create.channels, 3, 4)) {
            throw is_default.invalidParameterError("create.channels", "number between 3 and 4", inputOptions.create.channels);
          }
          inputDescriptor.createBackground = this._getBackgroundColourOption(inputOptions.create.background);
        } else {
          throw new Error("Expected valid noise or background to create a new input image");
        }
        delete inputDescriptor.buffer;
      } else {
        throw new Error("Expected valid width, height and channels to create a new input image");
      }
    }
    if (is_default.defined(inputOptions.text)) {
      if (is_default.object(inputOptions.text) && is_default.string(inputOptions.text.text)) {
        inputDescriptor.textValue = inputOptions.text.text;
        if (is_default.defined(inputOptions.text.height) && is_default.defined(inputOptions.text.dpi)) {
          throw new Error("Expected only one of dpi or height");
        }
        if (is_default.defined(inputOptions.text.font)) {
          if (is_default.string(inputOptions.text.font)) {
            inputDescriptor.textFont = inputOptions.text.font;
          } else {
            throw is_default.invalidParameterError("text.font", "string", inputOptions.text.font);
          }
        }
        if (is_default.defined(inputOptions.text.fontfile)) {
          if (is_default.string(inputOptions.text.fontfile)) {
            inputDescriptor.textFontfile = inputOptions.text.fontfile;
          } else {
            throw is_default.invalidParameterError("text.fontfile", "string", inputOptions.text.fontfile);
          }
        }
        if (is_default.defined(inputOptions.text.width)) {
          if (is_default.integer(inputOptions.text.width) && is_default.inRange(inputOptions.text.width, 1, 1e6)) {
            inputDescriptor.textWidth = inputOptions.text.width;
          } else {
            throw is_default.invalidParameterError("text.width", "integer between 1 and 1000000", inputOptions.text.width);
          }
        }
        if (is_default.defined(inputOptions.text.height)) {
          if (is_default.integer(inputOptions.text.height) && is_default.inRange(inputOptions.text.height, 1, 1e6)) {
            inputDescriptor.textHeight = inputOptions.text.height;
          } else {
            throw is_default.invalidParameterError("text.height", "integer between 1 and 1000000", inputOptions.text.height);
          }
        }
        if (is_default.defined(inputOptions.text.align)) {
          if (is_default.string(inputOptions.text.align) && is_default.string(this.constructor.align[inputOptions.text.align])) {
            inputDescriptor.textAlign = this.constructor.align[inputOptions.text.align];
          } else {
            throw is_default.invalidParameterError("text.align", "valid alignment", inputOptions.text.align);
          }
        }
        if (is_default.defined(inputOptions.text.justify)) {
          if (is_default.bool(inputOptions.text.justify)) {
            inputDescriptor.textJustify = inputOptions.text.justify;
          } else {
            throw is_default.invalidParameterError("text.justify", "boolean", inputOptions.text.justify);
          }
        }
        if (is_default.defined(inputOptions.text.dpi)) {
          if (is_default.integer(inputOptions.text.dpi) && is_default.inRange(inputOptions.text.dpi, 1, 1e6)) {
            inputDescriptor.textDpi = inputOptions.text.dpi;
          } else {
            throw is_default.invalidParameterError("text.dpi", "integer between 1 and 1000000", inputOptions.text.dpi);
          }
        }
        if (is_default.defined(inputOptions.text.rgba)) {
          if (is_default.bool(inputOptions.text.rgba)) {
            inputDescriptor.textRgba = inputOptions.text.rgba;
          } else {
            throw is_default.invalidParameterError("text.rgba", "bool", inputOptions.text.rgba);
          }
        }
        if (is_default.defined(inputOptions.text.spacing)) {
          if (is_default.integer(inputOptions.text.spacing) && is_default.inRange(inputOptions.text.spacing, -1e6, 1e6)) {
            inputDescriptor.textSpacing = inputOptions.text.spacing;
          } else {
            throw is_default.invalidParameterError("text.spacing", "integer between -1000000 and 1000000", inputOptions.text.spacing);
          }
        }
        if (is_default.defined(inputOptions.text.wrap)) {
          if (is_default.string(inputOptions.text.wrap) && is_default.inArray(inputOptions.text.wrap, ["word", "char", "word-char", "none"])) {
            inputDescriptor.textWrap = inputOptions.text.wrap;
          } else {
            throw is_default.invalidParameterError("text.wrap", "one of: word, char, word-char, none", inputOptions.text.wrap);
          }
        }
        delete inputDescriptor.buffer;
      } else {
        throw new Error("Expected a valid string to create an image with text.");
      }
    }
    if (is_default.defined(inputOptions.join)) {
      if (is_default.defined(this.options.join)) {
        if (is_default.defined(inputOptions.join.animated)) {
          if (is_default.bool(inputOptions.join.animated)) {
            inputDescriptor.joinAnimated = inputOptions.join.animated;
          } else {
            throw is_default.invalidParameterError("join.animated", "boolean", inputOptions.join.animated);
          }
        }
        if (is_default.defined(inputOptions.join.across)) {
          if (is_default.integer(inputOptions.join.across) && is_default.inRange(inputOptions.join.across, 1, 1e6)) {
            inputDescriptor.joinAcross = inputOptions.join.across;
          } else {
            throw is_default.invalidParameterError("join.across", "integer between 1 and 100000", inputOptions.join.across);
          }
        }
        if (is_default.defined(inputOptions.join.shim)) {
          if (is_default.integer(inputOptions.join.shim) && is_default.inRange(inputOptions.join.shim, 0, 1e6)) {
            inputDescriptor.joinShim = inputOptions.join.shim;
          } else {
            throw is_default.invalidParameterError("join.shim", "integer between 0 and 100000", inputOptions.join.shim);
          }
        }
        if (is_default.defined(inputOptions.join.background)) {
          inputDescriptor.joinBackground = this._getBackgroundColourOption(inputOptions.join.background);
        }
        if (is_default.defined(inputOptions.join.halign)) {
          if (is_default.string(inputOptions.join.halign) && is_default.string(this.constructor.align[inputOptions.join.halign])) {
            inputDescriptor.joinHalign = this.constructor.align[inputOptions.join.halign];
          } else {
            throw is_default.invalidParameterError("join.halign", "valid alignment", inputOptions.join.halign);
          }
        }
        if (is_default.defined(inputOptions.join.valign)) {
          if (is_default.string(inputOptions.join.valign) && is_default.string(this.constructor.align[inputOptions.join.valign])) {
            inputDescriptor.joinValign = this.constructor.align[inputOptions.join.valign];
          } else {
            throw is_default.invalidParameterError("join.valign", "valid alignment", inputOptions.join.valign);
          }
        }
      } else {
        throw new Error("Expected input to be an array of images to join");
      }
    }
  } else if (is_default.defined(inputOptions)) {
    throw new Error(`Invalid input options ${inputOptions}`);
  }
  return inputDescriptor;
}
function _write(chunk, _encoding, callback) {
  if (Array.isArray(this.options.input.buffer)) {
    if (is_default.buffer(chunk)) {
      this.options.input.buffer.push(chunk);
      callback();
    } else {
      callback(new Error("Non-Buffer data on Writable Stream"));
    }
  } else {
    callback(new Error("Unexpected data on Writable Stream"));
  }
}
function _flattenBufferIn() {
  if (this._isStreamInput()) {
    this.options.input.buffer = Buffer.concat(this.options.input.buffer);
  }
}
function _isStreamInput() {
  return Array.isArray(this.options.input.buffer);
}
function _whenStreamInFinished(fn) {
  if (this.writableFinished) {
    fn();
  } else {
    this.once("finish", fn);
  }
}
function metadata(callback) {
  const stack = Error();
  if (is_default.fn(callback)) {
    if (this._isStreamInput()) {
      this._whenStreamInFinished(() => {
        this._flattenBufferIn();
        sharp_default.metadata(this.options, (err, metadata) => {
          if (err) {
            callback(is_default.nativeError(err, stack));
          } else {
            callback(null, metadata);
          }
        });
      });
    } else {
      sharp_default.metadata(this.options, (err, metadata) => {
        if (err) {
          callback(is_default.nativeError(err, stack));
        } else {
          callback(null, metadata);
        }
      });
    }
    return this;
  } else {
    if (this._isStreamInput()) {
      return new Promise((resolve, reject) => {
        this._whenStreamInFinished(() => {
          this._flattenBufferIn();
          sharp_default.metadata(this.options, (err, metadata) => {
            if (err) {
              reject(is_default.nativeError(err, stack));
            } else {
              resolve(metadata);
            }
          });
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        sharp_default.metadata(this.options, (err, metadata) => {
          if (err) {
            reject(is_default.nativeError(err, stack));
          } else {
            resolve(metadata);
          }
        });
      });
    }
  }
}
function stats(callback) {
  const stack = Error();
  if (is_default.fn(callback)) {
    if (this._isStreamInput()) {
      this._whenStreamInFinished(() => {
        this._flattenBufferIn();
        sharp_default.stats(this.options, (err, stats) => {
          if (err) {
            callback(is_default.nativeError(err, stack));
          } else {
            callback(null, stats);
          }
        });
      });
    } else {
      sharp_default.stats(this.options, (err, stats) => {
        if (err) {
          callback(is_default.nativeError(err, stack));
        } else {
          callback(null, stats);
        }
      });
    }
    return this;
  } else {
    if (this._isStreamInput()) {
      return new Promise((resolve, reject) => {
        this._whenStreamInFinished(() => {
          this._flattenBufferIn();
          sharp_default.stats(this.options, (err, stats) => {
            if (err) {
              reject(is_default.nativeError(err, stack));
            } else {
              resolve(stats);
            }
          });
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        sharp_default.stats(this.options, (err, stats) => {
          if (err) {
            reject(is_default.nativeError(err, stack));
          } else {
            resolve(stats);
          }
        });
      });
    }
  }
}
var align, inputStreamParameters, input_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    _inputOptionsFromObject,
    _createInputDescriptor,
    _write,
    _flattenBufferIn,
    _isStreamInput,
    _whenStreamInFinished,
    metadata,
    stats
  });
  Sharp.align = align;
};
var init_input = __esm(() => {
  init_is();
  init_sharp();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  align = {
    left: "low",
    top: "low",
    low: "low",
    center: "centre",
    centre: "centre",
    right: "high",
    bottom: "high",
    high: "high"
  };
  inputStreamParameters = [
    "failOn",
    "limitInputPixels",
    "limitInputChannels",
    "unlimited",
    "animated",
    "autoOrient",
    "density",
    "ignoreIcc",
    "page",
    "pages",
    "sequentialRead",
    "jp2",
    "openSlide",
    "pdf",
    "raw",
    "svg",
    "tiff",
    "openSlideLevel",
    "pdfBackground",
    "tiffSubifd"
  ];
});

// node_modules/sharp/dist/resize.mjs
function isRotationExpected(options) {
  return options.angle % 360 !== 0 || options.rotationAngle !== 0;
}
function isResizeExpected(options) {
  return options.width !== -1 || options.height !== -1;
}
function resize(widthOrOptions, height, options) {
  if (isResizeExpected(this.options)) {
    this.options.debuglog("ignoring previous resize options");
  }
  if (this.options.widthPost !== -1) {
    this.options.debuglog("operation order will be: extract, resize, extract");
  }
  if (is_default.defined(widthOrOptions)) {
    if (is_default.object(widthOrOptions) && !is_default.defined(options)) {
      options = widthOrOptions;
    } else if (is_default.integer(widthOrOptions) && is_default.inRange(widthOrOptions, 1, 1e8)) {
      this.options.width = widthOrOptions;
    } else {
      throw is_default.invalidParameterError("width", "positive integer between 1 and 100000000", widthOrOptions);
    }
  } else {
    this.options.width = -1;
  }
  if (is_default.defined(height)) {
    if (is_default.integer(height) && is_default.inRange(height, 1, 1e8)) {
      this.options.height = height;
    } else {
      throw is_default.invalidParameterError("height", "positive integer between 1 and 100000000", height);
    }
  } else {
    this.options.height = -1;
  }
  if (is_default.object(options)) {
    if (is_default.defined(options.width)) {
      if (is_default.integer(options.width) && is_default.inRange(options.width, 1, 1e8)) {
        this.options.width = options.width;
      } else {
        throw is_default.invalidParameterError("width", "positive integer between 1 and 100000000", options.width);
      }
    }
    if (is_default.defined(options.height)) {
      if (is_default.integer(options.height) && is_default.inRange(options.height, 1, 1e8)) {
        this.options.height = options.height;
      } else {
        throw is_default.invalidParameterError("height", "positive integer between 1 and 100000000", options.height);
      }
    }
    if (is_default.defined(options.fit)) {
      const canvas = mapFitToCanvas[options.fit];
      if (is_default.string(canvas)) {
        this.options.canvas = canvas;
      } else {
        throw is_default.invalidParameterError("fit", "valid fit", options.fit);
      }
    }
    if (is_default.defined(options.position)) {
      const pos = is_default.integer(options.position) ? options.position : strategy[options.position] || position[options.position] || gravity[options.position];
      if (is_default.integer(pos) && (is_default.inRange(pos, 0, 8) || is_default.inRange(pos, 16, 17))) {
        this.options.position = pos;
      } else {
        throw is_default.invalidParameterError("position", "valid position/gravity/strategy", options.position);
      }
    }
    this._setBackgroundColourOption("resizeBackground", options.background);
    if (is_default.defined(options.kernel)) {
      if (is_default.string(kernel[options.kernel])) {
        this.options.kernel = kernel[options.kernel];
      } else {
        throw is_default.invalidParameterError("kernel", "valid kernel name", options.kernel);
      }
    }
    if (is_default.defined(options.withoutEnlargement)) {
      this._setBooleanOption("withoutEnlargement", options.withoutEnlargement);
    }
    if (is_default.defined(options.withoutReduction)) {
      this._setBooleanOption("withoutReduction", options.withoutReduction);
    }
    if (is_default.defined(options.fastShrinkOnLoad)) {
      this._setBooleanOption("fastShrinkOnLoad", options.fastShrinkOnLoad);
    }
  }
  if (isRotationExpected(this.options) && isResizeExpected(this.options)) {
    this.options.rotateBefore = true;
  }
  return this;
}
function extend(extend) {
  if (is_default.integer(extend)) {
    if (is_default.inRange(extend, 1, 1e4)) {
      this.options.extendTop = extend;
      this.options.extendBottom = extend;
      this.options.extendLeft = extend;
      this.options.extendRight = extend;
    } else {
      throw is_default.invalidParameterError("extend", "integer between 1 and 10000", extend);
    }
  } else if (is_default.object(extend)) {
    if (is_default.defined(extend.top)) {
      if (is_default.integer(extend.top) && is_default.inRange(extend.top, 0, 1e4)) {
        this.options.extendTop = extend.top;
      } else {
        throw is_default.invalidParameterError("top", "integer between 0 and 10000", extend.top);
      }
    }
    if (is_default.defined(extend.bottom)) {
      if (is_default.integer(extend.bottom) && is_default.inRange(extend.bottom, 0, 1e4)) {
        this.options.extendBottom = extend.bottom;
      } else {
        throw is_default.invalidParameterError("bottom", "integer between 0 and 10000", extend.bottom);
      }
    }
    if (is_default.defined(extend.left)) {
      if (is_default.integer(extend.left) && is_default.inRange(extend.left, 0, 1e4)) {
        this.options.extendLeft = extend.left;
      } else {
        throw is_default.invalidParameterError("left", "integer between 0 and 10000", extend.left);
      }
    }
    if (is_default.defined(extend.right)) {
      if (is_default.integer(extend.right) && is_default.inRange(extend.right, 0, 1e4)) {
        this.options.extendRight = extend.right;
      } else {
        throw is_default.invalidParameterError("right", "integer between 0 and 10000", extend.right);
      }
    }
    this._setBackgroundColourOption("extendBackground", extend.background);
    if (is_default.defined(extend.extendWith)) {
      if (is_default.string(extendWith[extend.extendWith])) {
        this.options.extendWith = extendWith[extend.extendWith];
      } else {
        throw is_default.invalidParameterError("extendWith", "one of: background, copy, repeat, mirror", extend.extendWith);
      }
    }
  } else {
    throw is_default.invalidParameterError("extend", "integer or object", extend);
  }
  return this;
}
function extract(options) {
  const suffix = isResizeExpected(this.options) || this.options.widthPre !== -1 ? "Post" : "Pre";
  if (this.options[`width${suffix}`] !== -1) {
    this.options.debuglog("ignoring previous extract options");
  }
  ["left", "top", "width", "height"].forEach(function(name) {
    const value = options[name];
    if (is_default.integer(value) && is_default.inRange(value, 0, 1e8)) {
      this.options[name + (name === "left" || name === "top" ? "Offset" : "") + suffix] = value;
    } else {
      throw is_default.invalidParameterError(name, "integer between 0 and 100000000", value);
    }
  }, this);
  if (isRotationExpected(this.options) && !isResizeExpected(this.options)) {
    if (this.options.widthPre === -1 || this.options.widthPost === -1) {
      this.options.rotateBefore = true;
    }
  }
  if (this.options.input.autoOrient) {
    this.options.orientBefore = true;
  }
  return this;
}
function trim(options) {
  this.options.trimThreshold = 10;
  if (is_default.defined(options)) {
    if (is_default.object(options)) {
      if (is_default.defined(options.background)) {
        this._setBackgroundColourOption("trimBackground", options.background);
      }
      if (is_default.defined(options.threshold)) {
        if (is_default.number(options.threshold) && options.threshold >= 0) {
          this.options.trimThreshold = options.threshold;
        } else {
          throw is_default.invalidParameterError("threshold", "positive number", options.threshold);
        }
      }
      if (is_default.defined(options.lineArt)) {
        this._setBooleanOption("trimLineArt", options.lineArt);
      }
      if (is_default.defined(options.margin)) {
        if (is_default.integer(options.margin) && is_default.inRange(options.margin, 0, 1e7)) {
          this.options.trimMargin = options.margin;
        } else {
          throw is_default.invalidParameterError("margin", "integer between 0 and 10000000", options.margin);
        }
      }
    } else {
      throw is_default.invalidParameterError("trim", "object", options);
    }
  }
  if (isRotationExpected(this.options)) {
    this.options.rotateBefore = true;
  }
  return this;
}
var gravity, position, extendWith, strategy, kernel, fit, mapFitToCanvas, resize_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    resize,
    extend,
    extract,
    trim
  });
  Sharp.gravity = gravity;
  Sharp.strategy = strategy;
  Sharp.kernel = kernel;
  Sharp.fit = fit;
  Sharp.position = position;
};
var init_resize = __esm(() => {
  init_is();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  gravity = {
    center: 0,
    centre: 0,
    north: 1,
    east: 2,
    south: 3,
    west: 4,
    northeast: 5,
    southeast: 6,
    southwest: 7,
    northwest: 8
  };
  position = {
    top: 1,
    right: 2,
    bottom: 3,
    left: 4,
    "right top": 5,
    "right bottom": 6,
    "left bottom": 7,
    "left top": 8
  };
  extendWith = {
    background: "background",
    copy: "copy",
    repeat: "repeat",
    mirror: "mirror"
  };
  strategy = {
    entropy: 16,
    attention: 17
  };
  kernel = {
    nearest: "nearest",
    linear: "linear",
    cubic: "cubic",
    mitchell: "mitchell",
    lanczos2: "lanczos2",
    lanczos3: "lanczos3",
    mks2013: "mks2013",
    mks2021: "mks2021"
  };
  fit = {
    contain: "contain",
    cover: "cover",
    fill: "fill",
    inside: "inside",
    outside: "outside"
  };
  mapFitToCanvas = {
    contain: "embed",
    cover: "crop",
    fill: "ignore_aspect",
    inside: "max",
    outside: "min"
  };
});

// node_modules/sharp/dist/composite.mjs
function composite(images) {
  if (!Array.isArray(images)) {
    throw is_default.invalidParameterError("images to composite", "array", images);
  }
  this.options.composite = images.map((image) => {
    if (!is_default.object(image)) {
      throw is_default.invalidParameterError("image to composite", "object", image);
    }
    const inputOptions = this._inputOptionsFromObject(image);
    const composite = {
      input: this._createInputDescriptor(image.input, inputOptions, { allowStream: false }),
      blend: "over",
      tile: false,
      left: 0,
      top: 0,
      hasOffset: false,
      gravity: 0,
      premultiplied: false
    };
    if (is_default.defined(image.blend)) {
      if (is_default.string(blend[image.blend])) {
        composite.blend = blend[image.blend];
      } else {
        throw is_default.invalidParameterError("blend", "valid blend name", image.blend);
      }
    }
    if (is_default.defined(image.tile)) {
      if (is_default.bool(image.tile)) {
        composite.tile = image.tile;
      } else {
        throw is_default.invalidParameterError("tile", "boolean", image.tile);
      }
    }
    if (is_default.defined(image.left)) {
      if (is_default.integer(image.left) && is_default.inRange(image.left, -1e8, 1e8)) {
        composite.left = image.left;
      } else {
        throw is_default.invalidParameterError("left", "integer between -100000000 and 100000000", image.left);
      }
    }
    if (is_default.defined(image.top)) {
      if (is_default.integer(image.top) && is_default.inRange(image.top, -1e8, 1e8)) {
        composite.top = image.top;
      } else {
        throw is_default.invalidParameterError("top", "integer between -100000000 and 100000000", image.top);
      }
    }
    if (is_default.defined(image.top) !== is_default.defined(image.left)) {
      throw new Error("Expected both left and top to be set");
    } else {
      composite.hasOffset = is_default.integer(image.top) && is_default.integer(image.left);
    }
    if (is_default.defined(image.gravity)) {
      if (is_default.integer(image.gravity) && is_default.inRange(image.gravity, 0, 8)) {
        composite.gravity = image.gravity;
      } else if (is_default.string(image.gravity) && is_default.integer(this.constructor.gravity[image.gravity])) {
        composite.gravity = this.constructor.gravity[image.gravity];
      } else {
        throw is_default.invalidParameterError("gravity", "valid gravity", image.gravity);
      }
    }
    if (is_default.defined(image.premultiplied)) {
      if (is_default.bool(image.premultiplied)) {
        composite.premultiplied = image.premultiplied;
      } else {
        throw is_default.invalidParameterError("premultiplied", "boolean", image.premultiplied);
      }
    }
    return composite;
  });
  return this;
}
var blend, composite_default = (Sharp) => {
  Sharp.prototype.composite = composite;
  Sharp.blend = blend;
};
var init_composite = __esm(() => {
  init_is();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  blend = {
    clear: "clear",
    source: "source",
    over: "over",
    in: "in",
    out: "out",
    atop: "atop",
    dest: "dest",
    "dest-over": "dest-over",
    "dest-in": "dest-in",
    "dest-out": "dest-out",
    "dest-atop": "dest-atop",
    xor: "xor",
    add: "add",
    saturate: "saturate",
    multiply: "multiply",
    screen: "screen",
    overlay: "overlay",
    darken: "darken",
    lighten: "lighten",
    "colour-dodge": "colour-dodge",
    "color-dodge": "colour-dodge",
    "colour-burn": "colour-burn",
    "color-burn": "colour-burn",
    "hard-light": "hard-light",
    "soft-light": "soft-light",
    difference: "difference",
    exclusion: "exclusion"
  };
});

// node_modules/sharp/dist/operation.mjs
function rotate(angle, options) {
  if (!is_default.defined(angle)) {
    return this.autoOrient();
  }
  if (this.options.angle || this.options.rotationAngle) {
    this.options.debuglog("ignoring previous rotate options");
    this.options.angle = 0;
    this.options.rotationAngle = 0;
  }
  if (is_default.integer(angle) && !(angle % 90)) {
    this.options.angle = angle;
  } else if (is_default.number(angle)) {
    this.options.rotationAngle = angle;
    if (is_default.object(options) && options.background) {
      this._setBackgroundColourOption("rotationBackground", options.background);
    }
  } else {
    throw is_default.invalidParameterError("angle", "numeric", angle);
  }
  return this;
}
function autoOrient() {
  this.options.input.autoOrient = true;
  return this;
}
function flip(flip) {
  this.options.flip = is_default.bool(flip) ? flip : true;
  return this;
}
function flop(flop) {
  this.options.flop = is_default.bool(flop) ? flop : true;
  return this;
}
function affine(matrix, options) {
  const isValidShape = Array.isArray(matrix) && (matrix.length === 4 && matrix.every(is_default.number) || matrix.length === 2 && matrix.every((row) => Array.isArray(row) && row.length === 2));
  const flatMatrix = isValidShape ? matrix.flat() : [];
  if (flatMatrix.length === 4 && flatMatrix.every(is_default.number)) {
    this.options.affineMatrix = flatMatrix;
  } else {
    throw is_default.invalidParameterError("matrix", "1x4 or 2x2 array", matrix);
  }
  if (is_default.defined(options)) {
    if (is_default.object(options)) {
      this._setBackgroundColourOption("affineBackground", options.background);
      if (is_default.defined(options.idx)) {
        if (is_default.number(options.idx)) {
          this.options.affineIdx = options.idx;
        } else {
          throw is_default.invalidParameterError("options.idx", "number", options.idx);
        }
      }
      if (is_default.defined(options.idy)) {
        if (is_default.number(options.idy)) {
          this.options.affineIdy = options.idy;
        } else {
          throw is_default.invalidParameterError("options.idy", "number", options.idy);
        }
      }
      if (is_default.defined(options.odx)) {
        if (is_default.number(options.odx)) {
          this.options.affineOdx = options.odx;
        } else {
          throw is_default.invalidParameterError("options.odx", "number", options.odx);
        }
      }
      if (is_default.defined(options.ody)) {
        if (is_default.number(options.ody)) {
          this.options.affineOdy = options.ody;
        } else {
          throw is_default.invalidParameterError("options.ody", "number", options.ody);
        }
      }
      if (is_default.defined(options.interpolator)) {
        if (is_default.inArray(options.interpolator, Object.values(this.constructor.interpolators))) {
          this.options.affineInterpolator = options.interpolator;
        } else {
          throw is_default.invalidParameterError("options.interpolator", "valid interpolator name", options.interpolator);
        }
      }
    } else {
      throw is_default.invalidParameterError("options", "object", options);
    }
  }
  return this;
}
function sharpen(options) {
  if (is_default.plainObject(options)) {
    if (is_default.number(options.sigma) && is_default.inRange(options.sigma, 0.000001, 10)) {
      this.options.sharpenSigma = options.sigma;
    } else {
      throw is_default.invalidParameterError("options.sigma", "number between 0.000001 and 10", options.sigma);
    }
    if (is_default.defined(options.m1)) {
      if (is_default.number(options.m1) && is_default.inRange(options.m1, 0, 1e6)) {
        this.options.sharpenM1 = options.m1;
      } else {
        throw is_default.invalidParameterError("options.m1", "number between 0 and 1000000", options.m1);
      }
    }
    if (is_default.defined(options.m2)) {
      if (is_default.number(options.m2) && is_default.inRange(options.m2, 0, 1e6)) {
        this.options.sharpenM2 = options.m2;
      } else {
        throw is_default.invalidParameterError("options.m2", "number between 0 and 1000000", options.m2);
      }
    }
    if (is_default.defined(options.x1)) {
      if (is_default.number(options.x1) && is_default.inRange(options.x1, 0, 1e6)) {
        this.options.sharpenX1 = options.x1;
      } else {
        throw is_default.invalidParameterError("options.x1", "number between 0 and 1000000", options.x1);
      }
    }
    if (is_default.defined(options.y2)) {
      if (is_default.number(options.y2) && is_default.inRange(options.y2, 0, 1e6)) {
        this.options.sharpenY2 = options.y2;
      } else {
        throw is_default.invalidParameterError("options.y2", "number between 0 and 1000000", options.y2);
      }
    }
    if (is_default.defined(options.y3)) {
      if (is_default.number(options.y3) && is_default.inRange(options.y3, 0, 1e6)) {
        this.options.sharpenY3 = options.y3;
      } else {
        throw is_default.invalidParameterError("options.y3", "number between 0 and 1000000", options.y3);
      }
    }
  } else {
    this.options.sharpenSigma = -1;
  }
  return this;
}
function median(size) {
  if (!is_default.defined(size)) {
    this.options.medianSize = 3;
  } else if (is_default.integer(size) && is_default.inRange(size, 1, 1000)) {
    this.options.medianSize = size;
  } else {
    throw is_default.invalidParameterError("size", "integer between 1 and 1000", size);
  }
  return this;
}
function blur(options) {
  let sigma;
  if (is_default.number(options)) {
    sigma = options;
  } else if (is_default.plainObject(options)) {
    if (!is_default.number(options.sigma)) {
      throw is_default.invalidParameterError("options.sigma", "number between 0.3 and 1000", sigma);
    }
    sigma = options.sigma;
    if ("precision" in options) {
      if (is_default.string(vipsPrecision[options.precision])) {
        this.options.precision = vipsPrecision[options.precision];
      } else {
        throw is_default.invalidParameterError("precision", "one of: integer, float, approximate", options.precision);
      }
    }
    if ("minAmplitude" in options) {
      if (is_default.number(options.minAmplitude) && is_default.inRange(options.minAmplitude, 0.001, 1)) {
        this.options.minAmpl = options.minAmplitude;
      } else {
        throw is_default.invalidParameterError("minAmplitude", "number between 0.001 and 1", options.minAmplitude);
      }
    }
  }
  if (!is_default.defined(options)) {
    this.options.blurSigma = -1;
  } else if (is_default.bool(options)) {
    this.options.blurSigma = options ? -1 : 0;
  } else if (is_default.number(sigma) && is_default.inRange(sigma, 0.3, 1000)) {
    this.options.blurSigma = sigma;
  } else {
    throw is_default.invalidParameterError("sigma", "number between 0.3 and 1000", sigma);
  }
  return this;
}
function dilate(width) {
  if (!is_default.defined(width)) {
    this.options.dilateWidth = 1;
  } else if (is_default.integer(width) && is_default.inRange(width, 1, 65536)) {
    this.options.dilateWidth = width;
  } else {
    throw is_default.invalidParameterError("width", "integer between 1 and 65536", width);
  }
  return this;
}
function erode(width) {
  if (!is_default.defined(width)) {
    this.options.erodeWidth = 1;
  } else if (is_default.integer(width) && is_default.inRange(width, 1, 65536)) {
    this.options.erodeWidth = width;
  } else {
    throw is_default.invalidParameterError("width", "integer between 1 and 65536", width);
  }
  return this;
}
function flatten(options) {
  this.options.flatten = is_default.bool(options) ? options : true;
  if (is_default.object(options)) {
    this._setBackgroundColourOption("flattenBackground", options.background);
  }
  return this;
}
function unflatten() {
  this.options.unflatten = true;
  return this;
}
function gamma(gamma, gammaOut) {
  if (!is_default.defined(gamma)) {
    this.options.gamma = 2.2;
  } else if (is_default.number(gamma) && is_default.inRange(gamma, 1, 3)) {
    this.options.gamma = gamma;
  } else {
    throw is_default.invalidParameterError("gamma", "number between 1.0 and 3.0", gamma);
  }
  if (!is_default.defined(gammaOut)) {
    this.options.gammaOut = this.options.gamma;
  } else if (is_default.number(gammaOut) && is_default.inRange(gammaOut, 1, 3)) {
    this.options.gammaOut = gammaOut;
  } else {
    throw is_default.invalidParameterError("gammaOut", "number between 1.0 and 3.0", gammaOut);
  }
  return this;
}
function negate(options) {
  this.options.negate = is_default.bool(options) ? options : true;
  if (is_default.plainObject(options) && "alpha" in options) {
    if (!is_default.bool(options.alpha)) {
      throw is_default.invalidParameterError("alpha", "should be boolean value", options.alpha);
    } else {
      this.options.negateAlpha = options.alpha;
    }
  }
  return this;
}
function normalise(options) {
  if (is_default.plainObject(options)) {
    if (is_default.defined(options.lower)) {
      if (is_default.number(options.lower) && is_default.inRange(options.lower, 0, 99)) {
        this.options.normaliseLower = options.lower;
      } else {
        throw is_default.invalidParameterError("lower", "number between 0 and 99", options.lower);
      }
    }
    if (is_default.defined(options.upper)) {
      if (is_default.number(options.upper) && is_default.inRange(options.upper, 1, 100)) {
        this.options.normaliseUpper = options.upper;
      } else {
        throw is_default.invalidParameterError("upper", "number between 1 and 100", options.upper);
      }
    }
  }
  if (this.options.normaliseLower >= this.options.normaliseUpper) {
    throw is_default.invalidParameterError("range", "lower to be less than upper", `${this.options.normaliseLower} >= ${this.options.normaliseUpper}`);
  }
  this.options.normalise = true;
  return this;
}
function normalize(options) {
  return this.normalise(options);
}
function clahe(options) {
  if (is_default.plainObject(options)) {
    if (is_default.integer(options.width) && is_default.inRange(options.width, 1, 65536)) {
      this.options.claheWidth = options.width;
    } else {
      throw is_default.invalidParameterError("width", "integer between 1 and 65536", options.width);
    }
    if (is_default.integer(options.height) && is_default.inRange(options.height, 1, 65536)) {
      this.options.claheHeight = options.height;
    } else {
      throw is_default.invalidParameterError("height", "integer between 1 and 65536", options.height);
    }
    if (is_default.defined(options.maxSlope)) {
      if (is_default.integer(options.maxSlope) && is_default.inRange(options.maxSlope, 0, 100)) {
        this.options.claheMaxSlope = options.maxSlope;
      } else {
        throw is_default.invalidParameterError("maxSlope", "integer between 0 and 100", options.maxSlope);
      }
    }
  } else {
    throw is_default.invalidParameterError("options", "plain object", options);
  }
  return this;
}
function convolve(kernel) {
  if (!is_default.object(kernel) || !Array.isArray(kernel.kernel) || !is_default.integer(kernel.width) || !is_default.integer(kernel.height) || !is_default.inRange(kernel.width, 3, 1001) || !is_default.inRange(kernel.height, 3, 1001) || kernel.height * kernel.width !== kernel.kernel.length || !kernel.kernel.every(is_default.number)) {
    throw new Error("Invalid convolution kernel");
  }
  if (!is_default.integer(kernel.scale)) {
    kernel.scale = kernel.kernel.reduce((a, b) => a + b, 0);
  }
  if (kernel.scale < 1) {
    kernel.scale = 1;
  }
  if (!is_default.integer(kernel.offset)) {
    kernel.offset = 0;
  }
  this.options.convKernel = kernel;
  return this;
}
function threshold(threshold, options) {
  if (!is_default.defined(threshold)) {
    this.options.threshold = 128;
  } else if (is_default.bool(threshold)) {
    this.options.threshold = threshold ? 128 : 0;
  } else if (is_default.integer(threshold) && is_default.inRange(threshold, 0, 255)) {
    this.options.threshold = threshold;
  } else {
    throw is_default.invalidParameterError("threshold", "integer between 0 and 255", threshold);
  }
  if (!is_default.object(options) || options.greyscale === true || options.grayscale === true) {
    this.options.thresholdGrayscale = true;
  } else {
    this.options.thresholdGrayscale = false;
  }
  return this;
}
function boolean(operand, operator, options) {
  this.options.boolean = this._createInputDescriptor(operand, options);
  if (is_default.string(operator) && is_default.inArray(operator, ["and", "or", "eor"])) {
    this.options.booleanOp = operator;
  } else {
    throw is_default.invalidParameterError("operator", "one of: and, or, eor", operator);
  }
  return this;
}
function linear(a, b) {
  if (!is_default.defined(a) && is_default.number(b)) {
    a = 1;
  } else if (is_default.number(a) && !is_default.defined(b)) {
    b = 0;
  }
  if (!is_default.defined(a)) {
    this.options.linearA = [];
  } else if (is_default.number(a)) {
    this.options.linearA = [a];
  } else if (Array.isArray(a) && a.length && a.every(is_default.number)) {
    this.options.linearA = a;
  } else {
    throw is_default.invalidParameterError("a", "number or array of numbers", a);
  }
  if (!is_default.defined(b)) {
    this.options.linearB = [];
  } else if (is_default.number(b)) {
    this.options.linearB = [b];
  } else if (Array.isArray(b) && b.length && b.every(is_default.number)) {
    this.options.linearB = b;
  } else {
    throw is_default.invalidParameterError("b", "number or array of numbers", b);
  }
  if (this.options.linearA.length !== this.options.linearB.length) {
    throw new Error("Expected a and b to be arrays of the same length");
  }
  return this;
}
function recomb(inputMatrix) {
  if (!Array.isArray(inputMatrix)) {
    throw is_default.invalidParameterError("inputMatrix", "array", inputMatrix);
  }
  const dimensions = inputMatrix.length;
  if (dimensions !== 3 && dimensions !== 4) {
    throw is_default.invalidParameterError("inputMatrix", "3x3 or 4x4 array", dimensions);
  }
  if (!inputMatrix.every((row) => Array.isArray(row) && row.length === dimensions)) {
    throw is_default.invalidParameterError("inputMatrix", `array of ${dimensions} arrays of length ${dimensions}`, inputMatrix);
  }
  const recombMatrix = inputMatrix.flat();
  if (!recombMatrix.every(is_default.number)) {
    throw is_default.invalidParameterError("inputMatrix", "array of numbers", recombMatrix);
  }
  this.options.recombMatrix = recombMatrix;
  return this;
}
function modulate(options) {
  if (!is_default.plainObject(options)) {
    throw is_default.invalidParameterError("options", "plain object", options);
  }
  if ("brightness" in options) {
    if (is_default.number(options.brightness) && options.brightness >= 0) {
      this.options.brightness = options.brightness;
    } else {
      throw is_default.invalidParameterError("brightness", "number above zero", options.brightness);
    }
  }
  if ("saturation" in options) {
    if (is_default.number(options.saturation) && options.saturation >= 0) {
      this.options.saturation = options.saturation;
    } else {
      throw is_default.invalidParameterError("saturation", "number above zero", options.saturation);
    }
  }
  if ("hue" in options) {
    if (is_default.integer(options.hue)) {
      this.options.hue = options.hue % 360;
    } else {
      throw is_default.invalidParameterError("hue", "number", options.hue);
    }
  }
  if ("lightness" in options) {
    if (is_default.number(options.lightness)) {
      this.options.lightness = options.lightness;
    } else {
      throw is_default.invalidParameterError("lightness", "number", options.lightness);
    }
  }
  return this;
}
var vipsPrecision, operation_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    autoOrient,
    rotate,
    flip,
    flop,
    affine,
    sharpen,
    erode,
    dilate,
    median,
    blur,
    flatten,
    unflatten,
    gamma,
    negate,
    normalise,
    normalize,
    clahe,
    convolve,
    threshold,
    boolean,
    linear,
    recomb,
    modulate
  });
};
var init_operation = __esm(() => {
  init_is();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  vipsPrecision = {
    integer: "integer",
    float: "float",
    approximate: "approximate"
  };
});

// node_modules/@img/colour/color.cjs
var require_color = __commonJS(function(exports, module) {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });
  module.exports = __toCommonJS(index_exports);
  var colors = {
    aliceblue: [240, 248, 255],
    antiquewhite: [250, 235, 215],
    aqua: [0, 255, 255],
    aquamarine: [127, 255, 212],
    azure: [240, 255, 255],
    beige: [245, 245, 220],
    bisque: [255, 228, 196],
    black: [0, 0, 0],
    blanchedalmond: [255, 235, 205],
    blue: [0, 0, 255],
    blueviolet: [138, 43, 226],
    brown: [165, 42, 42],
    burlywood: [222, 184, 135],
    cadetblue: [95, 158, 160],
    chartreuse: [127, 255, 0],
    chocolate: [210, 105, 30],
    coral: [255, 127, 80],
    cornflowerblue: [100, 149, 237],
    cornsilk: [255, 248, 220],
    crimson: [220, 20, 60],
    cyan: [0, 255, 255],
    darkblue: [0, 0, 139],
    darkcyan: [0, 139, 139],
    darkgoldenrod: [184, 134, 11],
    darkgray: [169, 169, 169],
    darkgreen: [0, 100, 0],
    darkgrey: [169, 169, 169],
    darkkhaki: [189, 183, 107],
    darkmagenta: [139, 0, 139],
    darkolivegreen: [85, 107, 47],
    darkorange: [255, 140, 0],
    darkorchid: [153, 50, 204],
    darkred: [139, 0, 0],
    darksalmon: [233, 150, 122],
    darkseagreen: [143, 188, 143],
    darkslateblue: [72, 61, 139],
    darkslategray: [47, 79, 79],
    darkslategrey: [47, 79, 79],
    darkturquoise: [0, 206, 209],
    darkviolet: [148, 0, 211],
    deeppink: [255, 20, 147],
    deepskyblue: [0, 191, 255],
    dimgray: [105, 105, 105],
    dimgrey: [105, 105, 105],
    dodgerblue: [30, 144, 255],
    firebrick: [178, 34, 34],
    floralwhite: [255, 250, 240],
    forestgreen: [34, 139, 34],
    fuchsia: [255, 0, 255],
    gainsboro: [220, 220, 220],
    ghostwhite: [248, 248, 255],
    gold: [255, 215, 0],
    goldenrod: [218, 165, 32],
    gray: [128, 128, 128],
    green: [0, 128, 0],
    greenyellow: [173, 255, 47],
    grey: [128, 128, 128],
    honeydew: [240, 255, 240],
    hotpink: [255, 105, 180],
    indianred: [205, 92, 92],
    indigo: [75, 0, 130],
    ivory: [255, 255, 240],
    khaki: [240, 230, 140],
    lavender: [230, 230, 250],
    lavenderblush: [255, 240, 245],
    lawngreen: [124, 252, 0],
    lemonchiffon: [255, 250, 205],
    lightblue: [173, 216, 230],
    lightcoral: [240, 128, 128],
    lightcyan: [224, 255, 255],
    lightgoldenrodyellow: [250, 250, 210],
    lightgray: [211, 211, 211],
    lightgreen: [144, 238, 144],
    lightgrey: [211, 211, 211],
    lightpink: [255, 182, 193],
    lightsalmon: [255, 160, 122],
    lightseagreen: [32, 178, 170],
    lightskyblue: [135, 206, 250],
    lightslategray: [119, 136, 153],
    lightslategrey: [119, 136, 153],
    lightsteelblue: [176, 196, 222],
    lightyellow: [255, 255, 224],
    lime: [0, 255, 0],
    limegreen: [50, 205, 50],
    linen: [250, 240, 230],
    magenta: [255, 0, 255],
    maroon: [128, 0, 0],
    mediumaquamarine: [102, 205, 170],
    mediumblue: [0, 0, 205],
    mediumorchid: [186, 85, 211],
    mediumpurple: [147, 112, 219],
    mediumseagreen: [60, 179, 113],
    mediumslateblue: [123, 104, 238],
    mediumspringgreen: [0, 250, 154],
    mediumturquoise: [72, 209, 204],
    mediumvioletred: [199, 21, 133],
    midnightblue: [25, 25, 112],
    mintcream: [245, 255, 250],
    mistyrose: [255, 228, 225],
    moccasin: [255, 228, 181],
    navajowhite: [255, 222, 173],
    navy: [0, 0, 128],
    oldlace: [253, 245, 230],
    olive: [128, 128, 0],
    olivedrab: [107, 142, 35],
    orange: [255, 165, 0],
    orangered: [255, 69, 0],
    orchid: [218, 112, 214],
    palegoldenrod: [238, 232, 170],
    palegreen: [152, 251, 152],
    paleturquoise: [175, 238, 238],
    palevioletred: [219, 112, 147],
    papayawhip: [255, 239, 213],
    peachpuff: [255, 218, 185],
    peru: [205, 133, 63],
    pink: [255, 192, 203],
    plum: [221, 160, 221],
    powderblue: [176, 224, 230],
    purple: [128, 0, 128],
    rebeccapurple: [102, 51, 153],
    red: [255, 0, 0],
    rosybrown: [188, 143, 143],
    royalblue: [65, 105, 225],
    saddlebrown: [139, 69, 19],
    salmon: [250, 128, 114],
    sandybrown: [244, 164, 96],
    seagreen: [46, 139, 87],
    seashell: [255, 245, 238],
    sienna: [160, 82, 45],
    silver: [192, 192, 192],
    skyblue: [135, 206, 235],
    slateblue: [106, 90, 205],
    slategray: [112, 128, 144],
    slategrey: [112, 128, 144],
    snow: [255, 250, 250],
    springgreen: [0, 255, 127],
    steelblue: [70, 130, 180],
    tan: [210, 180, 140],
    teal: [0, 128, 128],
    thistle: [216, 191, 216],
    tomato: [255, 99, 71],
    turquoise: [64, 224, 208],
    violet: [238, 130, 238],
    wheat: [245, 222, 179],
    white: [255, 255, 255],
    whitesmoke: [245, 245, 245],
    yellow: [255, 255, 0],
    yellowgreen: [154, 205, 50]
  };
  for (const key in colors)
    Object.freeze(colors[key]);
  var color_name_default = Object.freeze(colors);
  var reverseNames = /* @__PURE__ */ Object.create(null);
  for (const name in color_name_default) {
    if (Object.hasOwn(color_name_default, name)) {
      reverseNames[color_name_default[name]] = name;
    }
  }
  var cs = {
    to: {},
    get: {}
  };
  cs.get = function(string) {
    const prefix = string.slice(0, 3).toLowerCase();
    let value;
    let model;
    switch (prefix) {
      case "hsl": {
        value = cs.get.hsl(string);
        model = "hsl";
        break;
      }
      case "hwb": {
        value = cs.get.hwb(string);
        model = "hwb";
        break;
      }
      default: {
        value = cs.get.rgb(string);
        model = "rgb";
        break;
      }
    }
    if (!value) {
      return null;
    }
    return { model, value };
  };
  cs.get.rgb = function(string) {
    if (!string) {
      return null;
    }
    const abbr = /^#([a-f\d]{3,4})$/i;
    const hex = /^#([a-f\d]{6})([a-f\d]{2})?$/i;
    const rgba = /^rgba?\(\s*([+-]?(?:\d*\.)?\d+(?:e\d+)?)(?=[\s,])\s*(?:,\s*)?([+-]?(?:\d*\.)?\d+(?:e\d+)?)(?=[\s,])\s*(?:,\s*)?([+-]?(?:\d*\.)?\d+(?:e\d+)?)\s*(?:[\s,|/]\s*([+-]?(?:\d*\.)?\d+(?:e\d+)?)(%?)\s*)?\)$/i;
    const per = /^rgba?\(\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[\s,|/]\s*([+-]?[\d.]+)(%?)\s*)?\)$/i;
    const keyword = /^(\w+)$/;
    let rgb = [0, 0, 0, 1];
    let match;
    let i;
    let hexAlpha;
    if (match = string.match(hex)) {
      hexAlpha = match[2];
      match = match[1];
      for (i = 0;i < 3; i++) {
        const i2 = i * 2;
        rgb[i] = Number.parseInt(match.slice(i2, i2 + 2), 16);
      }
      if (hexAlpha) {
        rgb[3] = Number.parseInt(hexAlpha, 16) / 255;
      }
    } else if (match = string.match(abbr)) {
      match = match[1];
      hexAlpha = match[3];
      for (i = 0;i < 3; i++) {
        rgb[i] = Number.parseInt(match[i] + match[i], 16);
      }
      if (hexAlpha) {
        rgb[3] = Number.parseInt(hexAlpha + hexAlpha, 16) / 255;
      }
    } else if (match = string.match(rgba)) {
      for (i = 0;i < 3; i++) {
        rgb[i] = Number.parseFloat(match[i + 1]);
      }
      if (match[4]) {
        rgb[3] = match[5] ? Number.parseFloat(match[4]) * 0.01 : Number.parseFloat(match[4]);
      }
    } else if (match = string.match(per)) {
      for (i = 0;i < 3; i++) {
        rgb[i] = Math.round(Number.parseFloat(match[i + 1]) * 2.55);
      }
      if (match[4]) {
        rgb[3] = match[5] ? Number.parseFloat(match[4]) * 0.01 : Number.parseFloat(match[4]);
      }
    } else if (match = string.toLowerCase().match(keyword)) {
      if (match[1] === "transparent") {
        return [0, 0, 0, 0];
      }
      if (!Object.hasOwn(color_name_default, match[1])) {
        return null;
      }
      rgb = color_name_default[match[1]].slice();
      rgb[3] = 1;
      return rgb;
    } else {
      return null;
    }
    for (i = 0;i < 3; i++) {
      rgb[i] = clamp(rgb[i], 0, 255);
    }
    rgb[3] = clamp(rgb[3], 0, 1);
    return rgb;
  };
  cs.get.hsl = function(string) {
    if (!string) {
      return null;
    }
    const hsl = /^hsla?\(\s*([+-]?(?:\d{0,3}\.)?\d+)(?:deg)?\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[,|/]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:e[+-]?\d+)?)\s*)?\)$/i;
    const match = string.match(hsl);
    if (match) {
      const alpha = Number.parseFloat(match[4]);
      const h = (Number.parseFloat(match[1]) % 360 + 360) % 360;
      const s = clamp(Number.parseFloat(match[2]), 0, 100);
      const l = clamp(Number.parseFloat(match[3]), 0, 100);
      const a = clamp(Number.isNaN(alpha) ? 1 : alpha, 0, 1);
      return [h, s, l, a];
    }
    return null;
  };
  cs.get.hwb = function(string) {
    if (!string) {
      return null;
    }
    const hwb = /^hwb\(\s*([+-]?\d{0,3}(?:\.\d+)?)(?:deg)?\s*[\s,]\s*([+-]?[\d.]+)%\s*[\s,]\s*([+-]?[\d.]+)%\s*(?:[\s,]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:e[+-]?\d+)?)\s*)?\)$/i;
    const match = string.match(hwb);
    if (match) {
      const alpha = Number.parseFloat(match[4]);
      const h = (Number.parseFloat(match[1]) % 360 + 360) % 360;
      const w = clamp(Number.parseFloat(match[2]), 0, 100);
      const b = clamp(Number.parseFloat(match[3]), 0, 100);
      const a = clamp(Number.isNaN(alpha) ? 1 : alpha, 0, 1);
      return [h, w, b, a];
    }
    return null;
  };
  cs.to.hex = function(...rgba) {
    return "#" + hexDouble(rgba[0]) + hexDouble(rgba[1]) + hexDouble(rgba[2]) + (rgba[3] < 1 ? hexDouble(Math.round(rgba[3] * 255)) : "");
  };
  cs.to.rgb = function(...rgba) {
    return rgba.length < 4 || rgba[3] === 1 ? "rgb(" + Math.round(rgba[0]) + ", " + Math.round(rgba[1]) + ", " + Math.round(rgba[2]) + ")" : "rgba(" + Math.round(rgba[0]) + ", " + Math.round(rgba[1]) + ", " + Math.round(rgba[2]) + ", " + rgba[3] + ")";
  };
  cs.to.rgb.percent = function(...rgba) {
    const r = Math.round(rgba[0] / 255 * 100);
    const g = Math.round(rgba[1] / 255 * 100);
    const b = Math.round(rgba[2] / 255 * 100);
    return rgba.length < 4 || rgba[3] === 1 ? "rgb(" + r + "%, " + g + "%, " + b + "%)" : "rgba(" + r + "%, " + g + "%, " + b + "%, " + rgba[3] + ")";
  };
  cs.to.hsl = function(...hsla) {
    return hsla.length < 4 || hsla[3] === 1 ? "hsl(" + hsla[0] + ", " + hsla[1] + "%, " + hsla[2] + "%)" : "hsla(" + hsla[0] + ", " + hsla[1] + "%, " + hsla[2] + "%, " + hsla[3] + ")";
  };
  cs.to.hwb = function(...hwba) {
    let a = "";
    if (hwba.length >= 4 && hwba[3] !== 1) {
      a = ", " + hwba[3];
    }
    return "hwb(" + hwba[0] + ", " + hwba[1] + "%, " + hwba[2] + "%" + a + ")";
  };
  cs.to.keyword = function(...rgb) {
    return reverseNames[rgb.slice(0, 3)];
  };
  function clamp(number_, min, max) {
    return Math.min(Math.max(min, number_), max);
  }
  function hexDouble(number_) {
    const string_ = Math.round(number_).toString(16).toUpperCase();
    return string_.length < 2 ? "0" + string_ : string_;
  }
  var color_string_default = cs;
  var reverseKeywords = {};
  for (const key of Object.keys(color_name_default)) {
    reverseKeywords[color_name_default[key]] = key;
  }
  var convert = {
    rgb: { channels: 3, labels: "rgb" },
    hsl: { channels: 3, labels: "hsl" },
    hsv: { channels: 3, labels: "hsv" },
    hwb: { channels: 3, labels: "hwb" },
    cmyk: { channels: 4, labels: "cmyk" },
    xyz: { channels: 3, labels: "xyz" },
    lab: { channels: 3, labels: "lab" },
    oklab: { channels: 3, labels: ["okl", "oka", "okb"] },
    lch: { channels: 3, labels: "lch" },
    oklch: { channels: 3, labels: ["okl", "okc", "okh"] },
    hex: { channels: 1, labels: ["hex"] },
    keyword: { channels: 1, labels: ["keyword"] },
    ansi16: { channels: 1, labels: ["ansi16"] },
    ansi256: { channels: 1, labels: ["ansi256"] },
    hcg: { channels: 3, labels: ["h", "c", "g"] },
    apple: { channels: 3, labels: ["r16", "g16", "b16"] },
    gray: { channels: 1, labels: ["gray"] }
  };
  var conversions_default = convert;
  var LAB_FT = (6 / 29) ** 3;
  function srgbNonlinearTransform(c) {
    const cc = c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : c * 12.92;
    return Math.min(Math.max(0, cc), 1);
  }
  function srgbNonlinearTransformInv(c) {
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  }
  for (const model of Object.keys(convert)) {
    if (!("channels" in convert[model])) {
      throw new Error("missing channels property: " + model);
    }
    if (!("labels" in convert[model])) {
      throw new Error("missing channel labels property: " + model);
    }
    if (convert[model].labels.length !== convert[model].channels) {
      throw new Error("channel and label counts mismatch: " + model);
    }
    const { channels, labels } = convert[model];
    delete convert[model].channels;
    delete convert[model].labels;
    Object.defineProperty(convert[model], "channels", { value: channels });
    Object.defineProperty(convert[model], "labels", { value: labels });
  }
  convert.rgb.hsl = function(rgb) {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const delta = max - min;
    let h;
    let s;
    switch (max) {
      case min: {
        h = 0;
        break;
      }
      case r: {
        h = (g - b) / delta;
        break;
      }
      case g: {
        h = 2 + (b - r) / delta;
        break;
      }
      case b: {
        h = 4 + (r - g) / delta;
        break;
      }
    }
    h = Math.min(h * 60, 360);
    if (h < 0) {
      h += 360;
    }
    const l = (min + max) / 2;
    if (max === min) {
      s = 0;
    } else if (l <= 0.5) {
      s = delta / (max + min);
    } else {
      s = delta / (2 - max - min);
    }
    return [h, s * 100, l * 100];
  };
  convert.rgb.hsv = function(rgb) {
    let rdif;
    let gdif;
    let bdif;
    let h;
    let s;
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const v = Math.max(r, g, b);
    const diff = v - Math.min(r, g, b);
    const diffc = function(c) {
      return (v - c) / 6 / diff + 1 / 2;
    };
    if (diff === 0) {
      h = 0;
      s = 0;
    } else {
      s = diff / v;
      rdif = diffc(r);
      gdif = diffc(g);
      bdif = diffc(b);
      switch (v) {
        case r: {
          h = bdif - gdif;
          break;
        }
        case g: {
          h = 1 / 3 + rdif - bdif;
          break;
        }
        case b: {
          h = 2 / 3 + gdif - rdif;
          break;
        }
      }
      if (h < 0) {
        h += 1;
      } else if (h > 1) {
        h -= 1;
      }
    }
    return [
      h * 360,
      s * 100,
      v * 100
    ];
  };
  convert.rgb.hwb = function(rgb) {
    const r = rgb[0];
    const g = rgb[1];
    let b = rgb[2];
    const h = convert.rgb.hsl(rgb)[0];
    const w = 1 / 255 * Math.min(r, Math.min(g, b));
    b = 1 - 1 / 255 * Math.max(r, Math.max(g, b));
    return [h, w * 100, b * 100];
  };
  convert.rgb.oklab = function(rgb) {
    const r = srgbNonlinearTransformInv(rgb[0] / 255);
    const g = srgbNonlinearTransformInv(rgb[1] / 255);
    const b = srgbNonlinearTransformInv(rgb[2] / 255);
    const lp = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mp = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const sp = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const l = 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp;
    const aa = 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp;
    const bb = 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp;
    return [l * 100, aa * 100, bb * 100];
  };
  convert.rgb.cmyk = function(rgb) {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const k = Math.min(1 - r, 1 - g, 1 - b);
    const c = (1 - r - k) / (1 - k) || 0;
    const m = (1 - g - k) / (1 - k) || 0;
    const y = (1 - b - k) / (1 - k) || 0;
    return [c * 100, m * 100, y * 100, k * 100];
  };
  function comparativeDistance(x, y) {
    return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
  }
  convert.rgb.keyword = function(rgb) {
    const reversed = reverseKeywords[rgb];
    if (reversed) {
      return reversed;
    }
    let currentClosestDistance = Number.POSITIVE_INFINITY;
    let currentClosestKeyword;
    for (const keyword of Object.keys(color_name_default)) {
      const value = color_name_default[keyword];
      const distance = comparativeDistance(rgb, value);
      if (distance < currentClosestDistance) {
        currentClosestDistance = distance;
        currentClosestKeyword = keyword;
      }
    }
    return currentClosestKeyword;
  };
  convert.keyword.rgb = function(keyword) {
    return [...color_name_default[keyword]];
  };
  convert.rgb.xyz = function(rgb) {
    const r = srgbNonlinearTransformInv(rgb[0] / 255);
    const g = srgbNonlinearTransformInv(rgb[1] / 255);
    const b = srgbNonlinearTransformInv(rgb[2] / 255);
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
    return [x * 100, y * 100, z * 100];
  };
  convert.rgb.lab = function(rgb) {
    const xyz = convert.rgb.xyz(rgb);
    let x = xyz[0];
    let y = xyz[1];
    let z = xyz[2];
    x /= 95.047;
    y /= 100;
    z /= 108.883;
    x = x > LAB_FT ? x ** (1 / 3) : 7.787 * x + 16 / 116;
    y = y > LAB_FT ? y ** (1 / 3) : 7.787 * y + 16 / 116;
    z = z > LAB_FT ? z ** (1 / 3) : 7.787 * z + 16 / 116;
    const l = 116 * y - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);
    return [l, a, b];
  };
  convert.hsl.rgb = function(hsl) {
    const h = hsl[0] / 360;
    const s = hsl[1] / 100;
    const l = hsl[2] / 100;
    let t3;
    let value;
    if (s === 0) {
      value = l * 255;
      return [value, value, value];
    }
    const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const t1 = 2 * l - t2;
    const rgb = [0, 0, 0];
    for (let i = 0;i < 3; i++) {
      t3 = h + 1 / 3 * -(i - 1);
      if (t3 < 0) {
        t3++;
      }
      if (t3 > 1) {
        t3--;
      }
      if (6 * t3 < 1) {
        value = t1 + (t2 - t1) * 6 * t3;
      } else if (2 * t3 < 1) {
        value = t2;
      } else if (3 * t3 < 2) {
        value = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
      } else {
        value = t1;
      }
      rgb[i] = value * 255;
    }
    return rgb;
  };
  convert.hsl.hsv = function(hsl) {
    const h = hsl[0];
    let s = hsl[1] / 100;
    let l = hsl[2] / 100;
    let smin = s;
    const lmin = Math.max(l, 0.01);
    l *= 2;
    s *= l <= 1 ? l : 2 - l;
    smin *= lmin <= 1 ? lmin : 2 - lmin;
    const v = (l + s) / 2;
    const sv = l === 0 ? 2 * smin / (lmin + smin) : 2 * s / (l + s);
    return [h, sv * 100, v * 100];
  };
  convert.hsv.rgb = function(hsv) {
    const h = hsv[0] / 60;
    const s = hsv[1] / 100;
    let v = hsv[2] / 100;
    const hi = Math.floor(h) % 6;
    const f = h - Math.floor(h);
    const p = 255 * v * (1 - s);
    const q = 255 * v * (1 - s * f);
    const t = 255 * v * (1 - s * (1 - f));
    v *= 255;
    switch (hi) {
      case 0: {
        return [v, t, p];
      }
      case 1: {
        return [q, v, p];
      }
      case 2: {
        return [p, v, t];
      }
      case 3: {
        return [p, q, v];
      }
      case 4: {
        return [t, p, v];
      }
      case 5: {
        return [v, p, q];
      }
    }
  };
  convert.hsv.hsl = function(hsv) {
    const h = hsv[0];
    const s = hsv[1] / 100;
    const v = hsv[2] / 100;
    const vmin = Math.max(v, 0.01);
    let sl;
    let l;
    l = (2 - s) * v;
    const lmin = (2 - s) * vmin;
    sl = s * vmin;
    sl /= lmin <= 1 ? lmin : 2 - lmin;
    sl = sl || 0;
    l /= 2;
    return [h, sl * 100, l * 100];
  };
  convert.hwb.rgb = function(hwb) {
    const h = hwb[0] / 360;
    let wh = hwb[1] / 100;
    let bl = hwb[2] / 100;
    const ratio = wh + bl;
    let f;
    if (ratio > 1) {
      wh /= ratio;
      bl /= ratio;
    }
    const i = Math.floor(6 * h);
    const v = 1 - bl;
    f = 6 * h - i;
    if ((i & 1) !== 0) {
      f = 1 - f;
    }
    const n = wh + f * (v - wh);
    let r;
    let g;
    let b;
    switch (i) {
      default:
      case 6:
      case 0: {
        r = v;
        g = n;
        b = wh;
        break;
      }
      case 1: {
        r = n;
        g = v;
        b = wh;
        break;
      }
      case 2: {
        r = wh;
        g = v;
        b = n;
        break;
      }
      case 3: {
        r = wh;
        g = n;
        b = v;
        break;
      }
      case 4: {
        r = n;
        g = wh;
        b = v;
        break;
      }
      case 5: {
        r = v;
        g = wh;
        b = n;
        break;
      }
    }
    return [r * 255, g * 255, b * 255];
  };
  convert.cmyk.rgb = function(cmyk) {
    const c = cmyk[0] / 100;
    const m = cmyk[1] / 100;
    const y = cmyk[2] / 100;
    const k = cmyk[3] / 100;
    const r = 1 - Math.min(1, c * (1 - k) + k);
    const g = 1 - Math.min(1, m * (1 - k) + k);
    const b = 1 - Math.min(1, y * (1 - k) + k);
    return [r * 255, g * 255, b * 255];
  };
  convert.xyz.rgb = function(xyz) {
    const x = xyz[0] / 100;
    const y = xyz[1] / 100;
    const z = xyz[2] / 100;
    let r;
    let g;
    let b;
    r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
    b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
    r = srgbNonlinearTransform(r);
    g = srgbNonlinearTransform(g);
    b = srgbNonlinearTransform(b);
    return [r * 255, g * 255, b * 255];
  };
  convert.xyz.lab = function(xyz) {
    let x = xyz[0];
    let y = xyz[1];
    let z = xyz[2];
    x /= 95.047;
    y /= 100;
    z /= 108.883;
    x = x > LAB_FT ? x ** (1 / 3) : 7.787 * x + 16 / 116;
    y = y > LAB_FT ? y ** (1 / 3) : 7.787 * y + 16 / 116;
    z = z > LAB_FT ? z ** (1 / 3) : 7.787 * z + 16 / 116;
    const l = 116 * y - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);
    return [l, a, b];
  };
  convert.xyz.oklab = function(xyz) {
    const x = xyz[0] / 100;
    const y = xyz[1] / 100;
    const z = xyz[2] / 100;
    const lp = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
    const mp = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
    const sp = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);
    const l = 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp;
    const a = 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp;
    const b = 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp;
    return [l * 100, a * 100, b * 100];
  };
  convert.oklab.oklch = function(oklab) {
    return convert.lab.lch(oklab);
  };
  convert.oklab.xyz = function(oklab) {
    const ll = oklab[0] / 100;
    const a = oklab[1] / 100;
    const b = oklab[2] / 100;
    const l = (0.999999998 * ll + 0.396337792 * a + 0.215803758 * b) ** 3;
    const m = (1.000000008 * ll - 0.105561342 * a - 0.063854175 * b) ** 3;
    const s = (1.000000055 * ll - 0.089484182 * a - 1.291485538 * b) ** 3;
    const x = 1.227013851 * l - 0.55779998 * m + 0.281256149 * s;
    const y = -0.040580178 * l + 1.11225687 * m - 0.071676679 * s;
    const z = -0.076381285 * l - 0.421481978 * m + 1.58616322 * s;
    return [x * 100, y * 100, z * 100];
  };
  convert.oklab.rgb = function(oklab) {
    const ll = oklab[0] / 100;
    const aa = oklab[1] / 100;
    const bb = oklab[2] / 100;
    const l = (ll + 0.3963377774 * aa + 0.2158037573 * bb) ** 3;
    const m = (ll - 0.1055613458 * aa - 0.0638541728 * bb) ** 3;
    const s = (ll - 0.0894841775 * aa - 1.291485548 * bb) ** 3;
    const r = srgbNonlinearTransform(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    const g = srgbNonlinearTransform(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    const b = srgbNonlinearTransform(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    return [r * 255, g * 255, b * 255];
  };
  convert.oklch.oklab = function(oklch) {
    return convert.lch.lab(oklch);
  };
  convert.lab.xyz = function(lab) {
    const l = lab[0];
    const a = lab[1];
    const b = lab[2];
    let x;
    let y;
    let z;
    y = (l + 16) / 116;
    x = a / 500 + y;
    z = y - b / 200;
    const y2 = y ** 3;
    const x2 = x ** 3;
    const z2 = z ** 3;
    y = y2 > LAB_FT ? y2 : (y - 16 / 116) / 7.787;
    x = x2 > LAB_FT ? x2 : (x - 16 / 116) / 7.787;
    z = z2 > LAB_FT ? z2 : (z - 16 / 116) / 7.787;
    x *= 95.047;
    y *= 100;
    z *= 108.883;
    return [x, y, z];
  };
  convert.lab.lch = function(lab) {
    const l = lab[0];
    const a = lab[1];
    const b = lab[2];
    let h;
    const hr = Math.atan2(b, a);
    h = hr * 360 / 2 / Math.PI;
    if (h < 0) {
      h += 360;
    }
    const c = Math.sqrt(a * a + b * b);
    return [l, c, h];
  };
  convert.lch.lab = function(lch) {
    const l = lch[0];
    const c = lch[1];
    const h = lch[2];
    const hr = h / 360 * 2 * Math.PI;
    const a = c * Math.cos(hr);
    const b = c * Math.sin(hr);
    return [l, a, b];
  };
  convert.rgb.ansi16 = function(args, saturation = null) {
    const [r, g, b] = args;
    let value = saturation === null ? convert.rgb.hsv(args)[2] : saturation;
    value = Math.round(value / 50);
    if (value === 0) {
      return 30;
    }
    let ansi = 30 + (Math.round(b / 255) << 2 | Math.round(g / 255) << 1 | Math.round(r / 255));
    if (value === 2) {
      ansi += 60;
    }
    return ansi;
  };
  convert.hsv.ansi16 = function(args) {
    return convert.rgb.ansi16(convert.hsv.rgb(args), args[2]);
  };
  convert.rgb.ansi256 = function(args) {
    const r = args[0];
    const g = args[1];
    const b = args[2];
    if (r >> 4 === g >> 4 && g >> 4 === b >> 4) {
      if (r < 8) {
        return 16;
      }
      if (r > 248) {
        return 231;
      }
      return Math.round((r - 8) / 247 * 24) + 232;
    }
    const ansi = 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
    return ansi;
  };
  convert.ansi16.rgb = function(args) {
    args = args[0];
    let color = args % 10;
    if (color === 0 || color === 7) {
      if (args > 50) {
        color += 3.5;
      }
      color = color / 10.5 * 255;
      return [color, color, color];
    }
    const mult = (Math.trunc(args > 50) + 1) * 0.5;
    const r = (color & 1) * mult * 255;
    const g = (color >> 1 & 1) * mult * 255;
    const b = (color >> 2 & 1) * mult * 255;
    return [r, g, b];
  };
  convert.ansi256.rgb = function(args) {
    args = args[0];
    if (args >= 232) {
      const c = (args - 232) * 10 + 8;
      return [c, c, c];
    }
    args -= 16;
    let rem;
    const r = Math.floor(args / 36) / 5 * 255;
    const g = Math.floor((rem = args % 36) / 6) / 5 * 255;
    const b = rem % 6 / 5 * 255;
    return [r, g, b];
  };
  convert.rgb.hex = function(args) {
    const integer = ((Math.round(args[0]) & 255) << 16) + ((Math.round(args[1]) & 255) << 8) + (Math.round(args[2]) & 255);
    const string = integer.toString(16).toUpperCase();
    return "000000".slice(string.length) + string;
  };
  convert.hex.rgb = function(args) {
    const match = args.toString(16).match(/[a-f\d]{6}|[a-f\d]{3}/i);
    if (!match) {
      return [0, 0, 0];
    }
    let colorString = match[0];
    if (match[0].length === 3) {
      colorString = [...colorString].map((char) => char + char).join("");
    }
    const integer = Number.parseInt(colorString, 16);
    const r = integer >> 16 & 255;
    const g = integer >> 8 & 255;
    const b = integer & 255;
    return [r, g, b];
  };
  convert.rgb.hcg = function(rgb) {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const max = Math.max(Math.max(r, g), b);
    const min = Math.min(Math.min(r, g), b);
    const chroma = max - min;
    let hue;
    const grayscale = chroma < 1 ? min / (1 - chroma) : 0;
    if (chroma <= 0) {
      hue = 0;
    } else if (max === r) {
      hue = (g - b) / chroma % 6;
    } else if (max === g) {
      hue = 2 + (b - r) / chroma;
    } else {
      hue = 4 + (r - g) / chroma;
    }
    hue /= 6;
    hue %= 1;
    return [hue * 360, chroma * 100, grayscale * 100];
  };
  convert.hsl.hcg = function(hsl) {
    const s = hsl[1] / 100;
    const l = hsl[2] / 100;
    const c = l < 0.5 ? 2 * s * l : 2 * s * (1 - l);
    let f = 0;
    if (c < 1) {
      f = (l - 0.5 * c) / (1 - c);
    }
    return [hsl[0], c * 100, f * 100];
  };
  convert.hsv.hcg = function(hsv) {
    const s = hsv[1] / 100;
    const v = hsv[2] / 100;
    const c = s * v;
    let f = 0;
    if (c < 1) {
      f = (v - c) / (1 - c);
    }
    return [hsv[0], c * 100, f * 100];
  };
  convert.hcg.rgb = function(hcg) {
    const h = hcg[0] / 360;
    const c = hcg[1] / 100;
    const g = hcg[2] / 100;
    if (c === 0) {
      return [g * 255, g * 255, g * 255];
    }
    const pure = [0, 0, 0];
    const hi = h % 1 * 6;
    const v = hi % 1;
    const w = 1 - v;
    let mg = 0;
    switch (Math.floor(hi)) {
      case 0: {
        pure[0] = 1;
        pure[1] = v;
        pure[2] = 0;
        break;
      }
      case 1: {
        pure[0] = w;
        pure[1] = 1;
        pure[2] = 0;
        break;
      }
      case 2: {
        pure[0] = 0;
        pure[1] = 1;
        pure[2] = v;
        break;
      }
      case 3: {
        pure[0] = 0;
        pure[1] = w;
        pure[2] = 1;
        break;
      }
      case 4: {
        pure[0] = v;
        pure[1] = 0;
        pure[2] = 1;
        break;
      }
      default: {
        pure[0] = 1;
        pure[1] = 0;
        pure[2] = w;
      }
    }
    mg = (1 - c) * g;
    return [
      (c * pure[0] + mg) * 255,
      (c * pure[1] + mg) * 255,
      (c * pure[2] + mg) * 255
    ];
  };
  convert.hcg.hsv = function(hcg) {
    const c = hcg[1] / 100;
    const g = hcg[2] / 100;
    const v = c + g * (1 - c);
    let f = 0;
    if (v > 0) {
      f = c / v;
    }
    return [hcg[0], f * 100, v * 100];
  };
  convert.hcg.hsl = function(hcg) {
    const c = hcg[1] / 100;
    const g = hcg[2] / 100;
    const l = g * (1 - c) + 0.5 * c;
    let s = 0;
    if (l > 0 && l < 0.5) {
      s = c / (2 * l);
    } else if (l >= 0.5 && l < 1) {
      s = c / (2 * (1 - l));
    }
    return [hcg[0], s * 100, l * 100];
  };
  convert.hcg.hwb = function(hcg) {
    const c = hcg[1] / 100;
    const g = hcg[2] / 100;
    const v = c + g * (1 - c);
    return [hcg[0], (v - c) * 100, (1 - v) * 100];
  };
  convert.hwb.hcg = function(hwb) {
    const w = hwb[1] / 100;
    const b = hwb[2] / 100;
    const v = 1 - b;
    const c = v - w;
    let g = 0;
    if (c < 1) {
      g = (v - c) / (1 - c);
    }
    return [hwb[0], c * 100, g * 100];
  };
  convert.apple.rgb = function(apple) {
    return [apple[0] / 65535 * 255, apple[1] / 65535 * 255, apple[2] / 65535 * 255];
  };
  convert.rgb.apple = function(rgb) {
    return [rgb[0] / 255 * 65535, rgb[1] / 255 * 65535, rgb[2] / 255 * 65535];
  };
  convert.gray.rgb = function(args) {
    return [args[0] / 100 * 255, args[0] / 100 * 255, args[0] / 100 * 255];
  };
  convert.gray.hsl = function(args) {
    return [0, 0, args[0]];
  };
  convert.gray.hsv = convert.gray.hsl;
  convert.gray.hwb = function(gray) {
    return [0, 100, gray[0]];
  };
  convert.gray.cmyk = function(gray) {
    return [0, 0, 0, gray[0]];
  };
  convert.gray.lab = function(gray) {
    return [gray[0], 0, 0];
  };
  convert.gray.hex = function(gray) {
    const value = Math.round(gray[0] / 100 * 255) & 255;
    const integer = (value << 16) + (value << 8) + value;
    const string = integer.toString(16).toUpperCase();
    return "000000".slice(string.length) + string;
  };
  convert.rgb.gray = function(rgb) {
    const value = (rgb[0] + rgb[1] + rgb[2]) / 3;
    return [value / 255 * 100];
  };
  function buildGraph() {
    const graph = {};
    const models2 = Object.keys(conversions_default);
    for (let { length } = models2, i = 0;i < length; i++) {
      graph[models2[i]] = {
        distance: -1,
        parent: null
      };
    }
    return graph;
  }
  function deriveBFS(fromModel) {
    const graph = buildGraph();
    const queue = [fromModel];
    graph[fromModel].distance = 0;
    while (queue.length > 0) {
      const current = queue.pop();
      const adjacents = Object.keys(conversions_default[current]);
      for (let { length } = adjacents, i = 0;i < length; i++) {
        const adjacent = adjacents[i];
        const node = graph[adjacent];
        if (node.distance === -1) {
          node.distance = graph[current].distance + 1;
          node.parent = current;
          queue.unshift(adjacent);
        }
      }
    }
    return graph;
  }
  function link(from, to) {
    return function(args) {
      return to(from(args));
    };
  }
  function wrapConversion(toModel, graph) {
    const path = [graph[toModel].parent, toModel];
    let fn = conversions_default[graph[toModel].parent][toModel];
    let cur = graph[toModel].parent;
    while (graph[cur].parent) {
      path.unshift(graph[cur].parent);
      fn = link(conversions_default[graph[cur].parent][cur], fn);
      cur = graph[cur].parent;
    }
    fn.conversion = path;
    return fn;
  }
  function route(fromModel) {
    const graph = deriveBFS(fromModel);
    const conversion = {};
    const models2 = Object.keys(graph);
    for (let { length } = models2, i = 0;i < length; i++) {
      const toModel = models2[i];
      const node = graph[toModel];
      if (node.parent === null) {
        continue;
      }
      conversion[toModel] = wrapConversion(toModel, graph);
    }
    return conversion;
  }
  var route_default = route;
  var convert2 = {};
  var models = Object.keys(conversions_default);
  function wrapRaw(fn) {
    const wrappedFn = function(...args) {
      const arg0 = args[0];
      if (arg0 === undefined || arg0 === null) {
        return arg0;
      }
      if (arg0.length > 1) {
        args = arg0;
      }
      return fn(args);
    };
    if ("conversion" in fn) {
      wrappedFn.conversion = fn.conversion;
    }
    return wrappedFn;
  }
  function wrapRounded(fn) {
    const wrappedFn = function(...args) {
      const arg0 = args[0];
      if (arg0 === undefined || arg0 === null) {
        return arg0;
      }
      if (arg0.length > 1) {
        args = arg0;
      }
      const result = fn(args);
      if (typeof result === "object") {
        for (let { length } = result, i = 0;i < length; i++) {
          result[i] = Math.round(result[i]);
        }
      }
      return result;
    };
    if ("conversion" in fn) {
      wrappedFn.conversion = fn.conversion;
    }
    return wrappedFn;
  }
  for (const fromModel of models) {
    convert2[fromModel] = {};
    Object.defineProperty(convert2[fromModel], "channels", { value: conversions_default[fromModel].channels });
    Object.defineProperty(convert2[fromModel], "labels", { value: conversions_default[fromModel].labels });
    const routes = route_default(fromModel);
    const routeModels = Object.keys(routes);
    for (const toModel of routeModels) {
      const fn = routes[toModel];
      convert2[fromModel][toModel] = wrapRounded(fn);
      convert2[fromModel][toModel].raw = wrapRaw(fn);
    }
  }
  var color_convert_default = convert2;
  var skippedModels = [
    "keyword",
    "gray",
    "hex"
  ];
  var hashedModelKeys = {};
  for (const model of Object.keys(color_convert_default)) {
    hashedModelKeys[[...color_convert_default[model].labels].sort().join("")] = model;
  }
  var limiters = {};
  function Color(object, model) {
    if (!(this instanceof Color)) {
      return new Color(object, model);
    }
    if (model && model in skippedModels) {
      model = null;
    }
    if (model && !(model in color_convert_default)) {
      throw new Error("Unknown model: " + model);
    }
    let i;
    let channels;
    if (object == null) {
      this.model = "rgb";
      this.color = [0, 0, 0];
      this.valpha = 1;
    } else if (object instanceof Color) {
      this.model = object.model;
      this.color = [...object.color];
      this.valpha = object.valpha;
    } else if (typeof object === "string") {
      const result = color_string_default.get(object);
      if (result === null) {
        throw new Error("Unable to parse color from string: " + object);
      }
      this.model = result.model;
      channels = color_convert_default[this.model].channels;
      this.color = result.value.slice(0, channels);
      this.valpha = typeof result.value[channels] === "number" ? result.value[channels] : 1;
    } else if (object.length > 0) {
      this.model = model || "rgb";
      channels = color_convert_default[this.model].channels;
      const newArray = Array.prototype.slice.call(object, 0, channels);
      this.color = zeroArray(newArray, channels);
      this.valpha = typeof object[channels] === "number" ? object[channels] : 1;
    } else if (typeof object === "number") {
      this.model = "rgb";
      this.color = [
        object >> 16 & 255,
        object >> 8 & 255,
        object & 255
      ];
      this.valpha = 1;
    } else {
      this.valpha = 1;
      const keys = Object.keys(object);
      if ("alpha" in object) {
        keys.splice(keys.indexOf("alpha"), 1);
        this.valpha = typeof object.alpha === "number" ? object.alpha : 0;
      }
      const hashedKeys = keys.sort().join("");
      if (!(hashedKeys in hashedModelKeys)) {
        throw new Error("Unable to parse color from object: " + JSON.stringify(object));
      }
      this.model = hashedModelKeys[hashedKeys];
      const { labels } = color_convert_default[this.model];
      const color = [];
      for (i = 0;i < labels.length; i++) {
        color.push(object[labels[i]]);
      }
      this.color = zeroArray(color);
    }
    if (limiters[this.model]) {
      channels = color_convert_default[this.model].channels;
      for (i = 0;i < channels; i++) {
        const limit = limiters[this.model][i];
        if (limit) {
          this.color[i] = limit(this.color[i]);
        }
      }
    }
    this.valpha = Math.max(0, Math.min(1, this.valpha));
    if (Object.freeze) {
      Object.freeze(this);
    }
  }
  Color.prototype = {
    toString() {
      return this.string();
    },
    toJSON() {
      return this[this.model]();
    },
    string(places) {
      let self = this.model in color_string_default.to ? this : this.rgb();
      self = self.round(typeof places === "number" ? places : 1);
      const arguments_ = self.valpha === 1 ? self.color : [...self.color, this.valpha];
      return color_string_default.to[self.model](...arguments_);
    },
    percentString(places) {
      const self = this.rgb().round(typeof places === "number" ? places : 1);
      const arguments_ = self.valpha === 1 ? self.color : [...self.color, this.valpha];
      return color_string_default.to.rgb.percent(...arguments_);
    },
    array() {
      return this.valpha === 1 ? [...this.color] : [...this.color, this.valpha];
    },
    object() {
      const result = {};
      const { channels } = color_convert_default[this.model];
      const { labels } = color_convert_default[this.model];
      for (let i = 0;i < channels; i++) {
        result[labels[i]] = this.color[i];
      }
      if (this.valpha !== 1) {
        result.alpha = this.valpha;
      }
      return result;
    },
    unitArray() {
      const rgb = this.rgb().color;
      rgb[0] /= 255;
      rgb[1] /= 255;
      rgb[2] /= 255;
      if (this.valpha !== 1) {
        rgb.push(this.valpha);
      }
      return rgb;
    },
    unitObject() {
      const rgb = this.rgb().object();
      rgb.r /= 255;
      rgb.g /= 255;
      rgb.b /= 255;
      if (this.valpha !== 1) {
        rgb.alpha = this.valpha;
      }
      return rgb;
    },
    round(places) {
      places = Math.max(places || 0, 0);
      return new Color([...this.color.map(roundToPlace(places)), this.valpha], this.model);
    },
    alpha(value) {
      if (value !== undefined) {
        return new Color([...this.color, Math.max(0, Math.min(1, value))], this.model);
      }
      return this.valpha;
    },
    red: getset("rgb", 0, maxfn(255)),
    green: getset("rgb", 1, maxfn(255)),
    blue: getset("rgb", 2, maxfn(255)),
    hue: getset(["hsl", "hsv", "hsl", "hwb", "hcg"], 0, (value) => (value % 360 + 360) % 360),
    saturationl: getset("hsl", 1, maxfn(100)),
    lightness: getset("hsl", 2, maxfn(100)),
    saturationv: getset("hsv", 1, maxfn(100)),
    value: getset("hsv", 2, maxfn(100)),
    chroma: getset("hcg", 1, maxfn(100)),
    gray: getset("hcg", 2, maxfn(100)),
    white: getset("hwb", 1, maxfn(100)),
    wblack: getset("hwb", 2, maxfn(100)),
    cyan: getset("cmyk", 0, maxfn(100)),
    magenta: getset("cmyk", 1, maxfn(100)),
    yellow: getset("cmyk", 2, maxfn(100)),
    black: getset("cmyk", 3, maxfn(100)),
    x: getset("xyz", 0, maxfn(95.047)),
    y: getset("xyz", 1, maxfn(100)),
    z: getset("xyz", 2, maxfn(108.833)),
    l: getset("lab", 0, maxfn(100)),
    a: getset("lab", 1),
    b: getset("lab", 2),
    keyword(value) {
      if (value !== undefined) {
        return new Color(value);
      }
      return color_convert_default[this.model].keyword(this.color);
    },
    hex(value) {
      if (value !== undefined) {
        return new Color(value);
      }
      return color_string_default.to.hex(...this.rgb().round().color);
    },
    hexa(value) {
      if (value !== undefined) {
        return new Color(value);
      }
      const rgbArray = this.rgb().round().color;
      let alphaHex = Math.round(this.valpha * 255).toString(16).toUpperCase();
      if (alphaHex.length === 1) {
        alphaHex = "0" + alphaHex;
      }
      return color_string_default.to.hex(...rgbArray) + alphaHex;
    },
    rgbNumber() {
      const rgb = this.rgb().color;
      return (rgb[0] & 255) << 16 | (rgb[1] & 255) << 8 | rgb[2] & 255;
    },
    luminosity() {
      const rgb = this.rgb().color;
      const lum = [];
      for (const [i, element] of rgb.entries()) {
        const chan = element / 255;
        lum[i] = chan <= 0.04045 ? chan / 12.92 : ((chan + 0.055) / 1.055) ** 2.4;
      }
      return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    },
    contrast(color2) {
      const lum1 = this.luminosity();
      const lum2 = color2.luminosity();
      if (lum1 > lum2) {
        return (lum1 + 0.05) / (lum2 + 0.05);
      }
      return (lum2 + 0.05) / (lum1 + 0.05);
    },
    level(color2) {
      const contrastRatio = this.contrast(color2);
      if (contrastRatio >= 7) {
        return "AAA";
      }
      return contrastRatio >= 4.5 ? "AA" : "";
    },
    isDark() {
      const rgb = this.rgb().color;
      const yiq = (rgb[0] * 2126 + rgb[1] * 7152 + rgb[2] * 722) / 1e4;
      return yiq < 128;
    },
    isLight() {
      return !this.isDark();
    },
    negate() {
      const rgb = this.rgb();
      for (let i = 0;i < 3; i++) {
        rgb.color[i] = 255 - rgb.color[i];
      }
      return rgb;
    },
    lighten(ratio) {
      const hsl = this.hsl();
      hsl.color[2] += hsl.color[2] * ratio;
      return hsl;
    },
    darken(ratio) {
      const hsl = this.hsl();
      hsl.color[2] -= hsl.color[2] * ratio;
      return hsl;
    },
    saturate(ratio) {
      const hsl = this.hsl();
      hsl.color[1] += hsl.color[1] * ratio;
      return hsl;
    },
    desaturate(ratio) {
      const hsl = this.hsl();
      hsl.color[1] -= hsl.color[1] * ratio;
      return hsl;
    },
    whiten(ratio) {
      const hwb = this.hwb();
      hwb.color[1] += hwb.color[1] * ratio;
      return hwb;
    },
    blacken(ratio) {
      const hwb = this.hwb();
      hwb.color[2] += hwb.color[2] * ratio;
      return hwb;
    },
    grayscale() {
      const rgb = this.rgb().color;
      const value = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
      return Color.rgb(value, value, value);
    },
    fade(ratio) {
      return this.alpha(this.valpha - this.valpha * ratio);
    },
    opaquer(ratio) {
      return this.alpha(this.valpha + this.valpha * ratio);
    },
    rotate(degrees) {
      const hsl = this.hsl();
      let hue = hsl.color[0];
      hue = (hue + degrees) % 360;
      hue = hue < 0 ? 360 + hue : hue;
      hsl.color[0] = hue;
      return hsl;
    },
    mix(mixinColor, weight) {
      if (!mixinColor || !mixinColor.rgb) {
        throw new Error('Argument to "mix" was not a Color instance, but rather an instance of ' + typeof mixinColor);
      }
      const color1 = mixinColor.rgb();
      const color2 = this.rgb();
      const p = weight === undefined ? 0.5 : weight;
      const w = 2 * p - 1;
      const a = color1.alpha() - color2.alpha();
      const w1 = ((w * a === -1 ? w : (w + a) / (1 + w * a)) + 1) / 2;
      const w2 = 1 - w1;
      return Color.rgb(w1 * color1.red() + w2 * color2.red(), w1 * color1.green() + w2 * color2.green(), w1 * color1.blue() + w2 * color2.blue(), color1.alpha() * p + color2.alpha() * (1 - p));
    }
  };
  for (const model of Object.keys(color_convert_default)) {
    if (skippedModels.includes(model)) {
      continue;
    }
    const { channels } = color_convert_default[model];
    Color.prototype[model] = function(...arguments_) {
      if (this.model === model) {
        return new Color(this);
      }
      if (arguments_.length > 0) {
        return new Color(arguments_, model);
      }
      return new Color([...assertArray(color_convert_default[this.model][model].raw(this.color)), this.valpha], model);
    };
    Color[model] = function(...arguments_) {
      let color = arguments_[0];
      if (typeof color === "number") {
        color = zeroArray(arguments_, channels);
      }
      return new Color(color, model);
    };
  }
  function roundTo(number, places) {
    return Number(number.toFixed(places));
  }
  function roundToPlace(places) {
    return function(number) {
      return roundTo(number, places);
    };
  }
  function getset(model, channel, modifier) {
    model = Array.isArray(model) ? model : [model];
    for (const m of model) {
      (limiters[m] ||= [])[channel] = modifier;
    }
    model = model[0];
    return function(value) {
      let result;
      if (value !== undefined) {
        if (modifier) {
          value = modifier(value);
        }
        result = this[model]();
        result.color[channel] = value;
        return result;
      }
      result = this[model]().color[channel];
      if (modifier) {
        result = modifier(result);
      }
      return result;
    };
  }
  function maxfn(max) {
    return function(v) {
      return Math.max(0, Math.min(max, v));
    };
  }
  function assertArray(value) {
    return Array.isArray(value) ? value : [value];
  }
  function zeroArray(array, length) {
    for (let i = 0;i < length; i++) {
      if (typeof array[i] !== "number") {
        array[i] = 0;
      }
    }
    return array;
  }
  var index_default = Color;
});

// node_modules/@img/colour/index.cjs
var require_colour = __commonJS(function(exports, module) {
  module.exports = require_color().default;
});

// node_modules/sharp/dist/colour.mjs
function tint(tint) {
  this._setBackgroundColourOption("tint", tint);
  return this;
}
function greyscale(greyscale) {
  this.options.greyscale = is_default.bool(greyscale) ? greyscale : true;
  return this;
}
function grayscale(grayscale) {
  return this.greyscale(grayscale);
}
function pipelineColourspace(colourspace) {
  if (!is_default.string(colourspace)) {
    throw is_default.invalidParameterError("colourspace", "string", colourspace);
  }
  this.options.colourspacePipeline = colourspace;
  return this;
}
function pipelineColorspace(colorspace) {
  return this.pipelineColourspace(colorspace);
}
function toColourspace(colourspace) {
  if (!is_default.string(colourspace)) {
    throw is_default.invalidParameterError("colourspace", "string", colourspace);
  }
  this.options.colourspace = colourspace;
  return this;
}
function toColorspace(colorspace) {
  return this.toColourspace(colorspace);
}
function _getBackgroundColourOption(value) {
  if (is_default.object(value) || is_default.string(value) && value.length >= 3 && value.length <= 200) {
    const colour = import_colour.default(value);
    const red = colour.red();
    const green = colour.green();
    const blue = colour.blue();
    const alpha = Math.round(colour.alpha() * 255);
    for (const [channel, component] of [["red", red], ["green", green], ["blue", blue], ["alpha", alpha]]) {
      if (!is_default.number(component)) {
        throw is_default.invalidParameterError(`background.${channel}`, "number", component);
      }
    }
    return [red, green, blue, alpha];
  } else {
    throw is_default.invalidParameterError("background", "object or string", value);
  }
}
function _setBackgroundColourOption(key, value) {
  if (is_default.defined(value)) {
    this.options[key] = _getBackgroundColourOption(value);
  }
}
var import_colour, colourspace, colour_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    tint,
    greyscale,
    grayscale,
    pipelineColourspace,
    pipelineColorspace,
    toColourspace,
    toColorspace,
    _getBackgroundColourOption,
    _setBackgroundColourOption
  });
  Sharp.colourspace = colourspace;
  Sharp.colorspace = colourspace;
};
var init_colour = __esm(() => {
  init_is();
  import_colour = __toESM(require_colour(), 1);
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  colourspace = {
    multiband: "multiband",
    "b-w": "b-w",
    bw: "b-w",
    cmyk: "cmyk",
    srgb: "srgb"
  };
});

// node_modules/sharp/dist/channel.mjs
function removeAlpha() {
  this.options.removeAlpha = true;
  return this;
}
function ensureAlpha(alpha) {
  if (is_default.defined(alpha)) {
    if (is_default.number(alpha) && is_default.inRange(alpha, 0, 1)) {
      this.options.ensureAlpha = alpha;
    } else {
      throw is_default.invalidParameterError("alpha", "number between 0 and 1", alpha);
    }
  } else {
    this.options.ensureAlpha = 1;
  }
  return this;
}
function extractChannel(channel) {
  const channelMap = { red: 0, green: 1, blue: 2, alpha: 3 };
  if (Object.keys(channelMap).includes(channel)) {
    channel = channelMap[channel];
  }
  if (is_default.integer(channel) && is_default.inRange(channel, 0, 4)) {
    this.options.extractChannel = channel;
  } else {
    throw is_default.invalidParameterError("channel", "integer or one of: red, green, blue, alpha", channel);
  }
  return this;
}
function joinChannel(images, options) {
  if (Array.isArray(images)) {
    images.forEach(function(image) {
      this.options.joinChannelIn.push(this._createInputDescriptor(image, options));
    }, this);
  } else {
    this.options.joinChannelIn.push(this._createInputDescriptor(images, options));
  }
  return this;
}
function bandbool(boolOp) {
  if (is_default.string(boolOp) && is_default.inArray(boolOp, ["and", "or", "eor"])) {
    this.options.bandBoolOp = boolOp;
  } else {
    throw is_default.invalidParameterError("boolOp", "one of: and, or, eor", boolOp);
  }
  return this;
}
var bool2, channel_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    removeAlpha,
    ensureAlpha,
    extractChannel,
    joinChannel,
    bandbool
  });
  Sharp.bool = bool2;
};
var init_channel = __esm(() => {
  init_is();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  bool2 = {
    and: "and",
    or: "or",
    eor: "eor"
  };
});

// node_modules/sharp/dist/output.mjs
import path9 from "node:path";
function toFile(fileOut, callback) {
  let err;
  if (!is_default.string(fileOut)) {
    err = new Error("Missing output file path");
  } else if (is_default.string(this.options.input.file) && path9.resolve(this.options.input.file) === path9.resolve(fileOut)) {
    err = new Error("Cannot use same file for input and output");
  } else if (jp2Regex.test(path9.extname(fileOut)) && !this.constructor.format.jp2.output.file) {
    err = errJp2Save();
  }
  if (err) {
    if (is_default.fn(callback)) {
      callback(err);
    } else {
      return Promise.reject(err);
    }
  } else {
    this.options.fileOut = fileOut;
    const stack = Error();
    return this._pipeline(callback, stack);
  }
  return this;
}
function toBuffer(options, callback) {
  if (is_default.object(options)) {
    this._setBooleanOption("resolveWithObject", options.resolveWithObject);
  } else if (this.options.resolveWithObject) {
    this.options.resolveWithObject = false;
  }
  this.options.fileOut = "";
  const stack = Error();
  return this._pipeline(is_default.fn(options) ? options : callback, stack);
}
function toUint8Array() {
  this.options.resolveWithObject = true;
  this.options.typedArrayOut = true;
  const stack = Error();
  return this._pipeline(null, stack);
}
function withDensity(density) {
  if (is_default.number(density) && density > 0) {
    this.options.withMetadataDensity = density;
  } else {
    throw is_default.invalidParameterError("density", "positive number", density);
  }
  return this.keepExif();
}
function keepExif() {
  this.options.keepMetadata |= 1;
  return this;
}
function withExif(exif) {
  if (is_default.object(exif)) {
    for (const [ifd, entries] of Object.entries(exif)) {
      if (is_default.object(entries)) {
        for (const [k, v] of Object.entries(entries)) {
          if (is_default.string(v)) {
            this.options.withExif[`exif-${ifd.toLowerCase()}-${k}`] = v;
          } else {
            throw is_default.invalidParameterError(`${ifd}.${k}`, "string", v);
          }
        }
      } else {
        throw is_default.invalidParameterError(ifd, "object", entries);
      }
    }
  } else {
    throw is_default.invalidParameterError("exif", "object", exif);
  }
  this.options.withExifMerge = false;
  return this.keepExif();
}
function withExifMerge(exif) {
  this.withExif(exif);
  this.options.withExifMerge = true;
  return this;
}
function keepIccProfile() {
  this.options.keepMetadata |= 8;
  return this;
}
function withIccProfile(icc, options) {
  if (is_default.string(icc)) {
    this.options.withIccProfile = icc;
  } else {
    throw is_default.invalidParameterError("icc", "string", icc);
  }
  this.keepIccProfile();
  if (is_default.object(options)) {
    if (is_default.defined(options.attach)) {
      if (is_default.bool(options.attach)) {
        if (!options.attach) {
          this.options.keepMetadata &= ~8;
        }
      } else {
        throw is_default.invalidParameterError("attach", "boolean", options.attach);
      }
    }
  }
  return this;
}
function keepGainMap() {
  this.options.keepGainMap = true;
  this.options.withGainMap = false;
  this.options.keepMetadata |= 32;
  return this;
}
function withGainMap() {
  this.options.withGainMap = true;
  this.options.keepGainMap = false;
  this.options.colourspace = "scrgb";
  return this;
}
function keepXmp() {
  this.options.keepMetadata |= 2;
  return this;
}
function withXmp(xmp) {
  if (is_default.string(xmp) && xmp.length > 0) {
    this.options.withXmp = xmp;
    this.options.keepMetadata |= 2;
  } else {
    throw is_default.invalidParameterError("xmp", "non-empty string", xmp);
  }
  return this;
}
function keepMetadata() {
  this.options.keepMetadata |= 31;
  return this;
}
function withMetadata(options) {
  this.keepMetadata();
  this.withIccProfile("srgb");
  if (is_default.object(options)) {
    if (is_default.defined(options.orientation)) {
      if (is_default.integer(options.orientation) && is_default.inRange(options.orientation, 1, 8)) {
        this.options.withMetadataOrientation = options.orientation;
      } else {
        throw is_default.invalidParameterError("orientation", "integer between 1 and 8", options.orientation);
      }
    }
    if (is_default.defined(options.density)) {
      if (is_default.number(options.density) && options.density > 0) {
        this.options.withMetadataDensity = options.density;
      } else {
        throw is_default.invalidParameterError("density", "positive number", options.density);
      }
    }
    if (is_default.defined(options.icc)) {
      this.withIccProfile(options.icc);
    }
    if (is_default.defined(options.exif)) {
      this.withExifMerge(options.exif);
    }
  }
  return this;
}
function toFormat(format, options) {
  const actualFormat = formats.get((is_default.object(format) && is_default.string(format.id) ? format.id : format).toLowerCase());
  if (!actualFormat) {
    throw is_default.invalidParameterError("format", `one of: ${[...formats.keys()].join(", ")}`, format);
  }
  return this[actualFormat](options);
}
function jpeg(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.jpegQuality = options.quality;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    }
    if (is_default.defined(options.progressive)) {
      this._setBooleanOption("jpegProgressive", options.progressive);
    }
    if (is_default.defined(options.chromaSubsampling)) {
      if (is_default.string(options.chromaSubsampling) && is_default.inArray(options.chromaSubsampling, ["4:2:0", "4:4:4"])) {
        this.options.jpegChromaSubsampling = options.chromaSubsampling;
      } else {
        throw is_default.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", options.chromaSubsampling);
      }
    }
    const optimiseCoding = is_default.bool(options.optimizeCoding) ? options.optimizeCoding : options.optimiseCoding;
    if (is_default.defined(optimiseCoding)) {
      this._setBooleanOption("jpegOptimiseCoding", optimiseCoding);
    }
    if (is_default.defined(options.mozjpeg)) {
      if (is_default.bool(options.mozjpeg)) {
        if (options.mozjpeg) {
          this.options.jpegTrellisQuantisation = true;
          this.options.jpegOvershootDeringing = true;
          this.options.jpegOptimiseScans = true;
          this.options.jpegProgressive = true;
          this.options.jpegQuantisationTable = 3;
        }
      } else {
        throw is_default.invalidParameterError("mozjpeg", "boolean", options.mozjpeg);
      }
    }
    const trellisQuantisation = is_default.bool(options.trellisQuantization) ? options.trellisQuantization : options.trellisQuantisation;
    if (is_default.defined(trellisQuantisation)) {
      this._setBooleanOption("jpegTrellisQuantisation", trellisQuantisation);
    }
    if (is_default.defined(options.overshootDeringing)) {
      this._setBooleanOption("jpegOvershootDeringing", options.overshootDeringing);
    }
    const optimiseScans = is_default.bool(options.optimizeScans) ? options.optimizeScans : options.optimiseScans;
    if (is_default.defined(optimiseScans)) {
      this._setBooleanOption("jpegOptimiseScans", optimiseScans);
      if (optimiseScans) {
        this.options.jpegProgressive = true;
      }
    }
    const quantisationTable = is_default.number(options.quantizationTable) ? options.quantizationTable : options.quantisationTable;
    if (is_default.defined(quantisationTable)) {
      if (is_default.integer(quantisationTable) && is_default.inRange(quantisationTable, 0, 8)) {
        this.options.jpegQuantisationTable = quantisationTable;
      } else {
        throw is_default.invalidParameterError("quantisationTable", "integer between 0 and 8", quantisationTable);
      }
    }
  }
  return this._updateFormatOut("jpeg", options);
}
function png(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.progressive)) {
      this._setBooleanOption("pngProgressive", options.progressive);
    }
    if (is_default.defined(options.compressionLevel)) {
      if (is_default.integer(options.compressionLevel) && is_default.inRange(options.compressionLevel, 0, 9)) {
        this.options.pngCompressionLevel = options.compressionLevel;
      } else {
        throw is_default.invalidParameterError("compressionLevel", "integer between 0 and 9", options.compressionLevel);
      }
    }
    if (is_default.defined(options.adaptiveFiltering)) {
      this._setBooleanOption("pngAdaptiveFiltering", options.adaptiveFiltering);
    }
    const colours = options.colours || options.colors;
    if (is_default.defined(colours)) {
      if (is_default.integer(colours) && is_default.inRange(colours, 2, 256)) {
        this.options.pngBitdepth = bitdepthFromColourCount(colours);
      } else {
        throw is_default.invalidParameterError("colours", "integer between 2 and 256", colours);
      }
    }
    if (is_default.defined(options.palette)) {
      this._setBooleanOption("pngPalette", options.palette);
    } else if ([options.quality, options.effort, options.colours, options.colors, options.dither].some(is_default.defined)) {
      this._setBooleanOption("pngPalette", true);
    }
    if (this.options.pngPalette) {
      if (is_default.defined(options.quality)) {
        if (is_default.integer(options.quality) && is_default.inRange(options.quality, 0, 100)) {
          this.options.pngQuality = options.quality;
        } else {
          throw is_default.invalidParameterError("quality", "integer between 0 and 100", options.quality);
        }
      }
      if (is_default.defined(options.effort)) {
        if (is_default.integer(options.effort) && is_default.inRange(options.effort, 1, 10)) {
          this.options.pngEffort = options.effort;
        } else {
          throw is_default.invalidParameterError("effort", "integer between 1 and 10", options.effort);
        }
      }
      if (is_default.defined(options.dither)) {
        if (is_default.number(options.dither) && is_default.inRange(options.dither, 0, 1)) {
          this.options.pngDither = options.dither;
        } else {
          throw is_default.invalidParameterError("dither", "number between 0.0 and 1.0", options.dither);
        }
      }
    }
  }
  return this._updateFormatOut("png", options);
}
function webp(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.webpQuality = options.quality;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    }
    if (is_default.defined(options.alphaQuality)) {
      if (is_default.integer(options.alphaQuality) && is_default.inRange(options.alphaQuality, 0, 100)) {
        this.options.webpAlphaQuality = options.alphaQuality;
      } else {
        throw is_default.invalidParameterError("alphaQuality", "integer between 0 and 100", options.alphaQuality);
      }
    }
    if (is_default.defined(options.lossless)) {
      this._setBooleanOption("webpLossless", options.lossless);
    }
    if (is_default.defined(options.nearLossless)) {
      this._setBooleanOption("webpNearLossless", options.nearLossless);
    }
    if (is_default.defined(options.smartSubsample)) {
      this._setBooleanOption("webpSmartSubsample", options.smartSubsample);
    }
    if (is_default.defined(options.smartDeblock)) {
      this._setBooleanOption("webpSmartDeblock", options.smartDeblock);
    }
    if (is_default.defined(options.preset)) {
      if (is_default.string(options.preset) && is_default.inArray(options.preset, ["default", "photo", "picture", "drawing", "icon", "text"])) {
        this.options.webpPreset = options.preset;
      } else {
        throw is_default.invalidParameterError("preset", "one of: default, photo, picture, drawing, icon, text", options.preset);
      }
    }
    if (is_default.defined(options.effort)) {
      if (is_default.integer(options.effort) && is_default.inRange(options.effort, 0, 6)) {
        this.options.webpEffort = options.effort;
      } else {
        throw is_default.invalidParameterError("effort", "integer between 0 and 6", options.effort);
      }
    }
    if (is_default.defined(options.minSize)) {
      this._setBooleanOption("webpMinSize", options.minSize);
    }
    if (is_default.defined(options.mixed)) {
      this._setBooleanOption("webpMixed", options.mixed);
    }
    if (is_default.defined(options.exact)) {
      this._setBooleanOption("webpExact", options.exact);
    }
  }
  trySetAnimationOptions(options, this.options);
  return this._updateFormatOut("webp", options);
}
function gif(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.reuse)) {
      this._setBooleanOption("gifReuse", options.reuse);
    }
    if (is_default.defined(options.progressive)) {
      this._setBooleanOption("gifProgressive", options.progressive);
    }
    const colours = options.colours || options.colors;
    if (is_default.defined(colours)) {
      if (is_default.integer(colours) && is_default.inRange(colours, 2, 256)) {
        this.options.gifBitdepth = bitdepthFromColourCount(colours);
      } else {
        throw is_default.invalidParameterError("colours", "integer between 2 and 256", colours);
      }
    }
    if (is_default.defined(options.effort)) {
      if (is_default.integer(options.effort) && is_default.inRange(options.effort, 1, 10)) {
        this.options.gifEffort = options.effort;
      } else {
        throw is_default.invalidParameterError("effort", "integer between 1 and 10", options.effort);
      }
    }
    if (is_default.defined(options.dither)) {
      if (is_default.number(options.dither) && is_default.inRange(options.dither, 0, 1)) {
        this.options.gifDither = options.dither;
      } else {
        throw is_default.invalidParameterError("dither", "number between 0.0 and 1.0", options.dither);
      }
    }
    if (is_default.defined(options.interFrameMaxError)) {
      if (is_default.number(options.interFrameMaxError) && is_default.inRange(options.interFrameMaxError, 0, 32)) {
        this.options.gifInterFrameMaxError = options.interFrameMaxError;
      } else {
        throw is_default.invalidParameterError("interFrameMaxError", "number between 0.0 and 32.0", options.interFrameMaxError);
      }
    }
    if (is_default.defined(options.interPaletteMaxError)) {
      if (is_default.number(options.interPaletteMaxError) && is_default.inRange(options.interPaletteMaxError, 0, 256)) {
        this.options.gifInterPaletteMaxError = options.interPaletteMaxError;
      } else {
        throw is_default.invalidParameterError("interPaletteMaxError", "number between 0.0 and 256.0", options.interPaletteMaxError);
      }
    }
    if (is_default.defined(options.keepDuplicateFrames)) {
      if (is_default.bool(options.keepDuplicateFrames)) {
        this._setBooleanOption("gifKeepDuplicateFrames", options.keepDuplicateFrames);
      } else {
        throw is_default.invalidParameterError("keepDuplicateFrames", "boolean", options.keepDuplicateFrames);
      }
    }
  }
  trySetAnimationOptions(options, this.options);
  return this._updateFormatOut("gif", options);
}
function jp2(options) {
  if (!this.constructor.format.jp2.output.buffer) {
    throw errJp2Save();
  }
  if (is_default.object(options)) {
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.jp2Quality = options.quality;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    }
    if (is_default.defined(options.lossless)) {
      if (is_default.bool(options.lossless)) {
        this.options.jp2Lossless = options.lossless;
      } else {
        throw is_default.invalidParameterError("lossless", "boolean", options.lossless);
      }
    }
    if (is_default.defined(options.tileWidth)) {
      if (is_default.integer(options.tileWidth) && is_default.inRange(options.tileWidth, 1, 32768)) {
        this.options.jp2TileWidth = options.tileWidth;
      } else {
        throw is_default.invalidParameterError("tileWidth", "integer between 1 and 32768", options.tileWidth);
      }
    }
    if (is_default.defined(options.tileHeight)) {
      if (is_default.integer(options.tileHeight) && is_default.inRange(options.tileHeight, 1, 32768)) {
        this.options.jp2TileHeight = options.tileHeight;
      } else {
        throw is_default.invalidParameterError("tileHeight", "integer between 1 and 32768", options.tileHeight);
      }
    }
    if (is_default.defined(options.chromaSubsampling)) {
      if (is_default.string(options.chromaSubsampling) && is_default.inArray(options.chromaSubsampling, ["4:2:0", "4:4:4"])) {
        this.options.jp2ChromaSubsampling = options.chromaSubsampling;
      } else {
        throw is_default.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", options.chromaSubsampling);
      }
    }
  }
  return this._updateFormatOut("jp2", options);
}
function trySetAnimationOptions(source, target) {
  if (is_default.object(source) && is_default.defined(source.loop)) {
    if (is_default.integer(source.loop) && is_default.inRange(source.loop, 0, 65535)) {
      target.loop = source.loop;
    } else {
      throw is_default.invalidParameterError("loop", "integer between 0 and 65535", source.loop);
    }
  }
  if (is_default.object(source) && is_default.defined(source.delay)) {
    if (is_default.integer(source.delay) && is_default.inRange(source.delay, 0, 65535)) {
      target.delay = [source.delay];
    } else if (Array.isArray(source.delay) && source.delay.every(is_default.integer) && source.delay.every((v) => is_default.inRange(v, 0, 65535))) {
      target.delay = source.delay;
    } else {
      throw is_default.invalidParameterError("delay", "integer or an array of integers between 0 and 65535", source.delay);
    }
  }
}
function tiff(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.tiffQuality = options.quality;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    }
    if (is_default.defined(options.bitdepth)) {
      if (is_default.integer(options.bitdepth) && is_default.inArray(options.bitdepth, [1, 2, 4])) {
        this.options.tiffBitdepth = options.bitdepth;
      } else {
        throw is_default.invalidParameterError("bitdepth", "1, 2 or 4", options.bitdepth);
      }
    }
    if (is_default.defined(options.tile)) {
      this._setBooleanOption("tiffTile", options.tile);
    }
    if (is_default.defined(options.tileWidth)) {
      if (is_default.integer(options.tileWidth) && is_default.inRange(options.tileWidth, 1, 32768)) {
        this.options.tiffTileWidth = options.tileWidth;
      } else {
        throw is_default.invalidParameterError("tileWidth", "integer between 1 and 32768", options.tileWidth);
      }
    }
    if (is_default.defined(options.tileHeight)) {
      if (is_default.integer(options.tileHeight) && is_default.inRange(options.tileHeight, 1, 32768)) {
        this.options.tiffTileHeight = options.tileHeight;
      } else {
        throw is_default.invalidParameterError("tileHeight", "integer between 1 and 32768", options.tileHeight);
      }
    }
    if (is_default.defined(options.miniswhite)) {
      this._setBooleanOption("tiffMiniswhite", options.miniswhite);
    }
    if (is_default.defined(options.pyramid)) {
      this._setBooleanOption("tiffPyramid", options.pyramid);
    }
    if (is_default.defined(options.xres)) {
      if (is_default.number(options.xres) && is_default.inRange(options.xres, 0.001, 1e6)) {
        this.options.tiffXres = options.xres;
      } else {
        throw is_default.invalidParameterError("xres", "number between 0.001 and 1000000", options.xres);
      }
    }
    if (is_default.defined(options.yres)) {
      if (is_default.number(options.yres) && is_default.inRange(options.yres, 0.001, 1e6)) {
        this.options.tiffYres = options.yres;
      } else {
        throw is_default.invalidParameterError("yres", "number between 0.001 and 1000000", options.yres);
      }
    }
    if (is_default.defined(options.compression)) {
      if (is_default.string(options.compression) && is_default.inArray(options.compression, ["none", "jpeg", "deflate", "packbits", "ccittfax4", "lzw", "webp", "zstd", "jp2k"])) {
        this.options.tiffCompression = options.compression;
      } else {
        throw is_default.invalidParameterError("compression", "one of: none, jpeg, deflate, packbits, ccittfax4, lzw, webp, zstd, jp2k", options.compression);
      }
    }
    if (is_default.defined(options.bigtiff)) {
      this._setBooleanOption("tiffBigtiff", options.bigtiff);
    }
    if (is_default.defined(options.predictor)) {
      if (is_default.string(options.predictor) && is_default.inArray(options.predictor, ["none", "horizontal", "float"])) {
        this.options.tiffPredictor = options.predictor;
      } else {
        throw is_default.invalidParameterError("predictor", "one of: none, horizontal, float", options.predictor);
      }
    }
    if (is_default.defined(options.resolutionUnit)) {
      if (is_default.string(options.resolutionUnit) && is_default.inArray(options.resolutionUnit, ["inch", "cm"])) {
        this.options.tiffResolutionUnit = options.resolutionUnit;
      } else {
        throw is_default.invalidParameterError("resolutionUnit", "one of: inch, cm", options.resolutionUnit);
      }
    }
  }
  return this._updateFormatOut("tiff", options);
}
function avif(options) {
  return this.heif({ ...options, compression: "av1" });
}
function heif(options) {
  if (is_default.object(options)) {
    if (is_default.string(options.compression) && is_default.inArray(options.compression, ["av1", "hevc"])) {
      this.options.heifCompression = options.compression;
    } else {
      throw is_default.invalidParameterError("compression", "one of: av1, hevc", options.compression);
    }
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.heifQuality = options.quality;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    }
    if (is_default.defined(options.lossless)) {
      if (is_default.bool(options.lossless)) {
        this.options.heifLossless = options.lossless;
      } else {
        throw is_default.invalidParameterError("lossless", "boolean", options.lossless);
      }
    }
    if (is_default.defined(options.effort)) {
      if (is_default.integer(options.effort) && is_default.inRange(options.effort, 0, 9)) {
        this.options.heifEffort = options.effort;
      } else {
        throw is_default.invalidParameterError("effort", "integer between 0 and 9", options.effort);
      }
    }
    if (is_default.defined(options.chromaSubsampling)) {
      if (is_default.string(options.chromaSubsampling) && is_default.inArray(options.chromaSubsampling, ["4:2:0", "4:4:4"])) {
        this.options.heifChromaSubsampling = options.chromaSubsampling;
      } else {
        throw is_default.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", options.chromaSubsampling);
      }
    }
    if (is_default.defined(options.bitdepth)) {
      if (is_default.integer(options.bitdepth) && is_default.inArray(options.bitdepth, [8, 10, 12])) {
        this.options.heifBitdepth = options.bitdepth;
      } else {
        throw is_default.invalidParameterError("bitdepth", "8, 10 or 12", options.bitdepth);
      }
    }
    if (is_default.defined(options.tune)) {
      if (is_default.string(options.tune) && is_default.inArray(options.tune, ["auto", "iq", "psnr", "ssim"])) {
        if (this.options.heifLossless && options.tune === "iq") {
          this.options.heifTune = "ssim";
        } else {
          this.options.heifTune = options.tune;
        }
      } else {
        throw is_default.invalidParameterError("tune", "one of: auto, iq, psnr, ssim", options.tune);
      }
    }
  } else {
    throw is_default.invalidParameterError("options", "Object", options);
  }
  return this._updateFormatOut("heif", options);
}
function jxl(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.quality)) {
      if (is_default.integer(options.quality) && is_default.inRange(options.quality, 1, 100)) {
        this.options.jxlDistance = options.quality >= 30 ? 0.1 + (100 - options.quality) * 0.09 : 53 / 3000 * options.quality * options.quality - 23 / 20 * options.quality + 25;
      } else {
        throw is_default.invalidParameterError("quality", "integer between 1 and 100", options.quality);
      }
    } else if (is_default.defined(options.distance)) {
      if (is_default.number(options.distance) && is_default.inRange(options.distance, 0, 15)) {
        this.options.jxlDistance = options.distance;
      } else {
        throw is_default.invalidParameterError("distance", "number between 0.0 and 15.0", options.distance);
      }
    }
    if (is_default.defined(options.decodingTier)) {
      if (is_default.integer(options.decodingTier) && is_default.inRange(options.decodingTier, 0, 4)) {
        this.options.jxlDecodingTier = options.decodingTier;
      } else {
        throw is_default.invalidParameterError("decodingTier", "integer between 0 and 4", options.decodingTier);
      }
    }
    if (is_default.defined(options.lossless)) {
      if (is_default.bool(options.lossless)) {
        this.options.jxlLossless = options.lossless;
      } else {
        throw is_default.invalidParameterError("lossless", "boolean", options.lossless);
      }
    }
    if (is_default.defined(options.effort)) {
      if (is_default.integer(options.effort) && is_default.inRange(options.effort, 1, 9)) {
        this.options.jxlEffort = options.effort;
      } else {
        throw is_default.invalidParameterError("effort", "integer between 1 and 9", options.effort);
      }
    }
  }
  trySetAnimationOptions(options, this.options);
  return this._updateFormatOut("jxl", options);
}
function raw(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.depth)) {
      if (is_default.string(options.depth) && is_default.inArray(options.depth, ["char", "uchar", "short", "ushort", "int", "uint", "float", "complex", "double", "dpcomplex"])) {
        this.options.rawDepth = options.depth;
      } else {
        throw is_default.invalidParameterError("depth", "one of: char, uchar, short, ushort, int, uint, float, complex, double, dpcomplex", options.depth);
      }
    }
  }
  return this._updateFormatOut("raw");
}
function tile(options) {
  if (is_default.object(options)) {
    if (is_default.defined(options.size)) {
      if (is_default.integer(options.size) && is_default.inRange(options.size, 1, 8192)) {
        this.options.tileSize = options.size;
      } else {
        throw is_default.invalidParameterError("size", "integer between 1 and 8192", options.size);
      }
    }
    if (is_default.defined(options.overlap)) {
      if (is_default.integer(options.overlap) && is_default.inRange(options.overlap, 0, 8192)) {
        if (options.overlap > this.options.tileSize) {
          throw is_default.invalidParameterError("overlap", `<= size (${this.options.tileSize})`, options.overlap);
        }
        this.options.tileOverlap = options.overlap;
      } else {
        throw is_default.invalidParameterError("overlap", "integer between 0 and 8192", options.overlap);
      }
    }
    if (is_default.defined(options.container)) {
      if (is_default.string(options.container) && is_default.inArray(options.container, ["fs", "zip"])) {
        this.options.tileContainer = options.container;
      } else {
        throw is_default.invalidParameterError("container", "one of: fs, zip", options.container);
      }
    }
    if (is_default.defined(options.layout)) {
      if (is_default.string(options.layout) && is_default.inArray(options.layout, ["dz", "google", "iiif", "iiif3", "zoomify"])) {
        this.options.tileLayout = options.layout;
      } else {
        throw is_default.invalidParameterError("layout", "one of: dz, google, iiif, iiif3, zoomify", options.layout);
      }
    }
    if (is_default.defined(options.angle)) {
      if (is_default.integer(options.angle) && !(options.angle % 90)) {
        this.options.tileAngle = options.angle;
      } else {
        throw is_default.invalidParameterError("angle", "positive/negative multiple of 90", options.angle);
      }
    }
    this._setBackgroundColourOption("tileBackground", options.background);
    if (is_default.defined(options.depth)) {
      if (is_default.string(options.depth) && is_default.inArray(options.depth, ["onepixel", "onetile", "one"])) {
        this.options.tileDepth = options.depth;
      } else {
        throw is_default.invalidParameterError("depth", "one of: onepixel, onetile, one", options.depth);
      }
    }
    if (is_default.defined(options.skipBlanks)) {
      if (is_default.integer(options.skipBlanks) && is_default.inRange(options.skipBlanks, -1, 65535)) {
        this.options.tileSkipBlanks = options.skipBlanks;
      } else {
        throw is_default.invalidParameterError("skipBlanks", "integer between -1 and 255/65535", options.skipBlanks);
      }
    } else if (is_default.defined(options.layout) && options.layout === "google") {
      this.options.tileSkipBlanks = 5;
    }
    const centre = is_default.bool(options.center) ? options.center : options.centre;
    if (is_default.defined(centre)) {
      this._setBooleanOption("tileCentre", centre);
    }
    if (is_default.defined(options.id)) {
      if (is_default.string(options.id)) {
        this.options.tileId = options.id;
      } else {
        throw is_default.invalidParameterError("id", "string", options.id);
      }
    }
    if (is_default.defined(options.basename)) {
      if (is_default.string(options.basename)) {
        this.options.tileBasename = options.basename;
      } else {
        throw is_default.invalidParameterError("basename", "string", options.basename);
      }
    }
  }
  if (is_default.inArray(this.options.formatOut, ["jpeg", "png", "webp"])) {
    this.options.tileFormat = this.options.formatOut;
  } else if (this.options.formatOut !== "input") {
    throw is_default.invalidParameterError("format", "one of: jpeg, png, webp", this.options.formatOut);
  }
  return this._updateFormatOut("dz");
}
function timeout(options) {
  if (!is_default.plainObject(options)) {
    throw is_default.invalidParameterError("options", "object", options);
  }
  if (is_default.integer(options.seconds) && is_default.inRange(options.seconds, 0, 3600)) {
    this.options.timeoutSeconds = options.seconds;
  } else {
    throw is_default.invalidParameterError("seconds", "integer between 0 and 3600", options.seconds);
  }
  return this;
}
function _updateFormatOut(formatOut, options) {
  if (!(is_default.object(options) && options.force === false)) {
    this.options.formatOut = formatOut;
  }
  return this;
}
function _setBooleanOption(key, val) {
  if (is_default.bool(val)) {
    this.options[key] = val;
  } else {
    throw is_default.invalidParameterError(key, "boolean", val);
  }
}
function _read() {
  if (!this.options.streamOut) {
    this.options.streamOut = true;
    const stack = Error();
    this._pipeline(undefined, stack);
  }
}
function _pipeline(callback, stack) {
  if (typeof callback === "function") {
    if (this._isStreamInput()) {
      this._whenStreamInFinished(() => {
        this._flattenBufferIn();
        sharp_default.pipeline(this.options, (err, data, info) => {
          if (err) {
            callback(is_default.nativeError(err, stack));
          } else {
            callback(null, data, info);
          }
        });
      });
    } else {
      sharp_default.pipeline(this.options, (err, data, info) => {
        if (err) {
          callback(is_default.nativeError(err, stack));
        } else {
          callback(null, data, info);
        }
      });
    }
    return this;
  } else if (this.options.streamOut) {
    if (this._isStreamInput()) {
      this._whenStreamInFinished(() => {
        this._flattenBufferIn();
        sharp_default.pipeline(this.options, (err, data, info) => {
          if (err) {
            this.emit("error", is_default.nativeError(err, stack));
          } else {
            this.emit("info", info);
            this.push(data);
          }
          this.push(null);
          this.on("end", () => this.emit("close"));
        });
      });
    } else {
      sharp_default.pipeline(this.options, (err, data, info) => {
        if (err) {
          this.emit("error", is_default.nativeError(err, stack));
        } else {
          this.emit("info", info);
          this.push(data);
        }
        this.push(null);
        this.on("end", () => this.emit("close"));
      });
    }
    return this;
  } else {
    if (this._isStreamInput()) {
      return new Promise((resolve, reject) => {
        this._whenStreamInFinished(() => {
          this._flattenBufferIn();
          sharp_default.pipeline(this.options, (err, data, info) => {
            if (err) {
              reject(is_default.nativeError(err, stack));
            } else {
              if (this.options.resolveWithObject) {
                resolve({ data, info });
              } else {
                resolve(data);
              }
            }
          });
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        sharp_default.pipeline(this.options, (err, data, info) => {
          if (err) {
            reject(is_default.nativeError(err, stack));
          } else {
            if (this.options.resolveWithObject) {
              resolve({ data, info });
            } else {
              resolve(data);
            }
          }
        });
      });
    }
  }
}
var formats, jp2Regex, errJp2Save = () => new Error("JP2 output requires libvips with support for OpenJPEG"), bitdepthFromColourCount = (colours) => 1 << 32 - Math.clz32(Math.ceil(Math.log2(colours)) - 1), output_default = (Sharp) => {
  Object.assign(Sharp.prototype, {
    toFile,
    toBuffer,
    toUint8Array,
    withDensity,
    keepExif,
    withExif,
    withExifMerge,
    keepIccProfile,
    withIccProfile,
    keepGainMap,
    withGainMap,
    keepXmp,
    withXmp,
    keepMetadata,
    withMetadata,
    toFormat,
    jpeg,
    jp2,
    png,
    webp,
    tiff,
    avif,
    heif,
    jxl,
    gif,
    raw,
    tile,
    timeout,
    _updateFormatOut,
    _setBooleanOption,
    _read,
    _pipeline
  });
};
var init_output = __esm(() => {
  init_is();
  init_sharp();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  formats = new Map([
    ["heic", "heif"],
    ["heif", "heif"],
    ["avif", "avif"],
    ["jpeg", "jpeg"],
    ["jpg", "jpeg"],
    ["jpe", "jpeg"],
    ["tile", "tile"],
    ["dz", "tile"],
    ["png", "png"],
    ["raw", "raw"],
    ["tiff", "tiff"],
    ["tif", "tiff"],
    ["webp", "webp"],
    ["gif", "gif"],
    ["jp2", "jp2"],
    ["jpx", "jp2"],
    ["j2k", "jp2"],
    ["j2c", "jp2"],
    ["jxl", "jxl"]
  ]);
  jp2Regex = /\.(jp[2x]|j2[kc])$/i;
});

// node_modules/sharp/dist/utility.mjs
import events from "node:events";
import { createRequire as createRequire3 } from "node:module";
import { availableParallelism } from "node:os";
function cache(options) {
  if (is_default.bool(options)) {
    if (options) {
      return sharp_default.cache(50, 20, 100);
    } else {
      return sharp_default.cache(0, 0, 0);
    }
  } else if (is_default.object(options)) {
    for (const property of ["memory", "files", "items"]) {
      const value = options[property];
      if (is_default.defined(value) && !(is_default.integer(value) && value >= 0)) {
        throw is_default.invalidParameterError(property, "a positive integer", value);
      }
    }
    return sharp_default.cache(options.memory, options.files, options.items);
  } else {
    return sharp_default.cache();
  }
}
function concurrency(concurrency) {
  return sharp_default.concurrency(is_default.integer(concurrency) ? concurrency : null);
}
function counters() {
  return sharp_default.counters();
}
function simd(simd) {
  return sharp_default.simd(is_default.bool(simd) ? simd : null);
}
function block(options) {
  if (is_default.object(options)) {
    if (Array.isArray(options.operation) && options.operation.every(is_default.string)) {
      sharp_default.block(options.operation, true);
    } else {
      throw is_default.invalidParameterError("operation", "Array<string>", options.operation);
    }
  } else {
    throw is_default.invalidParameterError("options", "object", options);
  }
}
function unblock(options) {
  if (is_default.object(options)) {
    if (Array.isArray(options.operation) && options.operation.every(is_default.string)) {
      sharp_default.block(options.operation, false);
    } else {
      throw is_default.invalidParameterError("operation", "Array<string>", options.operation);
    }
  } else {
    throw is_default.invalidParameterError("options", "object", options);
  }
}
var import_detect_libc3, require3, runtimePlatform2, libvipsVersion, format, interpolators, versions, queue, utility_default = (Sharp) => {
  Sharp.cache = cache;
  Sharp.concurrency = concurrency;
  Sharp.counters = counters;
  Sharp.simd = simd;
  Sharp.format = format;
  Sharp.interpolators = interpolators;
  Sharp.versions = versions;
  Sharp.queue = queue;
  Sharp.block = block;
  Sharp.unblock = unblock;
};
var init_utility = __esm(() => {
  init_is();
  init_libvips();
  init_sharp();
  init_package();
  import_detect_libc3 = __toESM(require_detect_libc(), 1);
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  require3 = createRequire3(import.meta.url);
  runtimePlatform2 = libvips_default.runtimePlatformArch();
  libvipsVersion = sharp_default.libvipsVersion();
  format = sharp_default.format();
  format.heif.output.alias = ["avif", "heic"];
  format.jpeg.output.alias = ["jpe", "jpg"];
  format.tiff.output.alias = ["tif"];
  format.jp2.output.alias = ["j2c", "j2k", "jp2", "jpx"];
  interpolators = {
    nearest: "nearest",
    bilinear: "bilinear",
    bicubic: "bicubic",
    locallyBoundedBicubic: "lbb",
    nohalo: "nohalo",
    vertexSplitQuadraticBasisSpline: "vsqbs"
  };
  versions = {
    vips: libvipsVersion.semver
  };
  if (!libvipsVersion.isGlobal) {
    if (!libvipsVersion.isWasm) {
      try {
        versions = require3(`@img/sharp-${runtimePlatform2}/versions`);
      } catch (_) {
        try {
          versions = require3(`@img/sharp-libvips-${runtimePlatform2}/versions`);
        } catch (_) {}
      }
    } else {
      try {
        versions = require3("@img/sharp-wasm32/versions");
      } catch (_) {}
    }
  }
  versions.sharp = package_default.version;
  if (versions.heif && format.heif) {
    format.heif.input.fileSuffix = [".avif"];
    format.heif.output.alias = ["avif"];
  }
  cache(true);
  if (!process.env.MALLOC_ARENA_MAX && import_detect_libc3.default.familySync() === import_detect_libc3.default.GLIBC && !sharp_default._isUsingJemalloc()) {
    sharp_default.concurrency(1);
  } else if (import_detect_libc3.default.familySync() === import_detect_libc3.default.MUSL && sharp_default.concurrency() === 1024) {
    sharp_default.concurrency(availableParallelism());
  }
  queue = new events.EventEmitter;
});

// node_modules/sharp/dist/index.mjs
var exports_dist = {};
__export(exports_dist, {
  default: () => dist_default
});
var dist_default;
var init_dist = __esm(() => {
  init_constructor();
  init_input();
  init_resize();
  init_composite();
  init_operation();
  init_colour();
  init_channel();
  init_output();
  init_utility();
  /*!
    Copyright 2013 Lovell Fuller and others.
    SPDX-License-Identifier: Apache-2.0
  */
  input_default(constructor_default);
  resize_default(constructor_default);
  composite_default(constructor_default);
  operation_default(constructor_default);
  colour_default(constructor_default);
  channel_default(constructor_default);
  output_default(constructor_default);
  utility_default(constructor_default);
  dist_default = constructor_default;
});

// browse/src/screenshot-size-guard.ts
import { writeFileSync as writeFileSync5, readFileSync as readFileSync6 } from "fs";
async function guardScreenshotBuffer(input) {
  const sharpModule = await Promise.resolve().then(() => (init_dist(), exports_dist));
  const sharp = sharpModule.default ?? sharpModule;
  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const longest = Math.max(width, height);
  if (longest <= MAX_DIMENSION_PX) {
    return {
      buffer: input,
      result: {
        resized: false,
        width,
        height,
        originalWidth: width,
        originalHeight: height
      }
    };
  }
  const scale = MAX_DIMENSION_PX / longest;
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const resized = await image.resize(newWidth, newHeight, { fit: "inside" }).png().toBuffer();
  process.stderr.write(`[screenshot-size-guard] image ${width}x${height} exceeded ${MAX_DIMENSION_PX}px max-dim; downscaled to ${newWidth}x${newHeight} to fit Anthropic vision API
`);
  return {
    buffer: resized,
    result: {
      resized: true,
      width: newWidth,
      height: newHeight,
      originalWidth: width,
      originalHeight: height
    }
  };
}
async function guardScreenshotPath(filePath) {
  const input = readFileSync6(filePath);
  const { buffer, result } = await guardScreenshotBuffer(input);
  if (result.resized) {
    writeFileSync5(filePath, buffer);
  }
  return result;
}
var MAX_DIMENSION_PX = 2000;
var init_screenshot_size_guard = () => {};

// browse/src/write-commands.ts
import * as fs11 from "fs";
import * as path10 from "path";
async function handleWriteCommand(command, args, session, bm) {
  const page = session.getPage();
  const target = session.getActiveFrameOrPage();
  const inFrame = session.getFrame() !== null;
  switch (command) {
    case "goto": {
      if (inFrame)
        throw new Error("Cannot use goto inside a frame. Run 'frame main' first.");
      const url = args[0];
      if (!url)
        throw new Error("Usage: browse goto <url>");
      session.clearLoadedHtml();
      const normalizedUrl = await validateNavigationUrl(url);
      const response = await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      const status = response?.status() || "unknown";
      return `Navigated to ${normalizedUrl} (${status})`;
    }
    case "back": {
      if (inFrame)
        throw new Error("Cannot use back inside a frame. Run 'frame main' first.");
      session.clearLoadedHtml();
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
      return `Back → ${page.url()}`;
    }
    case "forward": {
      if (inFrame)
        throw new Error("Cannot use forward inside a frame. Run 'frame main' first.");
      session.clearLoadedHtml();
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 });
      return `Forward → ${page.url()}`;
    }
    case "reload": {
      if (inFrame)
        throw new Error("Cannot use reload inside a frame. Run 'frame main' first.");
      session.clearLoadedHtml();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
      return `Reloaded ${page.url()}`;
    }
    case "load-html": {
      if (inFrame)
        throw new Error("Cannot use load-html inside a frame. Run 'frame main' first.");
      let fromFilePayload = null;
      let filePath;
      let waitUntil = "domcontentloaded";
      for (let i = 0;i < args.length; i++) {
        if (args[i] === "--from-file") {
          const payloadPath = args[++i];
          if (!payloadPath)
            throw new Error("load-html: --from-file requires a path");
          try {
            validateReadPath(path10.resolve(payloadPath));
          } catch {
            throw new Error(`load-html: --from-file ${payloadPath} must be under ${SAFE_DIRECTORIES.join(" or ")} (security policy). Copy the payload into the project tree or /tmp first.`);
          }
          const raw = fs11.readFileSync(payloadPath, "utf8");
          let json;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            throw new Error(`load-html: --from-file JSON parse failed: ${e.message}`);
          }
          if (typeof json.html !== "string") {
            throw new Error('load-html: --from-file JSON must have a "html" string field');
          }
          if (json.waitUntil && json.waitUntil !== "load" && json.waitUntil !== "domcontentloaded" && json.waitUntil !== "networkidle") {
            throw new Error(`load-html: --from-file waitUntil '${json.waitUntil}' invalid`);
          }
          fromFilePayload = { html: json.html, waitUntil: json.waitUntil };
        } else if (args[i] === "--wait-until") {
          const val = args[++i];
          if (val !== "load" && val !== "domcontentloaded" && val !== "networkidle") {
            throw new Error(`Invalid --wait-until '${val}'. Must be one of: load, domcontentloaded, networkidle.`);
          }
          waitUntil = val;
        } else if (args[i].startsWith("--")) {
          throw new Error(`Unknown flag: ${args[i]}`);
        } else if (!filePath) {
          filePath = args[i];
        }
      }
      if (fromFilePayload) {
        const MAX_BYTES = parseInt(process.env.GSTACK_BROWSE_MAX_HTML_BYTES || "", 10) || 50 * 1024 * 1024;
        if (Buffer.byteLength(fromFilePayload.html, "utf8") > MAX_BYTES) {
          throw new Error(`load-html: --from-file html too large (> ${MAX_BYTES} bytes). ` + "Raise with GSTACK_BROWSE_MAX_HTML_BYTES=<N>.");
        }
        const peek = fromFilePayload.html.trimStart();
        if (!/^<[a-zA-Z!?]/.test(peek)) {
          throw new Error("load-html: --from-file html does not start with a valid markup opener");
        }
        const finalWaitUntil = fromFilePayload.waitUntil ?? waitUntil;
        await session.setTabContent(fromFilePayload.html, { waitUntil: finalWaitUntil });
        return `Loaded HTML: (inline from --from-file, ${fromFilePayload.html.length} chars)`;
      }
      if (!filePath)
        throw new Error("Usage: browse load-html <file> [--wait-until load|domcontentloaded|networkidle] [--tab-id <N>]  |  load-html --from-file <payload.json> [--tab-id <N>]");
      const ALLOWED_EXT = [".html", ".htm", ".xhtml"];
      const ext = path10.extname(filePath).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        throw new Error(`load-html: file does not appear to be HTML. Expected .html/.htm/.xhtml, got ${ext || "(no extension)"}. Rename the file if it's really HTML.`);
      }
      const absolutePath = path10.resolve(filePath);
      try {
        validateReadPath(absolutePath);
      } catch (e) {
        throw new Error(`load-html: ${absolutePath} must be under ${SAFE_DIRECTORIES.join(" or ")} (security policy). Copy the file into the project tree or /tmp first.`);
      }
      let stat;
      try {
        stat = await fs11.promises.stat(absolutePath);
      } catch (e) {
        if (e.code === "ENOENT") {
          throw new Error(`load-html: file not found at ${absolutePath}. Check spelling or copy the file under ${process.cwd()} or ${TEMP_DIR}.`);
        }
        throw e;
      }
      if (stat.isDirectory()) {
        throw new Error(`load-html: ${absolutePath} is a directory, not a file. Pass a .html file.`);
      }
      if (!stat.isFile()) {
        throw new Error(`load-html: ${absolutePath} is not a regular file.`);
      }
      const MAX_BYTES = parseInt(process.env.GSTACK_BROWSE_MAX_HTML_BYTES || "", 10) || 50 * 1024 * 1024;
      if (stat.size > MAX_BYTES) {
        throw new Error(`load-html: file too large (${stat.size} bytes > ${MAX_BYTES} cap). Raise with GSTACK_BROWSE_MAX_HTML_BYTES=<N> or split the HTML.`);
      }
      const buf = await fs11.promises.readFile(absolutePath);
      let peek = buf.slice(0, 200);
      if (peek[0] === 239 && peek[1] === 187 && peek[2] === 191) {
        peek = peek.slice(3);
      }
      const peekStr = peek.toString("utf8").trimStart();
      const looksLikeMarkup = /^<[a-zA-Z!?]/.test(peekStr);
      if (!looksLikeMarkup) {
        const hexDump = Array.from(buf.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        throw new Error(`load-html: ${absolutePath} has ${ext} extension but content does not look like HTML. First bytes: ${hexDump}`);
      }
      const html = buf.toString("utf8");
      await session.setTabContent(html, { waitUntil });
      return `Loaded HTML: ${absolutePath} (${stat.size} bytes)`;
    }
    case "click": {
      const selector = args[0];
      if (!selector)
        throw new Error("Usage: browse click <selector>");
      const role = session.getRefRole(selector);
      if (role === "option") {
        const resolved = await session.resolveRef(selector);
        if ("locator" in resolved) {
          const optionInfo = await resolved.locator.evaluate((el) => {
            if (el.tagName !== "OPTION")
              return null;
            const option = el;
            const select = option.closest("select");
            if (!select)
              return null;
            return { value: option.value, text: option.text };
          });
          if (optionInfo) {
            await resolved.locator.locator("xpath=ancestor::select").selectOption(optionInfo.value, { timeout: 5000 });
            return `Selected "${optionInfo.text}" (auto-routed from click on <option>) → now at ${page.url()}`;
          }
        }
      }
      const resolved = await session.resolveRef(selector);
      try {
        if ("locator" in resolved) {
          await resolved.locator.click({ timeout: 5000 });
        } else {
          await target.locator(resolved.selector).click({ timeout: 5000 });
        }
      } catch (err) {
        const isOption = "locator" in resolved ? await resolved.locator.evaluate((el) => el.tagName === "OPTION").catch(() => false) : await target.locator(resolved.selector).evaluate((el) => el.tagName === "OPTION").catch(() => false);
        if (isOption) {
          throw new Error(`Cannot click <option> elements. Use 'browse select <parent-select> <value>' instead of 'click' for dropdown options.`);
        }
        throw err;
      }
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      return `Clicked ${selector} → now at ${page.url()}`;
    }
    case "fill": {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(" ");
      if (!selector || !value)
        throw new Error("Usage: browse fill <selector> <value>");
      const resolved = await session.resolveRef(selector);
      const locator = "locator" in resolved ? resolved.locator : target.locator(resolved.selector);
      await locator.fill(value, { timeout: 5000 });
      await locator.dispatchEvent("change");
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      return `Filled ${selector}`;
    }
    case "select": {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(" ");
      if (!selector || !value)
        throw new Error("Usage: browse select <selector> <value>");
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        await resolved.locator.selectOption(value, { timeout: 5000 });
      } else {
        await target.locator(resolved.selector).selectOption(value, { timeout: 5000 });
      }
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      return `Selected "${value}" in ${selector}`;
    }
    case "hover": {
      const selector = args[0];
      if (!selector)
        throw new Error("Usage: browse hover <selector>");
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        await resolved.locator.hover({ timeout: 5000 });
      } else {
        await target.locator(resolved.selector).hover({ timeout: 5000 });
      }
      return `Hovered ${selector}`;
    }
    case "type": {
      const text = args.join(" ");
      if (!text)
        throw new Error("Usage: browse type <text>");
      await page.keyboard.type(text);
      return `Typed ${text.length} characters`;
    }
    case "press": {
      const key = args[0];
      if (!key)
        throw new Error("Usage: browse press <key> (e.g., Enter, Tab, Escape)");
      await page.keyboard.press(key);
      return `Pressed ${key}`;
    }
    case "scroll": {
      const timesIdx = args.indexOf("--times");
      const times = timesIdx >= 0 ? parseInt(args[timesIdx + 1], 10) || 1 : 0;
      const waitIdx = args.indexOf("--wait");
      const waitMs = waitIdx >= 0 ? parseInt(args[waitIdx + 1], 10) || 1000 : 1000;
      const selector = args.find((a) => !a.startsWith("--") && args.indexOf(a) !== timesIdx + 1 && args.indexOf(a) !== waitIdx + 1);
      if (times > 0) {
        for (let i = 0;i < times; i++) {
          if (selector) {
            const resolved = await bm.resolveRef(selector);
            if ("locator" in resolved) {
              await resolved.locator.scrollIntoViewIfNeeded({ timeout: 5000 });
            } else {
              await target.locator(resolved.selector).scrollIntoViewIfNeeded({ timeout: 5000 });
            }
          } else {
            await target.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          }
          if (i < times - 1)
            await new Promise((r) => setTimeout(r, waitMs));
        }
        return `Scrolled ${times} times${selector ? ` (${selector})` : ""} with ${waitMs}ms delay`;
      }
      if (selector) {
        const resolved = await session.resolveRef(selector);
        if ("locator" in resolved) {
          await resolved.locator.scrollIntoViewIfNeeded({ timeout: 5000 });
        } else {
          await target.locator(resolved.selector).scrollIntoViewIfNeeded({ timeout: 5000 });
        }
        return `Scrolled ${selector} into view`;
      }
      await target.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      return "Scrolled to bottom";
    }
    case "wait": {
      const selector = args[0];
      if (!selector)
        throw new Error("Usage: browse wait <selector|--networkidle|--load|--domcontentloaded>");
      if (selector === "--networkidle") {
        const MAX_WAIT_MS = 300000;
        const MIN_WAIT_MS = 1000;
        const timeout = Math.min(Math.max(args[1] ? parseInt(args[1], 10) || MIN_WAIT_MS : 15000, MIN_WAIT_MS), MAX_WAIT_MS);
        await page.waitForLoadState("networkidle", { timeout });
        return "Network idle";
      }
      if (selector === "--load") {
        await page.waitForLoadState("load");
        return "Page loaded";
      }
      if (selector === "--domcontentloaded") {
        await page.waitForLoadState("domcontentloaded");
        return "DOM content loaded";
      }
      const MAX_WAIT_MS = 300000;
      const MIN_WAIT_MS = 1000;
      const timeout = Math.min(Math.max(args[1] ? parseInt(args[1], 10) || MIN_WAIT_MS : 15000, MIN_WAIT_MS), MAX_WAIT_MS);
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        await resolved.locator.waitFor({ state: "visible", timeout });
      } else {
        await target.locator(resolved.selector).waitFor({ state: "visible", timeout });
      }
      return `Element ${selector} appeared`;
    }
    case "viewport": {
      let sizeArg;
      let scaleArg;
      for (let i = 0;i < args.length; i++) {
        if (args[i] === "--scale") {
          const val = args[++i];
          if (val === undefined || val === "") {
            throw new Error("viewport --scale: missing value. Usage: viewport [WxH] --scale <n>");
          }
          const parsed = Number(val);
          if (!Number.isFinite(parsed)) {
            throw new Error(`viewport --scale: value '${val}' is not a finite number.`);
          }
          scaleArg = parsed;
        } else if (args[i].startsWith("--")) {
          throw new Error(`Unknown viewport flag: ${args[i]}`);
        } else if (sizeArg === undefined) {
          sizeArg = args[i];
        } else {
          throw new Error(`Unexpected positional arg: ${args[i]}. Usage: viewport [WxH] [--scale <n>]`);
        }
      }
      if (sizeArg === undefined && scaleArg === undefined) {
        throw new Error("Usage: browse viewport [<WxH>] [--scale <n>]  (e.g. 375x812, or --scale 2 to keep current size)");
      }
      let w, h;
      if (sizeArg) {
        if (!sizeArg.includes("x"))
          throw new Error("Usage: browse viewport [<WxH>] [--scale <n>] (e.g., 375x812)");
        const [rawW, rawH] = sizeArg.split("x").map(Number);
        w = Math.min(Math.max(Math.round(rawW) || 1280, 1), 16384);
        h = Math.min(Math.max(Math.round(rawH) || 720, 1), 16384);
      } else {
        const current = bm.getCurrentViewport();
        w = current.width;
        h = current.height;
      }
      if (scaleArg !== undefined) {
        const err = await bm.setDeviceScaleFactor(scaleArg, w, h);
        if (err)
          return `Viewport partially set: ${err}`;
        return `Viewport set to ${w}x${h} @ ${scaleArg}x (context recreated; refs and load-html content replayed)`;
      }
      await bm.setViewport(w, h);
      return `Viewport set to ${w}x${h}`;
    }
    case "cookie": {
      const cookieStr = args[0];
      if (!cookieStr || !cookieStr.includes("="))
        throw new Error("Usage: browse cookie <name>=<value>");
      const eq = cookieStr.indexOf("=");
      const name = cookieStr.slice(0, eq);
      const value = cookieStr.slice(eq + 1);
      const url = new URL(page.url());
      await page.context().addCookies([{
        name,
        value,
        domain: url.hostname,
        path: "/"
      }]);
      return `Cookie set: ${name}=****`;
    }
    case "header": {
      const headerStr = args[0];
      if (!headerStr || !headerStr.includes(":"))
        throw new Error("Usage: browse header <name>:<value>");
      const sep = headerStr.indexOf(":");
      const name = headerStr.slice(0, sep).trim();
      const value = headerStr.slice(sep + 1).trim();
      await bm.setExtraHeader(name, value);
      const sensitiveHeaders = ["authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"];
      const redactedValue = sensitiveHeaders.includes(name.toLowerCase()) ? "****" : value;
      return `Header set: ${name}: ${redactedValue}`;
    }
    case "useragent": {
      const ua = args.join(" ");
      if (!ua)
        throw new Error("Usage: browse useragent <string>");
      bm.setUserAgent(ua);
      const error = await bm.recreateContext();
      if (error) {
        return `User agent set to "${ua}" but: ${error}`;
      }
      return `User agent set: ${ua}`;
    }
    case "upload": {
      const [selector, ...filePaths] = args;
      if (!selector || filePaths.length === 0)
        throw new Error("Usage: browse upload <selector> <file1> [file2...]");
      for (const fp of filePaths) {
        if (!fs11.existsSync(fp))
          throw new Error(`File not found: ${fp}`);
        if (path10.isAbsolute(fp)) {
          let resolvedFp;
          try {
            resolvedFp = fs11.realpathSync(path10.resolve(fp));
          } catch (err) {
            if (err?.code !== "ENOENT")
              throw err;
            resolvedFp = path10.resolve(fp);
          }
          if (!SAFE_DIRECTORIES.some((dir) => isPathWithin(resolvedFp, dir))) {
            throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
          }
        }
        if (path10.normalize(fp).includes("..")) {
          throw new Error("Path traversal sequences (..) are not allowed");
        }
      }
      const resolved = await session.resolveRef(selector);
      if ("locator" in resolved) {
        await resolved.locator.setInputFiles(filePaths);
      } else {
        await target.locator(resolved.selector).setInputFiles(filePaths);
      }
      const fileInfo = filePaths.map((fp) => {
        const stat = fs11.statSync(fp);
        return `${path10.basename(fp)} (${stat.size}B)`;
      }).join(", ");
      return `Uploaded: ${fileInfo}`;
    }
    case "dialog-accept": {
      const text = args.length > 0 ? args.join(" ") : null;
      bm.setDialogAutoAccept(true);
      bm.setDialogPromptText(text);
      return text ? `Dialogs will be accepted with text: "${text}"` : "Dialogs will be accepted";
    }
    case "dialog-dismiss": {
      bm.setDialogAutoAccept(false);
      bm.setDialogPromptText(null);
      return "Dialogs will be dismissed";
    }
    case "cookie-import": {
      const filePath = args[0];
      if (!filePath)
        throw new Error("Usage: browse cookie-import <json-file>");
      const resolved = path10.resolve(filePath);
      let resolvedReal = resolved;
      try {
        resolvedReal = fs11.realpathSync(resolved);
      } catch {
        try {
          resolvedReal = path10.join(fs11.realpathSync(path10.dirname(resolved)), path10.basename(resolved));
        } catch {}
      }
      if (!SAFE_DIRECTORIES.some((dir) => isPathWithin(resolvedReal, dir))) {
        throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(", ")}`);
      }
      if (!fs11.existsSync(filePath))
        throw new Error(`File not found: ${filePath}`);
      const raw = fs11.readFileSync(filePath, "utf-8");
      let cookies;
      try {
        cookies = JSON.parse(raw);
      } catch (err) {
        throw new Error(`Invalid JSON in ${filePath}: ${err?.message || err}`);
      }
      if (!Array.isArray(cookies))
        throw new Error("Cookie file must contain a JSON array");
      const pageUrl = new URL(page.url());
      const defaultDomain = pageUrl.hostname;
      for (const c of cookies) {
        if (!c.name || c.value === undefined)
          throw new Error('Each cookie must have "name" and "value" fields');
        if (!c.domain) {
          c.domain = defaultDomain;
        } else {
          const cookieDomain = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
          if (cookieDomain !== defaultDomain && !defaultDomain.endsWith("." + cookieDomain)) {
            throw new Error(`Cookie domain "${c.domain}" does not match current page domain "${defaultDomain}". Use the target site first.`);
          }
        }
        if (!c.path)
          c.path = "/";
      }
      await page.context().addCookies(cookies);
      const importedDomains = [...new Set(cookies.map((c) => c.domain).filter(Boolean))];
      if (importedDomains.length > 0)
        bm.trackCookieImportDomains(importedDomains);
      return `Loaded ${cookies.length} cookies from ${filePath}`;
    }
    case "cookie-import-browser": {
      const browserArg = args[0];
      const domainIdx = args.indexOf("--domain");
      const profileIdx = args.indexOf("--profile");
      const hasAll = args.includes("--all");
      const profile = profileIdx !== -1 && profileIdx + 1 < args.length ? args[profileIdx + 1] : "Default";
      if (domainIdx !== -1 && domainIdx + 1 < args.length) {
        const domain = args[domainIdx + 1];
        const pageHostname = new URL(page.url()).hostname;
        const normalizedDomain = domain.startsWith(".") ? domain.slice(1) : domain;
        if (normalizedDomain !== pageHostname && !pageHostname.endsWith("." + normalizedDomain)) {
          throw new Error(`--domain "${domain}" does not match current page domain "${pageHostname}". Navigate to the target site first.`);
        }
        const browser = browserArg || "comet";
        let result = await importCookies(browser, [domain], profile);
        if (result.cookies.length === 0 && result.failed > 0 && hasV20Cookies(browser, profile)) {
          result = await importCookiesViaCdp(browser, [domain], profile);
        }
        if (result.cookies.length > 0) {
          await page.context().addCookies(result.cookies);
          bm.trackCookieImportDomains([domain]);
        }
        const msg = [`Imported ${result.count} cookies for ${domain} from ${browser}`];
        if (result.failed > 0)
          msg.push(`(${result.failed} failed to decrypt)`);
        return msg.join(" ");
      }
      if (hasAll) {
        const browser = browserArg || "comet";
        await Promise.resolve().then(() => init_cookie_import_browser());
        const { domains } = listDomains(browser, profile);
        const allDomainNames = domains.map((d) => d.domain);
        if (allDomainNames.length === 0) {
          return `No cookies found in ${browser} (profile: ${profile})`;
        }
        const result = await importCookies(browser, allDomainNames, profile);
        if (result.cookies.length > 0) {
          await page.context().addCookies(result.cookies);
          bm.trackCookieImportDomains(allDomainNames);
        }
        const msg = [`Imported ${result.count} cookies across ${Object.keys(result.domainCounts).length} domains from ${browser}`];
        msg.push("(used --all: all browser cookies imported, consider --domain for tighter scoping)");
        if (result.failed > 0)
          msg.push(`(${result.failed} failed to decrypt)`);
        return msg.join(" ");
      }
      const port = bm.serverPort;
      if (!port)
        throw new Error("Server port not available");
      const browsers = findInstalledBrowsers();
      if (browsers.length === 0) {
        throw new Error(`No Chromium browsers found. Supported: ${listSupportedBrowserNames().join(", ")}`);
      }
      const code = generatePickerCode();
      const pickerUrl = `http://127.0.0.1:${port}/cookie-picker?code=${code}`;
      try {
        Bun.spawn(["open", pickerUrl], { stdout: "ignore", stderr: "ignore", windowsHide: true });
      } catch (err) {
        if (err?.code !== "ENOENT" && !err?.message?.includes("spawn"))
          throw err;
      }
      return `Cookie picker opened at http://127.0.0.1:${port}/cookie-picker
Detected browsers: ${browsers.map((b) => b.name).join(", ")}
Select domains to import, then close the picker when done.

Tip: For scripted imports, use --domain <domain> to scope cookies to a single domain.`;
    }
    case "style": {
      if (args[0] === "--undo") {
        const idx = args[1] ? parseInt(args[1], 10) : undefined;
        await undoModification(page, idx);
        return idx !== undefined ? `Reverted modification #${idx}` : "Reverted last modification";
      }
      const [selector, property, ...valueParts] = args;
      const value = valueParts.join(" ");
      if (!selector || !property || !value) {
        throw new Error("Usage: browse style <sel> <prop> <value> | style --undo [N]");
      }
      if (!/^[a-zA-Z-]+$/.test(property)) {
        throw new Error(`Invalid CSS property name: ${property}. Only letters and hyphens allowed.`);
      }
      const DANGEROUS_CSS = /url\s*\(|expression\s*\(|@import|javascript:|data:/i;
      if (DANGEROUS_CSS.test(value)) {
        throw new Error("CSS value rejected: contains potentially dangerous pattern.");
      }
      const mod = await modifyStyle(page, selector, property, value);
      return `Style modified: ${selector} { ${property}: ${mod.oldValue || "(none)"} → ${value} } (${mod.method})`;
    }
    case "cleanup": {
      let doAds = false, doCookies = false, doSticky = false, doSocial = false;
      let doOverlays = false, doClutter = false;
      let doAll = false;
      if (args.length === 0) {
        doAll = true;
      }
      for (const arg of args) {
        switch (arg) {
          case "--ads":
            doAds = true;
            break;
          case "--cookies":
            doCookies = true;
            break;
          case "--sticky":
            doSticky = true;
            break;
          case "--social":
            doSocial = true;
            break;
          case "--overlays":
            doOverlays = true;
            break;
          case "--clutter":
            doClutter = true;
            break;
          case "--all":
            doAll = true;
            break;
          default:
            throw new Error(`Unknown cleanup flag: ${arg}. Use: --ads, --cookies, --sticky, --social, --overlays, --clutter, --all`);
        }
      }
      if (doAll) {
        doAds = doCookies = doSticky = doSocial = doOverlays = doClutter = true;
      }
      const removed = [];
      const selectors = [];
      if (doAds)
        selectors.push(...CLEANUP_SELECTORS.ads);
      if (doCookies)
        selectors.push(...CLEANUP_SELECTORS.cookies);
      if (doSocial)
        selectors.push(...CLEANUP_SELECTORS.social);
      if (doOverlays)
        selectors.push(...CLEANUP_SELECTORS.overlays);
      if (doClutter)
        selectors.push(...CLEANUP_SELECTORS.clutter);
      if (selectors.length > 0) {
        const count = await page.evaluate((sels) => {
          let removed = 0;
          for (const sel of sels) {
            try {
              const els = document.querySelectorAll(sel);
              els.forEach((el) => {
                el.style.setProperty("display", "none", "important");
                removed++;
              });
            } catch (err) {
              if (!(err instanceof DOMException))
                throw err;
            }
          }
          return removed;
        }, selectors);
        if (count > 0) {
          if (doAds)
            removed.push("ads");
          if (doCookies)
            removed.push("cookie banners");
          if (doSocial)
            removed.push("social widgets");
          if (doOverlays)
            removed.push("overlays/popups");
          if (doClutter)
            removed.push("clutter");
        }
      }
      if (doSticky) {
        const stickyCount = await page.evaluate(() => {
          let removed = 0;
          const stickyEls = [];
          const allElements = document.querySelectorAll("*");
          const viewportWidth = window.innerWidth;
          for (const el of allElements) {
            const style = getComputedStyle(el);
            if (style.position === "fixed" || style.position === "sticky") {
              const rect = el.getBoundingClientRect();
              stickyEls.push({ el, top: rect.top, width: rect.width, height: rect.height });
            }
          }
          stickyEls.sort((a, b) => a.top - b.top);
          let preservedTopNav = false;
          for (const { el, top, width, height } of stickyEls) {
            const tag = el.tagName.toLowerCase();
            if (tag === "nav" || tag === "header")
              continue;
            if (el.getAttribute("role") === "navigation")
              continue;
            if (el.id === "gstack-ctrl")
              continue;
            if (!preservedTopNav && top <= 50 && width > viewportWidth * 0.8 && height < 120) {
              preservedTopNav = true;
              continue;
            }
            el.style.setProperty("display", "none", "important");
            removed++;
          }
          return removed;
        });
        if (stickyCount > 0)
          removed.push(`${stickyCount} sticky/fixed elements`);
      }
      const scrollFixed = await page.evaluate(() => {
        let fixed = 0;
        for (const el of [document.body, document.documentElement]) {
          if (!el)
            continue;
          const style = getComputedStyle(el);
          if (style.overflow === "hidden" || style.overflowY === "hidden") {
            el.style.setProperty("overflow", "auto", "important");
            el.style.setProperty("overflow-y", "auto", "important");
            fixed++;
          }
          if (style.position === "fixed" && (el === document.body || el === document.documentElement)) {
            el.style.setProperty("position", "static", "important");
            fixed++;
          }
        }
        const blurred = document.querySelectorAll('[style*="blur"], [style*="filter"]');
        blurred.forEach((el) => {
          const s = el.style;
          if (s.filter?.includes("blur") || s.webkitFilter?.includes("blur")) {
            s.setProperty("filter", "none", "important");
            s.setProperty("-webkit-filter", "none", "important");
            fixed++;
          }
        });
        const truncated = document.querySelectorAll('[class*="truncat"], [class*="preview"], [class*="teaser"]');
        truncated.forEach((el) => {
          const s = getComputedStyle(el);
          if (s.maxHeight && s.maxHeight !== "none" && parseInt(s.maxHeight) < 500) {
            el.style.setProperty("max-height", "none", "important");
            el.style.setProperty("overflow", "visible", "important");
            fixed++;
          }
        });
        return fixed;
      });
      if (scrollFixed > 0)
        removed.push("scroll unlocked");
      const adLabelCount = await page.evaluate(() => {
        let removed = 0;
        const adTextPatterns = [
          /^advertisement$/i,
          /^sponsored$/i,
          /^promoted$/i,
          /article continues/i,
          /continues below/i,
          /^ad$/i,
          /^paid content$/i,
          /^partner content$/i
        ];
        const candidates = document.querySelectorAll("div, span, p, figcaption, label");
        for (const el of candidates) {
          const text = (el.textContent || "").trim();
          if (text.length > 50)
            continue;
          if (adTextPatterns.some((p) => p.test(text))) {
            const parent = el.parentElement;
            if (parent && (parent.textContent || "").trim().length < 80) {
              parent.style.setProperty("display", "none", "important");
            } else {
              el.style.setProperty("display", "none", "important");
            }
            removed++;
          }
        }
        return removed;
      });
      if (adLabelCount > 0)
        removed.push(`${adLabelCount} ad labels`);
      const collapsedCount = await page.evaluate(() => {
        let collapsed = 0;
        const candidates = document.querySelectorAll('div[class*="ad"], div[id*="ad"], aside[class*="ad"], div[class*="sidebar"], div[class*="rail"], div[class*="right-col"], div[class*="widget"]');
        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          if (rect.height > 50 && rect.width > 0) {
            const text = (el.textContent || "").trim();
            const images = el.querySelectorAll('img:not([src*="logo"]):not([src*="icon"])');
            const links = el.querySelectorAll("a");
            if (text.length < 20 && images.length === 0 && links.length < 2) {
              el.style.setProperty("display", "none", "important");
              collapsed++;
            }
          }
        }
        return collapsed;
      });
      if (collapsedCount > 0)
        removed.push(`${collapsedCount} empty placeholders`);
      if (removed.length === 0)
        return "No clutter elements found to remove.";
      return `Cleaned up: ${removed.join(", ")}`;
    }
    case "prettyscreenshot": {
      let scrollTo;
      let doCleanup = false;
      const hideSelectors = [];
      let viewportWidth;
      let outputPath;
      for (let i = 0;i < args.length; i++) {
        if (args[i] === "--scroll-to" && i + 1 < args.length) {
          scrollTo = args[++i];
        } else if (args[i] === "--cleanup") {
          doCleanup = true;
        } else if (args[i] === "--hide" && i + 1 < args.length) {
          i++;
          while (i < args.length && !args[i].startsWith("--")) {
            hideSelectors.push(args[i]);
            i++;
          }
          i--;
        } else if (args[i] === "--width" && i + 1 < args.length) {
          viewportWidth = parseInt(args[++i], 10);
          if (isNaN(viewportWidth))
            throw new Error("--width must be a number");
        } else if (!args[i].startsWith("--")) {
          outputPath = args[i];
        } else {
          throw new Error(`Unknown prettyscreenshot flag: ${args[i]}`);
        }
      }
      if (!outputPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        outputPath = `${TEMP_DIR}/browse-pretty-${timestamp}.png`;
      }
      validateOutputPath(outputPath);
      const originalViewport = page.viewportSize();
      if (viewportWidth && originalViewport) {
        await page.setViewportSize({ width: viewportWidth, height: originalViewport.height });
      }
      if (doCleanup) {
        const allSelectors = [
          ...CLEANUP_SELECTORS.ads,
          ...CLEANUP_SELECTORS.cookies,
          ...CLEANUP_SELECTORS.social
        ];
        await page.evaluate((sels) => {
          for (const sel of sels) {
            try {
              document.querySelectorAll(sel).forEach((el) => {
                el.style.display = "none";
              });
            } catch (err) {
              if (!(err instanceof DOMException))
                throw err;
            }
          }
          for (const el of document.querySelectorAll("*")) {
            const style = getComputedStyle(el);
            if (style.position === "fixed" || style.position === "sticky") {
              const tag = el.tagName.toLowerCase();
              if (tag === "nav" || tag === "header")
                continue;
              if (el.getAttribute("role") === "navigation")
                continue;
              el.style.display = "none";
            }
          }
        }, allSelectors);
      }
      if (hideSelectors.length > 0) {
        await page.evaluate((sels) => {
          for (const sel of sels) {
            try {
              document.querySelectorAll(sel).forEach((el) => {
                el.style.display = "none";
              });
            } catch (err) {
              if (!(err instanceof DOMException))
                throw err;
            }
          }
        }, hideSelectors);
      }
      if (scrollTo) {
        const scrolled = await page.evaluate((target) => {
          let el = document.querySelector(target);
          if (el) {
            el.scrollIntoView({ behavior: "instant", block: "center" });
            return true;
          }
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent?.includes(target)) {
              const parent = node.parentElement;
              if (parent) {
                parent.scrollIntoView({ behavior: "instant", block: "center" });
                return true;
              }
            }
          }
          return false;
        }, scrollTo);
        if (!scrolled) {
          if (viewportWidth && originalViewport) {
            await page.setViewportSize(originalViewport);
          }
          throw new Error(`Could not find element or text to scroll to: ${scrollTo}`);
        }
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: outputPath, fullPage: !scrollTo });
      if (!scrollTo)
        await guardScreenshotPath(outputPath);
      if (viewportWidth && originalViewport) {
        await page.setViewportSize(originalViewport);
      }
      const parts = ["Screenshot saved"];
      if (doCleanup)
        parts.push("(cleaned)");
      if (scrollTo)
        parts.push(`(scrolled to: ${scrollTo})`);
      parts.push(`: ${outputPath}`);
      return parts.join(" ");
    }
    case "download": {
      if (args.length === 0)
        throw new Error("Usage: download <url|@ref> [path] [--base64] [--navigate]");
      const isBase64 = args.includes("--base64");
      const useNavigate = args.includes("--navigate");
      const filteredArgs = args.filter((a) => a !== "--base64" && a !== "--navigate");
      let url = filteredArgs[0];
      const outputPath = filteredArgs[1];
      if (url.startsWith("@")) {
        const resolved = await bm.resolveRef(url);
        if (!("locator" in resolved))
          throw new Error(`Expected @ref, got CSS selector: ${url}`);
        const locator = resolved.locator;
        const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
        if (tagName === "img") {
          url = await locator.evaluate((el) => {
            const img = el;
            return img.currentSrc || img.src || img.getAttribute("data-src") || "";
          });
        } else if (tagName === "video") {
          url = await locator.evaluate((el) => el.currentSrc || el.src || "");
        } else if (tagName === "audio") {
          url = await locator.evaluate((el) => el.currentSrc || el.src || "");
        } else {
          url = await locator.evaluate((el) => el.getAttribute("src") || "");
        }
        if (!url)
          throw new Error(`Could not extract URL from ${filteredArgs[0]} (${tagName})`);
      }
      if (url.includes(".m3u8") || url.includes(".mpd")) {
        throw new Error("This is an HLS/DASH stream. Use yt-dlp or ffmpeg for adaptive stream downloads.");
      }
      const page = bm.getPage();
      let contentType = "application/octet-stream";
      let buffer;
      if (url.startsWith("blob:")) {
        const dataUrl = await page.evaluate(async (blobUrl) => {
          try {
            const resp = await fetch(blobUrl);
            const blob = await resp.blob();
            if (blob.size > 104857600)
              return "ERROR:TOO_LARGE";
            return new Promise((resolve, reject) => {
              const reader = new FileReader;
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => reject("Failed to read blob");
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            return `ERROR:EXPIRED:${err?.message || "unknown"}`;
          }
        }, url);
        if (dataUrl === "ERROR:TOO_LARGE")
          throw new Error("Blob too large (>100MB). Use a different approach.");
        if (dataUrl.startsWith("ERROR:EXPIRED"))
          throw new Error(`Blob URL expired or inaccessible: ${dataUrl.slice("ERROR:EXPIRED:".length)}`);
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match)
          throw new Error("Failed to decode blob data");
        contentType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else if (useNavigate) {
        await validateNavigationUrl(url);
        const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
        page.goto(url, { waitUntil: "commit", timeout: 30000 }).catch(() => {});
        const download = await downloadPromise;
        const failure = await download.failure();
        if (failure) {
          throw new Error(`Download failed: ${failure}`);
        }
        const tempPath = path10.join(TEMP_DIR, `browse-nav-download-${Date.now()}`);
        await download.saveAs(tempPath);
        buffer = fs11.readFileSync(tempPath);
        const suggested = download.suggestedFilename();
        if (suggested) {
          const extMatch = suggested.match(/\.([a-z0-9]+)$/i);
          if (extMatch) {
            const extLower = extMatch[1].toLowerCase();
            const mimeMap = {
              epub: "application/epub+zip",
              pdf: "application/pdf",
              zip: "application/zip",
              gz: "application/gzip",
              mp3: "audio/mpeg",
              mp4: "video/mp4",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              txt: "text/plain",
              html: "text/html",
              json: "application/json"
            };
            contentType = mimeMap[extLower] || "application/octet-stream";
          }
        }
        if (outputPath || isBase64) {
          try {
            fs11.unlinkSync(tempPath);
          } catch {}
        } else {
          const ext = contentType.split(";")[0].includes("/") ? mimeToExt(contentType.split(";")[0].trim()) : ".bin";
          const finalPath = path10.join(TEMP_DIR, `browse-download-${Date.now()}${ext}`);
          fs11.renameSync(tempPath, finalPath);
          const sizeKB = Math.round(buffer.length / 1024);
          return `Downloaded: ${finalPath} (${sizeKB}KB, ${contentType.split(";")[0].trim()})${suggested ? ` [${suggested}]` : ""}`;
        }
        if (buffer.length > 209715200) {
          throw new Error("File too large (>200MB).");
        }
      } else {
        await validateNavigationUrl(url);
        const response = await page.request.fetch(url, { timeout: 30000 });
        const status = response.status();
        if (status >= 400) {
          throw new Error(`Download failed: HTTP ${status} ${response.statusText()}`);
        }
        contentType = response.headers()["content-type"] || "application/octet-stream";
        buffer = Buffer.from(await response.body());
        if (buffer.length > 209715200) {
          throw new Error("File too large (>200MB).");
        }
      }
      if (isBase64) {
        if (buffer.length > 10485760) {
          throw new Error("File too large for --base64 (>10MB). Use disk download + GET /file instead.");
        }
        const mimeType = contentType.split(";")[0].trim();
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      }
      const ext = contentType.split(";")[0].includes("/") ? mimeToExt(contentType.split(";")[0].trim()) : ".bin";
      const destPath = outputPath || path10.join(TEMP_DIR, `browse-download-${Date.now()}${ext}`);
      validateOutputPath(destPath);
      fs11.writeFileSync(destPath, buffer);
      const sizeKB = Math.round(buffer.length / 1024);
      return `Downloaded: ${destPath} (${sizeKB}KB, ${contentType.split(";")[0].trim()})`;
    }
    case "scrape": {
      if (args.length === 0)
        throw new Error("Usage: scrape <images|videos|media> [--selector sel] [--dir path] [--limit N]");
      const mediaType = args[0];
      if (!["images", "videos", "media"].includes(mediaType)) {
        throw new Error(`Invalid type: ${mediaType}. Use: images, videos, or media`);
      }
      const selectorIdx = args.indexOf("--selector");
      const selector = selectorIdx >= 0 ? args[selectorIdx + 1] : undefined;
      const dirIdx = args.indexOf("--dir");
      const dir = dirIdx >= 0 ? args[dirIdx + 1] : path10.join(TEMP_DIR, `browse-scrape-${Date.now()}`);
      const limitIdx = args.indexOf("--limit");
      const limit = Math.min(limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 50 : 50, 200);
      validateOutputPath(dir);
      fs11.mkdirSync(dir, { recursive: true });
      await Promise.resolve();
      const target = bm.getActiveFrameOrPage();
      const filter = mediaType === "images" ? "images" : mediaType === "videos" ? "videos" : undefined;
      const mediaResult = await extractMedia(target, { selector, filter });
      const urls = [];
      const seen = new Set;
      for (const img of mediaResult.images) {
        const url = img.currentSrc || img.src || img.dataSrc;
        if (url && !seen.has(url) && !url.startsWith("data:")) {
          seen.add(url);
          urls.push({ url, type: "image" });
        }
      }
      for (const vid of mediaResult.videos) {
        const url = vid.currentSrc || vid.src;
        if (url && !seen.has(url) && !url.startsWith("blob:") && !vid.isHLS && !vid.isDASH) {
          seen.add(url);
          urls.push({ url, type: "video" });
        }
      }
      for (const bg of mediaResult.backgroundImages) {
        if (bg.url && !seen.has(bg.url)) {
          seen.add(bg.url);
          urls.push({ url: bg.url, type: "image" });
        }
      }
      const toDownload = urls.slice(0, limit);
      const page = bm.getPage();
      const manifest = {
        url: page.url(),
        scraped_at: new Date().toISOString(),
        files: [],
        total_size: 0,
        succeeded: 0,
        failed: 0
      };
      const lines = [];
      for (let i = 0;i < toDownload.length; i++) {
        const { url, type } = toDownload[i];
        try {
          await validateNavigationUrl(url);
          const response = await page.request.fetch(url, { timeout: 30000 });
          if (response.status() >= 400)
            throw new Error(`HTTP ${response.status()}`);
          const ct = response.headers()["content-type"] || "application/octet-stream";
          const ext = mimeToExt(ct.split(";")[0].trim());
          const filename = `${type}-${String(i + 1).padStart(3, "0")}${ext}`;
          const filePath = path10.join(dir, filename);
          const body = Buffer.from(await response.body());
          try {
            fs11.writeFileSync(filePath, body);
          } catch (writeErr) {
            throw new Error(`Disk write failed: ${writeErr.message}`);
          }
          manifest.files.push({ path: filename, src: url, size: body.length, type: ct.split(";")[0].trim() });
          manifest.total_size += body.length;
          manifest.succeeded++;
          lines.push(`  [${i + 1}/${toDownload.length}] ${filename} (${Math.round(body.length / 1024)}KB)`);
        } catch (err) {
          manifest.files.push({ path: null, src: url, size: 0, type: "", error: err.message });
          manifest.failed++;
          lines.push(`  [${i + 1}/${toDownload.length}] FAILED: ${err.message}`);
        }
        if (i < toDownload.length - 1)
          await new Promise((r) => setTimeout(r, 100));
      }
      fs11.writeFileSync(path10.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
      return `Scraped ${toDownload.length} items to ${dir}/
${lines.join(`
`)}

Summary: ${manifest.succeeded} succeeded, ${manifest.failed} failed, ${Math.round(manifest.total_size / 1024)}KB total`;
    }
    case "archive": {
      const page = bm.getPage();
      const outputPath = args[0] || path10.join(TEMP_DIR, `browse-archive-${Date.now()}.mhtml`);
      validateOutputPath(outputPath);
      try {
        const data = await withCdpSession(page, async (cdp) => {
          const result = await cdp.send("Page.captureSnapshot", { format: "mhtml" });
          return result.data;
        });
        fs11.writeFileSync(outputPath, data);
        return `Archive saved: ${outputPath} (${Math.round(data.length / 1024)}KB, MHTML)`;
      } catch (err) {
        throw new Error(`MHTML archive requires Chromium CDP. Use 'text' or 'html' for raw page content. (${err.message})`);
      }
    }
    default:
      throw new Error(`Unknown write command: ${command}`);
  }
}
function mimeToExt(mime) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/html": ".html",
    "text/plain": ".txt"
  };
  return map[mime] || ".bin";
}
var CLEANUP_SELECTORS;
var init_write_commands = __esm(() => {
  init_cookie_import_browser();
  init_cookie_picker_routes();
  init_url_validation();
  init_path_security();
  init_screenshot_size_guard();
  init_platform();
  init_path_security();
  init_cdp_inspector();
  init_cdp_bridge();
  CLEANUP_SELECTORS = {
    ads: [
      "ins.adsbygoogle",
      '[id^="google_ads"]',
      '[id^="div-gpt-ad"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="googlesyndication"]',
      "[data-google-query-id]",
      ".google-auto-placed",
      '[class*="ad-banner"]',
      '[class*="ad-wrapper"]',
      '[class*="ad-container"]',
      '[class*="ad-slot"]',
      '[class*="ad-unit"]',
      '[class*="ad-zone"]',
      '[class*="ad-placement"]',
      '[class*="ad-holder"]',
      '[class*="ad-block"]',
      '[class*="adbox"]',
      '[class*="adunit"]',
      '[class*="adwrap"]',
      '[id*="ad-banner"]',
      '[id*="ad-wrapper"]',
      '[id*="ad-container"]',
      '[id*="ad-slot"]',
      '[id*="ad_banner"]',
      '[id*="ad_container"]',
      "[data-ad]",
      "[data-ad-slot]",
      "[data-ad-unit]",
      "[data-adunit]",
      '[class*="sponsored"]',
      '[class*="Sponsored"]',
      ".ad",
      ".ads",
      ".advert",
      ".advertisement",
      "#ad",
      "#ads",
      "#advert",
      "#advertisement",
      'iframe[src*="amazon-adsystem"]',
      'iframe[src*="outbrain"]',
      'iframe[src*="taboola"]',
      'iframe[src*="criteo"]',
      'iframe[src*="adsafeprotected"]',
      'iframe[src*="moatads"]',
      '[class*="promoted"]',
      '[class*="Promoted"]',
      '[data-testid*="promo"]',
      '[class*="native-ad"]',
      'aside[class*="ad"]',
      'section[class*="ad-"]'
    ],
    cookies: [
      '[class*="cookie-consent"]',
      '[class*="cookie-banner"]',
      '[class*="cookie-notice"]',
      '[id*="cookie-consent"]',
      '[id*="cookie-banner"]',
      '[id*="cookie-notice"]',
      '[class*="consent-banner"]',
      '[class*="consent-modal"]',
      '[class*="consent-wall"]',
      '[class*="gdpr"]',
      '[id*="gdpr"]',
      '[class*="GDPR"]',
      '[class*="CookieConsent"]',
      '[id*="CookieConsent"]',
      "#onetrust-consent-sdk",
      ".onetrust-pc-dark-filter",
      "#onetrust-banner-sdk",
      "#CybotCookiebotDialog",
      "#CybotCookiebotDialogBodyUnderlay",
      "#truste-consent-track",
      ".truste_overlay",
      ".truste_box_overlay",
      ".qc-cmp2-container",
      "#qc-cmp2-main",
      '[class*="cc-banner"]',
      '[class*="cc-window"]',
      '[class*="cc-overlay"]',
      '[class*="privacy-banner"]',
      '[class*="privacy-notice"]',
      '[id*="privacy-banner"]',
      '[id*="privacy-notice"]',
      '[class*="accept-cookies"]',
      '[id*="accept-cookies"]'
    ],
    overlays: [
      '[class*="paywall"]',
      '[class*="Paywall"]',
      '[id*="paywall"]',
      '[class*="subscribe-wall"]',
      '[class*="subscription-wall"]',
      '[class*="meter-wall"]',
      '[class*="regwall"]',
      '[class*="reg-wall"]',
      '[class*="newsletter-popup"]',
      '[class*="newsletter-modal"]',
      '[class*="signup-modal"]',
      '[class*="signup-popup"]',
      '[class*="email-capture"]',
      '[class*="lead-capture"]',
      '[class*="popup-modal"]',
      '[class*="modal-overlay"]',
      '[class*="interstitial"]',
      '[id*="interstitial"]',
      '[class*="push-notification"]',
      '[class*="notification-prompt"]',
      '[class*="web-push"]',
      '[class*="survey-"]',
      '[class*="feedback-modal"]',
      '[id*="survey-"]',
      '[class*="nps-"]',
      '[class*="app-banner"]',
      '[class*="smart-banner"]',
      '[class*="app-download"]',
      '[id*="branch-banner"]',
      ".smartbanner",
      '[class*="promo-banner"]',
      '[class*="cross-promo"]',
      '[class*="partner-promo"]',
      '[class*="preferred-source"]',
      '[class*="google-promo"]'
    ],
    clutter: [
      '[class*="audio-player"]',
      '[class*="podcast-player"]',
      '[class*="listen-widget"]',
      '[class*="everlit"]',
      '[class*="Everlit"]',
      "audio",
      '[class*="puzzle"]',
      '[class*="daily-game"]',
      '[class*="games-widget"]',
      '[class*="crossword-promo"]',
      '[class*="mini-game"]',
      'aside [class*="most-popular"]',
      'aside [class*="trending"]',
      'aside [class*="most-read"]',
      'aside [class*="recommended"]',
      '[class*="related-articles"]',
      '[class*="more-stories"]',
      '[class*="recirculation"]',
      '[class*="taboola"]',
      '[class*="outbrain"]',
      '[class*="nativo"]',
      "[data-tb-region]"
    ],
    sticky: [],
    social: [
      '[class*="social-share"]',
      '[class*="share-buttons"]',
      '[class*="share-bar"]',
      '[class*="social-widget"]',
      '[class*="social-icons"]',
      '[class*="share-tools"]',
      'iframe[src*="facebook.com/plugins"]',
      'iframe[src*="platform.twitter"]',
      '[class*="fb-like"]',
      '[class*="tweet-button"]',
      '[class*="addthis"]',
      '[class*="sharethis"]',
      '[class*="follow-us"]',
      '[class*="social-follow"]'
    ]
  };
});

// browse/src/content-security.ts
import { randomBytes } from "crypto";
function ensureMarker() {
  if (!sessionMarker) {
    sessionMarker = randomBytes(3).toString("base64").slice(0, 4);
  }
  return sessionMarker;
}
function datamarkContent(content) {
  const marker = ensureMarker();
  const zwsp = "​";
  const taggedMarker = marker.split("").map((c) => zwsp + c).join("");
  let count = 0;
  return content.replace(/(\. )/g, (match) => {
    count++;
    if (count % 3 === 0) {
      return match + taggedMarker;
    }
    return match;
  });
}
async function markHiddenElements(page) {
  return page.evaluate((ariaPatterns) => {
    const found = [];
    const elements = document.querySelectorAll("body *");
    for (const el of elements) {
      if (el instanceof HTMLElement) {
        const style = window.getComputedStyle(el);
        const text = el.textContent?.trim() || "";
        if (!text)
          continue;
        let isHidden = false;
        let reason = "";
        if (parseFloat(style.opacity) < 0.1) {
          isHidden = true;
          reason = "opacity < 0.1";
        } else if (parseFloat(style.fontSize) < 1) {
          isHidden = true;
          reason = "font-size < 1px";
        } else if (style.position === "absolute" || style.position === "fixed") {
          const rect = el.getBoundingClientRect();
          if (rect.right < -100 || rect.bottom < -100 || rect.left > window.innerWidth + 100 || rect.top > window.innerHeight + 100) {
            isHidden = true;
            reason = "off-screen";
          }
        } else if (style.color === style.backgroundColor && text.length > 10) {
          isHidden = true;
          reason = "same fg/bg color";
        } else if (style.clipPath === "inset(100%)" || style.clip === "rect(0px, 0px, 0px, 0px)") {
          isHidden = true;
          reason = "clip hiding";
        } else if (style.visibility === "hidden") {
          isHidden = true;
          reason = "visibility hidden";
        }
        if (isHidden) {
          el.setAttribute("data-gstack-hidden", "true");
          found.push(`[${el.tagName.toLowerCase()}] ${reason}: "${text.slice(0, 60)}..."`);
        }
        const ariaLabel = el.getAttribute("aria-label") || "";
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        let labelText = ariaLabel;
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          if (labelEl)
            labelText += " " + (labelEl.textContent || "");
        }
        if (labelText) {
          for (const pattern of ariaPatterns) {
            if (new RegExp(pattern, "i").test(labelText)) {
              el.setAttribute("data-gstack-hidden", "true");
              found.push(`[${el.tagName.toLowerCase()}] ARIA injection: "${labelText.slice(0, 60)}..."`);
              break;
            }
          }
        }
      }
    }
    return found;
  }, ARIA_INJECTION_PATTERNS.map((p) => p.source));
}
async function getCleanTextWithStripping(page) {
  const raw = await page.evaluate(() => {
    const body = document.body;
    if (!body)
      return "";
    const clone = body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
    clone.querySelectorAll("[data-gstack-hidden]").forEach((el) => el.remove());
    return clone.innerText.split(`
`).map((line) => line.trim()).filter((line) => line.length > 0).join(`
`);
  });
  return stripLoneSurrogates(raw);
}
async function cleanupHiddenMarkers(page) {
  await page.evaluate(() => {
    document.querySelectorAll("[data-gstack-hidden]").forEach((el) => {
      el.removeAttribute("data-gstack-hidden");
    });
  });
}
function escapeEnvelopeSentinels(content) {
  const zwsp = "​";
  return content.replace(/═══ BEGIN UNTRUSTED WEB CONTENT ═══/g, `═══ BEGIN UNTRUSTED WEB C${zwsp}ONTENT ═══`).replace(/═══ END UNTRUSTED WEB CONTENT ═══/g, `═══ END UNTRUSTED WEB C${zwsp}ONTENT ═══`);
}
function wrapUntrustedPageContent(content, command, filterWarnings) {
  const safeContent = escapeEnvelopeSentinels(content);
  const parts = [];
  if (filterWarnings && filterWarnings.length > 0) {
    parts.push(`⚠ CONTENT WARNINGS: ${filterWarnings.join("; ")}`);
  }
  parts.push(ENVELOPE_BEGIN);
  parts.push(safeContent);
  parts.push(ENVELOPE_END);
  return parts.join(`
`);
}
function registerContentFilter(filter) {
  registeredFilters.push(filter);
}
function getFilterMode() {
  const mode = process.env.BROWSE_CONTENT_FILTER?.toLowerCase();
  if (mode === "off" || mode === "block")
    return mode;
  return "warn";
}
function runContentFilters(content, url, command) {
  const mode = getFilterMode();
  if (mode === "off") {
    return { safe: true, warnings: [] };
  }
  const allWarnings = [];
  let blocked = false;
  for (const filter of registeredFilters) {
    const result = filter(content, url, command);
    if (!result.safe) {
      allWarnings.push(...result.warnings);
      if (mode === "block") {
        blocked = true;
      }
    }
  }
  if (blocked && allWarnings.length > 0) {
    return {
      safe: false,
      warnings: allWarnings,
      blocked: true,
      message: `Content blocked: ${allWarnings.join("; ")}`
    };
  }
  return {
    safe: allWarnings.length === 0,
    warnings: allWarnings
  };
}
function urlBlocklistFilter(content, url, _command) {
  const warnings = [];
  const normalizedUrl = url.toLowerCase();
  for (const domain of BLOCKLIST_DOMAINS) {
    if (normalizedUrl.includes(domain)) {
      warnings.push(`Page URL matches blocklisted domain: ${domain}`);
    }
  }
  const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
  const contentUrls = content.match(urlPattern) || [];
  for (const contentUrl of contentUrls) {
    const normalizedContentUrl = contentUrl.toLowerCase();
    for (const domain of BLOCKLIST_DOMAINS) {
      if (normalizedContentUrl.includes(domain)) {
        warnings.push(`Content contains blocklisted URL: ${contentUrl.slice(0, 100)}`);
        break;
      }
    }
  }
  return { safe: warnings.length === 0, warnings };
}
var sessionMarker = null, ARIA_INJECTION_PATTERNS, ENVELOPE_BEGIN = "═══ BEGIN UNTRUSTED WEB CONTENT ═══", ENVELOPE_END = "═══ END UNTRUSTED WEB CONTENT ═══", registeredFilters, BLOCKLIST_DOMAINS;
var init_content_security = __esm(() => {
  init_sanitize();
  ARIA_INJECTION_PATTERNS = [
    /ignore\s+(previous|above|all)\s+instructions?/i,
    /you\s+are\s+(now|a)\s+/i,
    /system\s*:\s*/i,
    /\bdo\s+not\s+(follow|obey|listen)/i,
    /\bexecute\s+(the\s+)?following/i,
    /\bforget\s+(everything|all|your)/i,
    /\bnew\s+instructions?\s*:/i
  ];
  registeredFilters = [];
  BLOCKLIST_DOMAINS = [
    "requestbin.com",
    "pipedream.com",
    "webhook.site",
    "hookbin.com",
    "requestcatcher.com",
    "burpcollaborator.net",
    "interact.sh",
    "canarytokens.com",
    "ngrok.io",
    "ngrok-free.app"
  ];
  registerContentFilter(urlBlocklistFilter);
});

// browse/src/snapshot.ts
import * as Diff from "diff";
function parseSnapshotArgs(args) {
  const opts = {};
  for (let i = 0;i < args.length; i++) {
    const flag = SNAPSHOT_FLAGS.find((f) => f.short === args[i] || f.long === args[i]);
    if (!flag)
      throw new Error(`Unknown snapshot flag: ${args[i]}`);
    if (flag.takesValue) {
      const value = args[++i];
      if (!value)
        throw new Error(`Usage: snapshot ${flag.short} <value>`);
      if (flag.optionKey === "depth") {
        opts[flag.optionKey] = parseInt(value, 10);
        if (isNaN(opts.depth))
          throw new Error("Usage: snapshot -d <number>");
      } else {
        opts[flag.optionKey] = value;
      }
    } else {
      opts[flag.optionKey] = true;
    }
  }
  return opts;
}
function parseLine(line) {
  const match = line.match(/^(\s*)-\s+(\w+)(?:\s+"([^"]*)")?(?:\s+(\[.*?\]))?\s*(?::\s*(.*))?$/);
  if (!match) {
    return null;
  }
  return {
    indent: match[1].length,
    role: match[2],
    name: match[3] ?? null,
    props: match[4] || "",
    children: match[5]?.trim() || "",
    rawLine: line
  };
}
async function handleSnapshot(args, session, securityOpts) {
  const opts = parseSnapshotArgs(args);
  const page = session.getPage();
  const target = session.getActiveFrameOrPage();
  const inFrame = session.getFrame() !== null;
  let rootLocator;
  if (opts.selector) {
    rootLocator = target.locator(opts.selector);
    const count = await rootLocator.count();
    if (count === 0)
      throw new Error(`Selector not found: ${opts.selector}`);
  } else {
    rootLocator = target.locator("body");
  }
  const ariaText = await rootLocator.ariaSnapshot();
  if (!ariaText || ariaText.trim().length === 0) {
    session.setRefMap(new Map);
    return "(no accessible elements found)";
  }
  const lines = ariaText.split(`
`);
  const refMap = new Map;
  const output = [];
  let refCounter = 1;
  const roleNameCounts = new Map;
  const roleNameSeen = new Map;
  for (const line of lines) {
    const node = parseLine(line);
    if (!node)
      continue;
    const key = `${node.role}:${node.name || ""}`;
    roleNameCounts.set(key, (roleNameCounts.get(key) || 0) + 1);
  }
  for (const line of lines) {
    const node = parseLine(line);
    if (!node)
      continue;
    const depth = Math.floor(node.indent / 2);
    const isInteractive = INTERACTIVE_ROLES.has(node.role);
    if (opts.depth !== undefined && depth > opts.depth)
      continue;
    if (opts.interactive && !isInteractive) {
      const key = `${node.role}:${node.name || ""}`;
      roleNameSeen.set(key, (roleNameSeen.get(key) || 0) + 1);
      continue;
    }
    if (opts.compact && !isInteractive && !node.name && !node.children)
      continue;
    const ref = `e${refCounter++}`;
    const indent = "  ".repeat(depth);
    const key = `${node.role}:${node.name || ""}`;
    const seenIndex = roleNameSeen.get(key) || 0;
    roleNameSeen.set(key, seenIndex + 1);
    const totalCount = roleNameCounts.get(key) || 1;
    let locator;
    if (opts.selector) {
      locator = target.locator(opts.selector).getByRole(node.role, {
        name: node.name || undefined
      });
    } else {
      locator = target.getByRole(node.role, {
        name: node.name || undefined
      });
    }
    if (totalCount > 1) {
      locator = locator.nth(seenIndex);
    }
    refMap.set(ref, { locator, role: node.role, name: node.name || "" });
    let outputLine = `${indent}@${ref} [${node.role}]`;
    if (node.name)
      outputLine += ` "${node.name}"`;
    if (node.props)
      outputLine += ` ${node.props}`;
    if (node.children)
      outputLine += `: ${node.children}`;
    output.push(outputLine);
  }
  if (opts.interactive && !opts.cursorInteractive) {
    opts.cursorInteractive = true;
  }
  if (opts.cursorInteractive) {
    try {
      const cursorElements = await target.evaluate(() => {
        const STANDARD_INTERACTIVE = new Set([
          "A",
          "BUTTON",
          "INPUT",
          "SELECT",
          "TEXTAREA",
          "SUMMARY",
          "DETAILS"
        ]);
        const results = [];
        const allElements = document.querySelectorAll("*");
        for (const el of allElements) {
          if (STANDARD_INTERACTIVE.has(el.tagName))
            continue;
          if (!el.offsetParent && el.tagName !== "BODY")
            continue;
          const style = getComputedStyle(el);
          const hasCursorPointer = style.cursor === "pointer";
          const hasOnclick = el.hasAttribute("onclick");
          const hasTabindex = el.hasAttribute("tabindex") && parseInt(el.getAttribute("tabindex"), 10) >= 0;
          const hasRole = el.hasAttribute("role");
          const isInFloating = (() => {
            let parent = el;
            while (parent && parent !== document.documentElement) {
              const pStyle = getComputedStyle(parent);
              const isFloating = (pStyle.position === "fixed" || pStyle.position === "absolute") && parseInt(pStyle.zIndex || "0", 10) >= 10;
              const hasPortalAttr = parent.hasAttribute("data-floating-ui-portal") || parent.hasAttribute("data-radix-popper-content-wrapper") || parent.hasAttribute("data-radix-portal") || parent.hasAttribute("data-popper-placement") || parent.getAttribute("role") === "listbox" || parent.getAttribute("role") === "menu";
              if (isFloating || hasPortalAttr)
                return true;
              parent = parent.parentElement;
            }
            return false;
          })();
          if (!hasCursorPointer && !hasOnclick && !hasTabindex) {
            if (isInFloating && hasRole) {
              const role = el.getAttribute("role");
              if (role !== "option" && role !== "menuitem" && role !== "menuitemcheckbox" && role !== "menuitemradio")
                continue;
            } else {
              continue;
            }
          }
          if (hasRole && !isInFloating)
            continue;
          const parts = [];
          let current = el;
          while (current && current !== document.documentElement) {
            const parent = current.parentElement;
            if (!parent)
              break;
            const siblings = [...parent.children];
            const index = siblings.indexOf(current) + 1;
            parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
            current = parent;
          }
          const selector = parts.join(" > ");
          const text = el.innerText?.trim().slice(0, 80) || el.tagName.toLowerCase();
          const reasons = [];
          if (isInFloating)
            reasons.push("popover-child");
          if (hasCursorPointer)
            reasons.push("cursor:pointer");
          if (hasOnclick)
            reasons.push("onclick");
          if (hasTabindex)
            reasons.push(`tabindex=${el.getAttribute("tabindex")}`);
          if (hasRole)
            reasons.push(`role=${el.getAttribute("role")}`);
          results.push({ selector, text, reason: reasons.join(", ") });
        }
        return results;
      });
      if (cursorElements.length > 0) {
        output.push("");
        output.push("── cursor-interactive (not in ARIA tree) ──");
        let cRefCounter = 1;
        for (const elem of cursorElements) {
          const ref = `c${cRefCounter++}`;
          const locator = target.locator(elem.selector);
          refMap.set(ref, { locator, role: "cursor-interactive", name: elem.text });
          output.push(`@${ref} [${elem.reason}] "${elem.text}"`);
        }
      }
    } catch (err) {
      if (!err?.message?.includes("Execution context") && !err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("Content Security"))
        throw err;
      output.push("");
      output.push("(cursor scan failed — CSP restriction)");
    }
  }
  session.setRefMap(refMap);
  if (output.length === 0) {
    return "(no interactive elements found)";
  }
  const snapshotText = output.join(`
`);
  const outputIgnoredWarning = opts.outputPath && !opts.annotate && !opts.heatmap ? `[warning] -o/--output was ignored: it names the output file for an annotated (-a/--annotate) or heatmap (-H/--heatmap) screenshot. For a plain screenshot use: browse screenshot ${opts.outputPath}` : "";
  if (outputIgnoredWarning) {
    output.push(outputIgnoredWarning);
  }
  if (opts.annotate) {
    const screenshotPath = opts.outputPath || `${TEMP_DIR}/browse-annotated.png`;
    {
      const nodePath = __require("path");
      const nodeFs = __require("fs");
      const absolute = nodePath.resolve(screenshotPath);
      const safeDirs = [TEMP_DIR, process.cwd()].map((d) => {
        try {
          return nodeFs.realpathSync(d);
        } catch (err) {
          if (err?.code !== "ENOENT")
            throw err;
          return d;
        }
      });
      let realPath;
      try {
        realPath = nodeFs.realpathSync(absolute);
      } catch (err) {
        if (err.code === "ENOENT") {
          try {
            const dir = nodeFs.realpathSync(nodePath.dirname(absolute));
            realPath = nodePath.join(dir, nodePath.basename(absolute));
          } catch (err2) {
            if (err2?.code !== "ENOENT")
              throw err2;
            realPath = absolute;
          }
        } else {
          throw new Error(`Cannot resolve real path: ${screenshotPath} (${err.code})`);
        }
      }
      if (!safeDirs.some((dir) => isPathWithin(realPath, dir))) {
        throw new Error(`Path must be within: ${safeDirs.join(", ")}`);
      }
    }
    try {
      const boxes = [];
      const ambiguousRefs = [];
      const skippedRefs = [];
      for (const [ref, entry] of refMap) {
        try {
          let locator = entry.locator;
          const matchCount = await locator.count();
          if (matchCount > 1) {
            ambiguousRefs.push(`@${ref}`);
            locator = locator.first();
          }
          const box = await locator.boundingBox({ timeout: 1000 });
          if (box) {
            boxes.push({ ref: `@${ref}`, box });
          } else {
            skippedRefs.push(`@${ref}`);
          }
        } catch (err) {
          skippedRefs.push(`@${ref}`);
          if (process.env.BROWSE_DEBUG)
            console.error(`[annotate] skipped @${ref}: ${err?.message?.split(`
`)[0]}`);
        }
      }
      await page.evaluate((boxes) => {
        for (const { ref, box } of boxes) {
          const overlay = document.createElement("div");
          overlay.className = "__browse_annotation__";
          overlay.style.cssText = `
            position: absolute; top: ${box.y}px; left: ${box.x}px;
            width: ${box.width}px; height: ${box.height}px;
            border: 2px solid red; background: rgba(255,0,0,0.1);
            pointer-events: none; z-index: 99999;
            font-size: 10px; color: red; font-weight: bold;
          `;
          const label = document.createElement("span");
          label.textContent = ref;
          label.style.cssText = "position: absolute; top: -14px; left: 0; background: red; color: white; padding: 0 3px; font-size: 10px;";
          overlay.appendChild(label);
          document.body.appendChild(overlay);
        }
      }, boxes);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await guardScreenshotPath(screenshotPath);
      await page.evaluate(() => {
        document.querySelectorAll(".__browse_annotation__").forEach((el) => el.remove());
      });
      output.push("");
      output.push(`[annotated screenshot: ${screenshotPath}]`);
      if (ambiguousRefs.length || skippedRefs.length) {
        const cap = (arr) => arr.slice(0, 8).join(", ") + (arr.length > 8 ? `, +${arr.length - 8} more` : "");
        const parts = [];
        if (ambiguousRefs.length)
          parts.push(`${ambiguousRefs.length} ambiguous (first-match): ${cap(ambiguousRefs)}`);
        if (skippedRefs.length)
          parts.push(`${skippedRefs.length} skipped: ${cap(skippedRefs)}`);
        output.push(`[annotated: ${parts.join(" | ")}]`);
      }
    } catch (err) {
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("Execution context") && !err?.message?.includes("screenshot"))
        throw err;
      try {
        await page.evaluate(() => {
          document.querySelectorAll(".__browse_annotation__").forEach((el) => el.remove());
        });
      } catch (err2) {
        if (!err2?.message?.includes("closed") && !err2?.message?.includes("Target") && !err2?.message?.includes("Execution context"))
          throw err2;
      }
    }
  }
  if (opts.heatmap) {
    const heatmapPath = opts.outputPath || `${TEMP_DIR}/browse-heatmap.png`;
    {
      const nodePath = __require("path");
      const nodeFs = __require("fs");
      const absolute = nodePath.resolve(heatmapPath);
      const safeDirs = [TEMP_DIR, process.cwd()].map((d) => {
        try {
          return nodeFs.realpathSync(d);
        } catch (err) {
          if (err?.code !== "ENOENT")
            throw err;
          return d;
        }
      });
      let realPath;
      try {
        realPath = nodeFs.realpathSync(absolute);
      } catch (err) {
        if (err.code === "ENOENT") {
          try {
            const dir = nodeFs.realpathSync(nodePath.dirname(absolute));
            realPath = nodePath.join(dir, nodePath.basename(absolute));
          } catch (err2) {
            if (err2?.code !== "ENOENT")
              throw err2;
            realPath = absolute;
          }
        } else {
          throw new Error(`Cannot resolve real path: ${heatmapPath} (${err.code})`);
        }
      }
      if (!safeDirs.some((dir) => isPathWithin(realPath, dir))) {
        throw new Error(`Path must be within: ${safeDirs.join(", ")}`);
      }
    }
    const VALID_COLORS = new Set(["green", "yellow", "red", "blue", "orange", "gray"]);
    const COLOR_MAP = {
      green: { border: "#00b400", bg: "rgba(0,180,0,0.15)" },
      yellow: { border: "#ffb400", bg: "rgba(255,180,0,0.15)" },
      red: { border: "#ff0000", bg: "rgba(255,0,0,0.15)" },
      blue: { border: "#0066ff", bg: "rgba(0,102,255,0.15)" },
      orange: { border: "#ff6600", bg: "rgba(255,102,0,0.15)" },
      gray: { border: "#888888", bg: "rgba(136,136,136,0.15)" }
    };
    let colorAssignments;
    try {
      const parsed = JSON.parse(opts.heatmap);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
      colorAssignments = parsed;
    } catch {
      throw new Error(`Invalid heatmap JSON. Expected object: '{"@e1":"green","@e3":"red"}'`);
    }
    for (const [ref, color] of Object.entries(colorAssignments)) {
      if (!VALID_COLORS.has(color)) {
        throw new Error(`Invalid heatmap color "${color}" for ${ref}. Valid: ${[...VALID_COLORS].join(", ")}`);
      }
    }
    try {
      const boxes = [];
      for (const [refKey, color] of Object.entries(colorAssignments)) {
        const cleanRef = refKey.startsWith("@") ? refKey.slice(1) : refKey;
        const entry = refMap.get(cleanRef);
        if (!entry)
          continue;
        try {
          const box = await entry.locator.boundingBox({ timeout: 1000 });
          if (box) {
            const colors = COLOR_MAP[color] || COLOR_MAP.gray;
            boxes.push({ ref: `@${cleanRef}`, box, color: JSON.stringify(colors) });
          }
        } catch {}
      }
      await page.evaluate((boxes) => {
        for (const { ref, box, color } of boxes) {
          const colors = JSON.parse(color);
          const overlay = document.createElement("div");
          overlay.className = "__browse_heatmap__";
          overlay.style.cssText = `
            position: absolute; top: ${box.y}px; left: ${box.x}px;
            width: ${box.width}px; height: ${box.height}px;
            border: 2px solid ${colors.border}; background: ${colors.bg};
            pointer-events: none; z-index: 99999;
            font-size: 10px; color: ${colors.border}; font-weight: bold;
          `;
          const label = document.createElement("span");
          label.textContent = ref;
          label.style.cssText = `position: absolute; top: -14px; left: 0; background: ${colors.border}; color: white; padding: 0 3px; font-size: 10px;`;
          overlay.appendChild(label);
          document.body.appendChild(overlay);
        }
      }, boxes);
      await page.screenshot({ path: heatmapPath, fullPage: true });
      await guardScreenshotPath(heatmapPath);
      await page.evaluate(() => {
        document.querySelectorAll(".__browse_heatmap__").forEach((el) => el.remove());
      });
      output.push("");
      output.push(`[heatmap screenshot: ${heatmapPath}]`);
    } catch (err) {
      try {
        await page.evaluate(() => {
          document.querySelectorAll(".__browse_heatmap__").forEach((el) => el.remove());
        });
      } catch {}
      if (!err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("Execution context") && !err?.message?.includes("screenshot"))
        throw err;
    }
  }
  if (opts.diff) {
    const lastSnapshot = session.getLastSnapshot();
    if (!lastSnapshot) {
      session.setLastSnapshot(snapshotText);
      return snapshotText + `

(no previous snapshot to diff against — this snapshot stored as baseline)` + (outputIgnoredWarning ? `
` + outputIgnoredWarning : "");
    }
    const changes = Diff.diffLines(lastSnapshot, snapshotText);
    const diffOutput = ["--- previous snapshot", "+++ current snapshot", ""];
    for (const part of changes) {
      const prefix = part.added ? "+" : part.removed ? "-" : " ";
      const diffLines = part.value.split(`
`).filter((l) => l.length > 0);
      for (const line of diffLines) {
        diffOutput.push(`${prefix} ${line}`);
      }
    }
    session.setLastSnapshot(snapshotText);
    return stripLoneSurrogates(diffOutput.join(`
`) + (outputIgnoredWarning ? `
` + outputIgnoredWarning : ""));
  }
  session.setLastSnapshot(snapshotText);
  if (inFrame) {
    const frameUrl = session.getFrame()?.url() ?? "unknown";
    output.unshift(`[Context: iframe src="${frameUrl}"]`);
  }
  if (securityOpts?.splitForScoped) {
    const trustedRefs = [];
    const untrustedLines = [];
    for (const line of output) {
      const refMatch = line.match(/^(\s*)@(e\d+|c\d+)\s+\[([^\]]+)\]\s*(.*)/);
      if (refMatch) {
        const [, indent, ref, role, rest] = refMatch;
        const nameMatch = rest.match(/^"(.+?)"/);
        let truncName = nameMatch ? nameMatch[1] : rest.trim();
        if (truncName.length > 50)
          truncName = truncName.slice(0, 47) + "...";
        trustedRefs.push(`${indent}@${ref} [${role}] "${truncName}"`);
      }
      untrustedLines.push(line);
    }
    const parts = [];
    if (trustedRefs.length > 0) {
      parts.push("INTERACTIVE ELEMENTS (trusted — use these @refs for click/fill):");
      parts.push(...trustedRefs);
      parts.push("");
    }
    const safeUntrusted = untrustedLines.map(escapeEnvelopeSentinels);
    parts.push("═══ BEGIN UNTRUSTED WEB CONTENT ═══");
    parts.push(...safeUntrusted);
    parts.push("═══ END UNTRUSTED WEB CONTENT ═══");
    return stripLoneSurrogates(parts.join(`
`));
  }
  return stripLoneSurrogates(output.join(`
`));
}
var INTERACTIVE_ROLES, SNAPSHOT_FLAGS;
var init_snapshot = __esm(() => {
  init_platform();
  init_content_security();
  init_sanitize();
  init_screenshot_size_guard();
  INTERACTIVE_ROLES = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "treeitem"
  ]);
  SNAPSHOT_FLAGS = [
    { short: "-i", long: "--interactive", description: "Interactive elements only (buttons, links, inputs) with @e refs. Also auto-enables cursor-interactive scan (-C) to capture dropdowns and popovers.", optionKey: "interactive" },
    { short: "-c", long: "--compact", description: "Compact (no empty structural nodes)", optionKey: "compact" },
    { short: "-d", long: "--depth", description: "Limit tree depth (0 = root only, default: unlimited)", takesValue: true, valueHint: "<N>", optionKey: "depth" },
    { short: "-s", long: "--selector", description: "Scope to CSS selector", takesValue: true, valueHint: "<sel>", optionKey: "selector" },
    { short: "-D", long: "--diff", description: "Unified diff against previous snapshot (first call stores baseline)", optionKey: "diff" },
    { short: "-a", long: "--annotate", description: "Annotated screenshot with red overlay boxes and ref labels", optionKey: "annotate" },
    { short: "-o", long: "--output", description: "Output path for annotated screenshot (default: <temp>/browse-annotated.png)", takesValue: true, valueHint: "<path>", optionKey: "outputPath" },
    { short: "-C", long: "--cursor-interactive", description: "Cursor-interactive elements (@c refs — divs with pointer, onclick). Auto-enabled when -i is used.", optionKey: "cursorInteractive" },
    { short: "-H", long: "--heatmap", description: `Color-coded overlay screenshot from JSON map: '{"@e1":"green","@e3":"red"}'. Valid colors: green, yellow, red, blue, orange, gray.`, takesValue: true, valueHint: "<json>", optionKey: "heatmap" }
  ];
});

// browse/src/commands.ts
function wrapUntrustedContent(result, url) {
  const safeUrl = url.replace(/[\n\r]/g, "").slice(0, 200);
  const safeResult = result.replace(/--- (BEGIN|END) UNTRUSTED EXTERNAL CONTENT/g, "--- $1 UNTRUSTED EXTERNAL C​ONTENT");
  return `--- BEGIN UNTRUSTED EXTERNAL CONTENT (source: ${safeUrl}) ---
${safeResult}
--- END UNTRUSTED EXTERNAL CONTENT ---`;
}
function canonicalizeCommand(cmd) {
  return COMMAND_ALIASES[cmd] ?? cmd;
}
function levenshtein(a, b) {
  if (a === b)
    return 0;
  if (a.length === 0)
    return b.length;
  if (b.length === 0)
    return a.length;
  const m = [];
  for (let i = 0;i <= a.length; i++)
    m.push([i, ...Array(b.length).fill(0)]);
  for (let j = 0;j <= b.length; j++)
    m[0][j] = j;
  for (let i = 1;i <= a.length; i++) {
    for (let j = 1;j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}
function buildUnknownCommandError(command, commandSet, aliasMap = COMMAND_ALIASES, newInVersion = NEW_IN_VERSION) {
  let msg = `Unknown command: '${command}'.`;
  if (command.length >= 4) {
    let best;
    let bestDist = 3;
    const candidates = [...commandSet, ...Object.keys(aliasMap)].sort();
    for (const cand of candidates) {
      const d = levenshtein(command, cand);
      if (d <= 2 && d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (best)
      msg += ` Did you mean '${best}'?`;
  }
  if (newInVersion[command]) {
    msg += ` This command was added in browse v${newInVersion[command]}. Upgrade: cd ~/.claude/skills/gstack && git pull && bun run build.`;
  }
  return msg;
}
var READ_COMMANDS, WRITE_COMMANDS, META_COMMANDS, ALL_COMMANDS, PAGE_CONTENT_COMMANDS, DOM_CONTENT_COMMANDS, COMMAND_DESCRIPTIONS, allCmds, descKeys, COMMAND_ALIASES, NEW_IN_VERSION;
var init_commands = __esm(() => {
  READ_COMMANDS = new Set([
    "text",
    "html",
    "links",
    "forms",
    "accessibility",
    "js",
    "eval",
    "css",
    "attrs",
    "console",
    "network",
    "cookies",
    "storage",
    "perf",
    "dialog",
    "is",
    "inspect",
    "media",
    "data"
  ]);
  WRITE_COMMANDS = new Set([
    "goto",
    "back",
    "forward",
    "reload",
    "load-html",
    "click",
    "fill",
    "select",
    "hover",
    "type",
    "press",
    "scroll",
    "wait",
    "viewport",
    "cookie",
    "cookie-import",
    "cookie-import-browser",
    "header",
    "useragent",
    "upload",
    "dialog-accept",
    "dialog-dismiss",
    "style",
    "cleanup",
    "prettyscreenshot",
    "download",
    "scrape",
    "archive"
  ]);
  META_COMMANDS = new Set([
    "tabs",
    "tab",
    "tab-each",
    "newtab",
    "closetab",
    "status",
    "stop",
    "restart",
    "screenshot",
    "pdf",
    "responsive",
    "chain",
    "diff",
    "url",
    "snapshot",
    "handoff",
    "resume",
    "connect",
    "disconnect",
    "focus",
    "inbox",
    "watch",
    "state",
    "frame",
    "ux-audit",
    "domain-skill",
    "skill",
    "cdp",
    "memory"
  ]);
  ALL_COMMANDS = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
  PAGE_CONTENT_COMMANDS = new Set([
    "text",
    "html",
    "links",
    "forms",
    "accessibility",
    "attrs",
    "console",
    "dialog",
    "media",
    "data",
    "ux-audit",
    "snapshot"
  ]);
  DOM_CONTENT_COMMANDS = new Set([
    "text",
    "html",
    "links",
    "forms",
    "accessibility",
    "attrs",
    "media",
    "data",
    "ux-audit"
  ]);
  COMMAND_DESCRIPTIONS = {
    memory: { category: "Server", description: "Snapshot Bun heap + per-tab JS heap + Chromium process tree + bounded buffer sizes. JSON output with --json.", usage: "memory [--json]" },
    goto: { category: "Navigation", description: "Navigate to URL (http://, https://, or file:// scoped to cwd/TEMP_DIR)", usage: "goto <url>" },
    "load-html": { category: "Navigation", description: 'Load HTML via setContent. Accepts a file path under safe-dirs (validated), OR --from-file <payload.json> with {"html":"...","waitUntil":"..."} for large inline HTML (Windows argv safe).', usage: "load-html <file> [--wait-until load|domcontentloaded|networkidle] [--tab-id <N>]  |  load-html --from-file <payload.json> [--tab-id <N>]" },
    back: { category: "Navigation", description: "History back" },
    forward: { category: "Navigation", description: "History forward" },
    reload: { category: "Navigation", description: "Reload page" },
    url: { category: "Navigation", description: "Print current URL" },
    text: { category: "Reading", description: "Cleaned page text" },
    html: { category: "Reading", description: "innerHTML of selector (throws if not found), or full page HTML if no selector given", usage: "html [selector]" },
    links: { category: "Reading", description: 'All links as "text → href"' },
    forms: { category: "Reading", description: "Form fields as JSON" },
    accessibility: { category: "Reading", description: "Full ARIA tree" },
    media: { category: "Reading", description: "All media elements (images, videos, audio) with URLs, dimensions, types", usage: "media [--images|--videos|--audio] [selector]" },
    data: { category: "Reading", description: "Structured data: JSON-LD, Open Graph, Twitter Cards, meta tags", usage: "data [--jsonld|--og|--meta|--twitter]" },
    js: { category: "Inspection", description: "Run inline JavaScript expression in the page context and return result as string. Same JS sandbox as eval; the only difference is js takes an inline expr while eval reads from a file. With --out <file>, the result is written to disk instead of returned (a base64 data URL is decoded to raw bytes unless --raw is given) — ideal for rasterizing local renders to PNG without serializing megabytes back through the CLI. --out makes the invocation a WRITE (needs write scope, never allowed over the tunnel).", usage: "js <expr> [--out <file>] [--raw]" },
    eval: { category: "Inspection", description: "Run JavaScript from a file in the page context and return result as string. Path must resolve under /tmp or cwd (no traversal). Use eval for multi-line scripts; use js for one-liners. With --out <file>, the result is written to disk (base64 data URL decoded to bytes unless --raw); --out makes the invocation a WRITE (needs write scope, never allowed over the tunnel).", usage: "eval <file> [--out <file>] [--raw]" },
    css: { category: "Inspection", description: "Computed CSS value", usage: "css <sel> <prop>" },
    attrs: { category: "Inspection", description: "Element attributes as JSON", usage: "attrs <sel|@ref>" },
    is: { category: "Inspection", description: "State check on element. Valid <prop> values: visible, hidden, enabled, disabled, checked, editable, focused (case-sensitive). <sel> accepts a CSS selector OR an @ref token from a prior snapshot (e.g. @e3, @c1) — refs are interchangeable with selectors anywhere a selector is expected.", usage: "is <prop> <sel|@ref>" },
    console: { category: "Inspection", description: "Console messages (--errors filters to error/warning)", usage: "console [--clear|--errors]" },
    network: { category: "Inspection", description: "Network requests", usage: "network [--clear]" },
    dialog: { category: "Inspection", description: "Dialog messages", usage: "dialog [--clear]" },
    cookies: { category: "Inspection", description: "All cookies as JSON" },
    storage: { category: "Inspection", description: 'Read both localStorage and sessionStorage as JSON. With "set <key> <value>", write to localStorage only (sessionStorage is read-only via this command — set it with `js sessionStorage.setItem(...)`).', usage: "storage  |  storage set <key> <value>" },
    perf: { category: "Inspection", description: "Page load timings" },
    click: { category: "Interaction", description: "Click element", usage: "click <sel>" },
    fill: { category: "Interaction", description: "Fill input", usage: "fill <sel> <val>" },
    select: { category: "Interaction", description: "Select dropdown option by value, label, or visible text", usage: "select <sel> <val>" },
    hover: { category: "Interaction", description: "Hover element", usage: "hover <sel>" },
    type: { category: "Interaction", description: "Type into focused element", usage: "type <text>" },
    press: { category: "Interaction", description: "Press a Playwright keyboard key against the focused element. Names are case-sensitive: Enter, Tab, Escape, ArrowUp/Down/Left/Right, Backspace, Delete, Home, End, PageUp, PageDown. Modifiers combine with +: Shift+Enter, Control+A, Meta+K. Single printable chars (a, A, 1) work too. Full key list: https://playwright.dev/docs/api/class-keyboard#keyboard-press", usage: "press <key>" },
    scroll: { category: "Interaction", description: "With a selector, smooth-scrolls the element into view. Without a selector, jumps to page bottom. No --by/--to amount option; for pixel-precise scrolling use `js window.scrollTo(0, N)`.", usage: "scroll [sel|@ref]" },
    wait: { category: "Interaction", description: "Wait for element, network idle, or page load (timeout: 15s)", usage: "wait <sel|--networkidle|--load>" },
    upload: { category: "Interaction", description: "Upload file(s)", usage: "upload <sel> <file> [file2...]" },
    viewport: { category: "Interaction", description: "Set viewport size and optional deviceScaleFactor (1-3, for retina screenshots). --scale requires a context rebuild.", usage: "viewport [<WxH>] [--scale <n>]" },
    cookie: { category: "Interaction", description: "Set cookie on current page domain", usage: "cookie <name>=<value>" },
    "cookie-import": { category: "Interaction", description: "Import cookies from JSON file", usage: "cookie-import <json>" },
    "cookie-import-browser": { category: "Interaction", description: "Import cookies from installed Chromium browsers (opens picker, or use --domain for direct import)", usage: "cookie-import-browser [browser] [--domain d]" },
    header: { category: "Interaction", description: "Set custom request header (colon-separated, sensitive values auto-redacted)", usage: "header <name>:<value>" },
    useragent: { category: "Interaction", description: "Set user agent", usage: "useragent <string>" },
    "dialog-accept": { category: "Interaction", description: "Auto-accept next alert/confirm/prompt. Optional text is sent as the prompt response", usage: "dialog-accept [text]" },
    "dialog-dismiss": { category: "Interaction", description: "Auto-dismiss next dialog" },
    download: { category: "Extraction", description: "Download URL or media element to disk using browser cookies. Use --navigate for URLs that trigger browser downloads (CDN redirects, Content-Disposition, anti-bot protected sites)", usage: "download <url|@ref> [path] [--base64] [--navigate]" },
    scrape: { category: "Extraction", description: "Bulk download all media from page. Writes manifest.json", usage: "scrape <images|videos|media> [--selector sel] [--dir path] [--limit N]" },
    archive: { category: "Extraction", description: "Save complete page as MHTML via CDP", usage: "archive [path]" },
    screenshot: { category: "Visual", description: "Save screenshot. --selector targets a specific element (explicit flag form). Positional selectors starting with ./#/@/[ still work.", usage: "screenshot [--selector <css>] [--viewport] [--clip x,y,w,h] [--base64] [selector|@ref] [path]" },
    pdf: { category: "Visual", description: "Save the current page as PDF. Supports page layout (--format, --width, --height, --margins, --margin-*), structure (--toc waits for Paged.js), branding (--header-template, --footer-template, --page-numbers), accessibility (--tagged, --outline), and --from-file <payload.json> for large payloads. Use --tab-id <N> to target a specific tab.", usage: "pdf [path] [--format letter|a4|legal] [--width <dim> --height <dim>] [--margins <dim>] [--margin-top <dim> --margin-right <dim> --margin-bottom <dim> --margin-left <dim>] [--header-template <html>] [--footer-template <html>] [--page-numbers] [--tagged] [--outline] [--print-background] [--prefer-css-page-size] [--toc] [--tab-id <N>]  |  pdf --from-file <payload.json> [--tab-id <N>]" },
    responsive: { category: "Visual", description: "Screenshots at mobile (375x812), tablet (768x1024), desktop (1280x720). Saves as {prefix}-mobile.png etc.", usage: "responsive [prefix]" },
    diff: { category: "Visual", description: "Text diff between pages", usage: "diff <url1> <url2>" },
    tabs: { category: "Tabs", description: "List open tabs" },
    tab: { category: "Tabs", description: "Switch to tab", usage: "tab <id>" },
    newtab: { category: "Tabs", description: 'Open new tab. With --json, returns {"tabId":N,"url":...} for programmatic use (make-pdf).', usage: "newtab [url] [--json]" },
    closetab: { category: "Tabs", description: "Close tab", usage: "closetab [id]" },
    "tab-each": { category: "Tabs", description: "Run a command on every open tab. Returns JSON with per-tab results.", usage: "tab-each <command> [args...]" },
    status: { category: "Server", description: "Health check" },
    stop: { category: "Server", description: "Shutdown server" },
    restart: { category: "Server", description: "Restart server" },
    snapshot: { category: "Snapshot", description: "Accessibility tree with @e refs for element selection. Flags: -i interactive only, -c compact, -d N depth limit, -s sel scope, -D diff vs previous, -a annotated screenshot, -o path output, -C cursor-interactive @c refs", usage: "snapshot [flags]" },
    chain: { category: "Meta", description: 'Run a sequence of commands from JSON on stdin. One JSON array of arrays, each inner array is [cmd, ...args]. Output is one JSON result per command. Pipe a JSON array (e.g. `[["goto","https://example.com"],["text","h1"]]`) to `$B chain` and it runs the goto then the text command in order. Stops at the first error.', usage: "chain  (JSON via stdin)" },
    handoff: { category: "Server", description: "Open visible Chrome at current page for user takeover", usage: "handoff [message]" },
    resume: { category: "Server", description: "Re-snapshot after user takeover, return control to AI", usage: "resume" },
    connect: { category: "Server", description: "Launch headed Chromium with Chrome extension", usage: "connect" },
    disconnect: { category: "Server", description: "Disconnect headed browser, return to headless mode" },
    focus: { category: "Server", description: "Bring headed browser window to foreground (macOS)", usage: "focus [@ref]" },
    inbox: { category: "Meta", description: "List messages from sidebar scout inbox", usage: "inbox [--clear]" },
    watch: { category: "Meta", description: "Passive observation — periodic snapshots while user browses", usage: "watch [stop]" },
    state: { category: "Server", description: "Save/load browser state (cookies + URLs)", usage: "state save|load <name>" },
    frame: { category: "Meta", description: "Switch to iframe context (or main to return)", usage: "frame <sel|@ref|--name n|--url pattern|main>" },
    inspect: { category: "Inspection", description: "Deep CSS inspection via CDP — full rule cascade, box model, computed styles", usage: "inspect [selector] [--all] [--history]" },
    style: { category: "Interaction", description: "Modify CSS property on element (with undo support)", usage: "style <sel> <prop> <value> | style --undo [N]" },
    cleanup: { category: "Interaction", description: "Remove page clutter (ads, cookie banners, sticky elements, social widgets)", usage: "cleanup [--ads] [--cookies] [--sticky] [--social] [--all]" },
    prettyscreenshot: { category: "Visual", description: "Clean screenshot with optional cleanup, scroll positioning, and element hiding", usage: "prettyscreenshot [--scroll-to sel|text] [--cleanup] [--hide sel...] [--width px] [path]" },
    "ux-audit": { category: "Inspection", description: "Extract page structure for UX behavioral analysis — site ID, nav, headings, text blocks, interactive elements. Returns JSON for agent interpretation.", usage: "ux-audit" },
    "domain-skill": { category: "Meta", description: 'Per-site notes the agent writes for itself. Host is derived from the active tab. Lifecycle: `save` adds a quarantined note → after N=3 successful uses without the prompt-injection classifier flagging it, the note auto-promotes to "active" → `promote-to-global` lifts it to the global tier (machine-wide, all projects). The classifier flag is set automatically by the L4 prompt-injection scan; agents do not set it manually. Use `list` / `show` to inspect, `edit` to revise, `rollback` to demote, `rm` to tombstone.', usage: "domain-skill save|list|show|edit|promote-to-global|rollback|rm <host?>" },
    skill: { category: "Meta", description: "Run a browser-skill: deterministic Playwright script that drives the daemon over loopback HTTP. 3-tier lookup (project > global > bundled). Spawned scripts get a per-spawn scoped token (read+write only) — never the daemon root token.", usage: "skill list|show|run|test|rm <name?> [--arg k=v]... [--timeout=Ns]" },
    cdp: { category: "Inspection", description: "Raw Chrome DevTools Protocol method dispatch. Deny-default: only methods enumerated in `browse/src/cdp-allowlist.ts` (CDP_ALLOWLIST const) are reachable; any other method 403s. Each allowlist entry declares scope (tab vs browser) and output (trusted vs untrusted) — untrusted methods (data-exfil-shaped, e.g. Network.getResponseBody) get UNTRUSTED-envelope wrapped output. To discover allowed methods: read `browse/src/cdp-allowlist.ts`. Example: `$B cdp Page.getLayoutMetrics`.", usage: "cdp <Domain.method> [json-params]" }
  };
  allCmds = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);
  descKeys = new Set(Object.keys(COMMAND_DESCRIPTIONS));
  for (const cmd of allCmds) {
    if (!descKeys.has(cmd))
      throw new Error(`COMMAND_DESCRIPTIONS missing entry for: ${cmd}`);
  }
  for (const key of descKeys) {
    if (!allCmds.has(key))
      throw new Error(`COMMAND_DESCRIPTIONS has unknown command: ${key}`);
  }
  COMMAND_ALIASES = {
    setcontent: "load-html",
    "set-content": "load-html",
    setContent: "load-html"
  };
  NEW_IN_VERSION = {
    "load-html": "0.19.0.0"
  };
});

// browse/src/domain-skills.ts
import { promises as fs12 } from "fs";
import { open as fsOpen, constants as fsConstants } from "fs";
import * as path11 from "path";
import * as os8 from "os";
import { createHash as createHash2 } from "crypto";
function gstackHome2() {
  return process.env.GSTACK_HOME || path11.join(os8.homedir(), ".gstack");
}
function globalFile() {
  return path11.join(gstackHome2(), "global-domain-skills.jsonl");
}
function projectFile(slug) {
  return path11.join(gstackHome2(), "projects", slug, "learnings.jsonl");
}
function normalizeHost(input) {
  let h = input.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0].split("?")[0].split("#")[0];
  h = h.split(":")[0];
  h = h.replace(/^www\./, "");
  return h;
}
async function deriveHostFromActiveTab(page) {
  const url = page.url();
  if (!url || url === "about:blank" || url.startsWith("chrome://")) {
    throw new Error(`Cannot save domain-skill: no top-level URL on active tab.
` + `Cause: tab is empty or on chrome:// page.
` + "Action: navigate to the target site first with $B goto <url>.");
  }
  return normalizeHost(url);
}
async function ensureDir2(filePath) {
  await fs12.mkdir(path11.dirname(filePath), { recursive: true });
}
async function appendRow(filePath, row) {
  await ensureDir2(filePath);
  const line = JSON.stringify(row) + `
`;
  return new Promise((resolve, reject) => {
    fsOpen(filePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND, 420, (err, fd) => {
      if (err)
        return reject(err);
      const buf = Buffer.from(line, "utf8");
      const writeAndSync = () => {
        const fsSync = __require("fs");
        try {
          fsSync.writeSync(fd, buf, 0, buf.length);
          fsSync.fsyncSync(fd);
          fsSync.closeSync(fd);
          resolve();
        } catch (e) {
          try {
            fsSync.closeSync(fd);
          } catch {}
          reject(e);
        }
      };
      writeAndSync();
    });
  });
}
async function readRows(filePath) {
  let raw;
  try {
    raw = await fs12.readFile(filePath, "utf8");
  } catch (e) {
    const err = e;
    if (err.code === "ENOENT")
      return [];
    throw err;
  }
  const rows = [];
  const lines = raw.split(`
`);
  for (const line of lines) {
    if (!line)
      continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && parsed.type === "domain")
        rows.push(parsed);
    } catch {}
  }
  return rows;
}
function keyOf(row) {
  return `${row.scope}::${row.host}`;
}
function resolveLatest(rows) {
  const m = new Map;
  for (const row of rows) {
    const k = keyOf(row);
    const prior = m.get(k);
    if (!prior || row.version >= prior.version) {
      m.set(k, row);
    }
  }
  for (const [k, row] of m) {
    if (row.tombstone)
      m.delete(k);
  }
  return m;
}
async function readSkill(host, projectSlug) {
  const normalized = normalizeHost(host);
  const projectRows = await readRows(projectFile(projectSlug));
  const projectLatest = resolveLatest(projectRows);
  const projectHit = projectLatest.get(`project::${normalized}`);
  if (projectHit && projectHit.state === "active") {
    return { row: projectHit, source: "project" };
  }
  const globalRows = await readRows(globalFile());
  const globalLatest = resolveLatest(globalRows);
  const globalHit = globalLatest.get(`global::${normalized}`);
  if (globalHit && globalHit.state === "global") {
    return { row: globalHit, source: "global" };
  }
  return null;
}
async function writeSkill(input) {
  if (input.classifierScore >= 0.85) {
    throw new Error(`Save blocked: classifier flagged content as potential injection (score: ${input.classifierScore.toFixed(2)}).
` + `Cause: skill body contains patterns the L4 classifier marks as risky.
` + "Action: rewrite the skill content removing instruction-like prose, retry.");
  }
  const normalized = normalizeHost(input.host);
  const body = input.body;
  const now = new Date().toISOString();
  const sha = createHash2("sha256").update(body, "utf8").digest("hex");
  const projectRows = await readRows(projectFile(input.projectSlug));
  const projectLatest = resolveLatest(projectRows);
  const prior = projectLatest.get(`project::${normalized}`);
  const version = prior ? prior.version + 1 : 1;
  const row = {
    type: "domain",
    host: normalized,
    scope: "project",
    state: "quarantined",
    body,
    version,
    classifier_score: input.classifierScore,
    source: input.source,
    sha256: sha,
    use_count: 0,
    flag_count: 0,
    created_ts: prior?.created_ts ?? now,
    updated_ts: now
  };
  await appendRow(projectFile(input.projectSlug), row);
  return row;
}
async function promoteToGlobal(host, projectSlug) {
  const normalized = normalizeHost(host);
  const rows = await readRows(projectFile(projectSlug));
  const latest = resolveLatest(rows);
  const current = latest.get(`project::${normalized}`);
  if (!current) {
    throw new Error(`Cannot promote: no skill for ${normalized} in project ${projectSlug}.
` + `Cause: skill does not exist or is tombstoned.
` + "Action: $B domain-skill list to see what exists in this project.");
  }
  if (current.state !== "active") {
    throw new Error(`Cannot promote: skill for ${normalized} is in state "${current.state}", expected "active".
` + `Cause: skill must be active in this project (used ${PROMOTE_THRESHOLD}+ times without flag) before global promotion.
` + "Action: use the skill in this project until it auto-promotes to active.");
  }
  const now = new Date().toISOString();
  const globalRow = {
    ...current,
    scope: "global",
    state: "global",
    version: 1,
    use_count: 0,
    flag_count: 0,
    updated_ts: now
  };
  await appendRow(globalFile(), globalRow);
  return globalRow;
}
async function rollbackSkill(host, projectSlug, scope = "project") {
  const normalized = normalizeHost(host);
  const file = scope === "project" ? projectFile(projectSlug) : globalFile();
  const rows = await readRows(file);
  const matching = rows.filter((r) => r.host === normalized && r.scope === scope && !r.tombstone);
  if (matching.length < 2) {
    throw new Error(`Cannot rollback: ${normalized} has fewer than 2 versions in ${scope} scope.
` + `Cause: no prior version to roll back to.
` + "Action: $B domain-skill rm to delete instead, or wait for a future revision to roll back from.");
  }
  matching.sort((a, b) => b.version - a.version);
  const target = matching[1];
  const newVersion = matching[0].version + 1;
  const restored = {
    ...target,
    version: newVersion,
    updated_ts: new Date().toISOString()
  };
  await appendRow(file, restored);
  return restored;
}
async function listSkills(projectSlug) {
  const projectRows = await readRows(projectFile(projectSlug));
  const globalRows = await readRows(globalFile());
  const projectLatest = Array.from(resolveLatest(projectRows).values());
  const globalLatest = Array.from(resolveLatest(globalRows).values()).filter((r) => r.state === "global");
  return { project: projectLatest, global: globalLatest };
}
async function deleteSkill(host, projectSlug, scope = "project") {
  const normalized = normalizeHost(host);
  const file = scope === "project" ? projectFile(projectSlug) : globalFile();
  const rows = await readRows(file);
  const latest = resolveLatest(rows);
  const current = latest.get(`${scope}::${normalized}`);
  if (!current) {
    throw new Error(`Cannot delete: no skill for ${normalized} in ${scope} scope.
` + `Cause: skill does not exist or is already tombstoned.
` + "Action: $B domain-skill list to see what exists.");
  }
  const tombstone = {
    ...current,
    version: current.version + 1,
    updated_ts: new Date().toISOString(),
    tombstone: true
  };
  await appendRow(file, tombstone);
}
var PROMOTE_THRESHOLD = 3;
var init_domain_skills = () => {};

// browse/src/project-slug.ts
import * as path12 from "path";
import * as os9 from "os";
import { execSync } from "child_process";
function getCurrentProjectSlug() {
  if (cachedSlug)
    return cachedSlug;
  const explicit = process.env.GSTACK_PROJECT_SLUG;
  if (explicit) {
    cachedSlug = explicit;
    return explicit;
  }
  try {
    const slugBin = path12.join(os9.homedir(), ".claude/skills/gstack/bin/gstack-slug");
    const out = execSync(slugBin, { encoding: "utf8", timeout: 2000, windowsHide: true }).trim();
    const m = out.match(/SLUG="?([^"\n]+)"?/);
    cachedSlug = m ? m[1] : out || "unknown";
  } catch {
    cachedSlug = "unknown";
  }
  return cachedSlug;
}
var cachedSlug = null;
var init_project_slug = () => {};

// browse/src/domain-skill-commands.ts
import { promises as fs13 } from "fs";
import * as path13 from "path";
import * as os10 from "os";
import { spawnSync as spawnSync2 } from "child_process";
async function readBodyFromArgs(args) {
  const fromFileIdx = args.indexOf("--from-file");
  if (fromFileIdx >= 0 && fromFileIdx + 1 < args.length) {
    const filePath = args[fromFileIdx + 1];
    const body = await fs13.readFile(filePath, "utf8");
    return body;
  }
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY)
      resolve("");
  });
}
function formatSavedOk(row, slug) {
  return [
    `Saved (state: ${row.state}, scope: ${row.scope}).`,
    `Host: ${row.host}`,
    `Bytes: ${row.body.length}`,
    `Version: ${row.version}`,
    `Stored at: ~/.gstack/projects/${slug}/learnings.jsonl`,
    "",
    `Next: skill is quarantined and won't fire in prompts until used 3 times`,
    `      without classifier flags. Run $B domain-skill list to see state.`
  ].join(`
`);
}
function formatSkillListing(list) {
  if (list.project.length === 0 && list.global.length === 0) {
    return `No domain-skills yet.

Next: navigate to a site, then $B domain-skill save with a markdown body to begin.`;
  }
  const lines = [];
  if (list.project.length > 0) {
    lines.push("Project (per-project):");
    for (const r of list.project) {
      lines.push(`  [${r.state}] ${r.host} — v${r.version}, ${r.body.length} bytes, used ${r.use_count}× (${r.flag_count} flags)`);
    }
  }
  if (list.global.length > 0) {
    if (lines.length > 0)
      lines.push("");
    lines.push("Global (cross-project):");
    for (const r of list.global) {
      lines.push(`  ${r.host} — v${r.version}, ${r.body.length} bytes`);
    }
  }
  return lines.join(`
`);
}
async function handleSave(args, bm) {
  const page = bm.getPage();
  const host = await deriveHostFromActiveTab(page);
  const body = await readBodyFromArgs(args);
  if (!body || !body.trim()) {
    throw new Error(`Save failed: empty body.
` + `Cause: no content provided via --from-file or stdin.
` + "Action: pipe markdown into $B domain-skill save, or pass --from-file <path>.");
  }
  const filterResult = runContentFilters(body, page.url(), "domain-skill-save");
  if (filterResult.blocked) {
    logTelemetry({ event: "domain_skill_save_blocked", host, reason: filterResult.message });
    throw new Error(`Save blocked: ${filterResult.message}
` + `Cause: skill body trips L1-L3 content filters (likely contains URL blocklist match or ARIA injection patterns).
` + "Action: review the body for suspicious instruction-like content; rewrite and retry.");
  }
  const slug = getCurrentProjectSlug();
  const row = await writeSkill({
    host,
    body,
    projectSlug: slug,
    source: "agent",
    classifierScore: 0
  });
  logTelemetry({ event: "domain_skill_saved", host, scope: row.scope, state: row.state, bytes: body.length });
  return formatSavedOk(row, slug);
}
async function handleList(_args) {
  const slug = getCurrentProjectSlug();
  const list = await listSkills(slug);
  return formatSkillListing(list);
}
async function handleShow(args) {
  const host = args[0];
  if (!host) {
    throw new Error(`Usage: $B domain-skill show <host>
` + `Cause: missing hostname argument.
` + "Action: $B domain-skill list to see available hosts.");
  }
  const slug = getCurrentProjectSlug();
  const result = await readSkill(host, slug);
  if (!result) {
    return `No active skill for ${host}.

A quarantined skill may exist; run $B domain-skill list to see all states.`;
  }
  return [
    `# ${result.row.host} (${result.source} scope, ${result.row.state})`,
    `# version: ${result.row.version}, used: ${result.row.use_count}×, flags: ${result.row.flag_count}`,
    "",
    result.row.body
  ].join(`
`);
}
async function handleEdit(args) {
  const host = args[0];
  if (!host) {
    throw new Error("Usage: $B domain-skill edit <host>");
  }
  const slug = getCurrentProjectSlug();
  const list = await listSkills(slug);
  const current = [...list.project, ...list.global].find((r) => r.host === host);
  if (!current) {
    throw new Error(`Cannot edit: no skill for ${host}.
` + `Cause: skill does not exist in this project or global scope.
` + "Action: $B domain-skill save to create one first.");
  }
  const editor = process.env.EDITOR || "vi";
  const tmpFile = path13.join(os10.tmpdir(), `gstack-domain-skill-${process.pid}-${Date.now()}.md`);
  await fs13.writeFile(tmpFile, current.body, "utf8");
  const result = spawnSync2(editor, [tmpFile], { stdio: "inherit" });
  if (result.status !== 0) {
    await fs13.unlink(tmpFile).catch(() => {});
    throw new Error(`Editor exited with status ${result.status}; no changes saved.`);
  }
  const newBody = await fs13.readFile(tmpFile, "utf8");
  await fs13.unlink(tmpFile).catch(() => {});
  if (newBody === current.body) {
    return `No changes for ${host}.`;
  }
  const page = global.__bm?.getPage?.();
  const row = await writeSkill({
    host: current.host,
    body: newBody,
    projectSlug: slug,
    source: "human",
    classifierScore: 0
  });
  return formatSavedOk(row, slug);
}
async function handlePromoteToGlobal(args) {
  const host = args[0];
  if (!host) {
    throw new Error("Usage: $B domain-skill promote-to-global <host>");
  }
  const slug = getCurrentProjectSlug();
  const row = await promoteToGlobal(host, slug);
  return [
    `Promoted ${row.host} to global scope (v${row.version}).`,
    `Stored at: ~/.gstack/global-domain-skills.jsonl`,
    "",
    `This skill now fires for all projects unless they have a per-project skill for the same host.`
  ].join(`
`);
}
async function handleRollback(args) {
  const host = args[0];
  if (!host) {
    throw new Error("Usage: $B domain-skill rollback <host>");
  }
  const scope = args.includes("--global") ? "global" : "project";
  const slug = getCurrentProjectSlug();
  const row = await rollbackSkill(host, slug, scope);
  return [
    `Rolled back ${row.host} (${scope} scope) to prior version.`,
    `New version: ${row.version} (content from earlier revision)`
  ].join(`
`);
}
async function handleRm(args) {
  const host = args[0];
  if (!host) {
    throw new Error("Usage: $B domain-skill rm <host> [--global]");
  }
  const scope = args.includes("--global") ? "global" : "project";
  const slug = getCurrentProjectSlug();
  await deleteSkill(host, slug, scope);
  return `Tombstoned ${host} (${scope} scope). Use $B domain-skill rollback to restore.`;
}
async function handleDomainSkillCommand(args, bm) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case "save":
      return handleSave(rest, bm);
    case "list":
      return handleList(rest);
    case "show":
      return handleShow(rest);
    case "edit":
      return handleEdit(rest);
    case "promote-to-global":
      return handlePromoteToGlobal(rest);
    case "rollback":
      return handleRollback(rest);
    case "rm":
    case "remove":
    case "delete":
      return handleRm(rest);
    case undefined:
    case "":
    case "help":
      return [
        "$B domain-skill — agent-authored per-site notes",
        "",
        "Subcommands:",
        "  save              save body from stdin or --from-file (host derived from active tab)",
        "  list              list all skills visible to current project",
        "  show <host>       print skill body",
        "  edit <host>       open in $EDITOR",
        "  promote-to-global <host>  promote active skill to global scope",
        "  rollback <host> [--global]  restore prior version",
        "  rm <host> [--global]  tombstone"
      ].join(`
`);
    default:
      throw new Error(`Unknown subcommand: ${sub}
` + `Cause: not one of save|list|show|edit|promote-to-global|rollback|rm.
` + "Action: $B domain-skill help for the full list.");
  }
}
var init_domain_skill_commands = __esm(() => {
  init_domain_skills();
  init_content_security();
  init_project_slug();
  init_telemetry();
});

// browse/src/browser-skills.ts
import * as fs14 from "fs";
import * as path14 from "path";
import * as os11 from "os";
import * as cp from "child_process";
function defaultTierPaths(opts = {}) {
  const home = opts.home ?? os11.homedir();
  const projectRoot = opts.projectRoot ?? detectProjectRoot();
  const bundledRoot = opts.bundledRoot ?? detectBundledRoot();
  return {
    project: projectRoot ? path14.join(projectRoot, ".gstack", "browser-skills") : null,
    global: path14.join(home, ".gstack", "browser-skills"),
    bundled: path14.join(bundledRoot, "browser-skills")
  };
}
function detectProjectRoot() {
  try {
    const proc = cp.spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8", timeout: 2000, windowsHide: true });
    if (proc.status === 0) {
      const out = proc.stdout.trim();
      return out || null;
    }
  } catch {}
  return null;
}
function detectBundledRoot() {
  try {
    const exec = process.execPath;
    if (exec && /\/browse\/dist\/browse$/.test(exec)) {
      return path14.resolve(path14.dirname(exec), "..", "..");
    }
  } catch {}
  return path14.resolve(__dirname, "..", "..");
}
function parseSkillFile(content, opts = {}) {
  if (!content.startsWith(`---
`)) {
    throw new Error('SKILL.md missing frontmatter block (expected starting "---\\n")');
  }
  const fmEnd = content.indexOf(`
---`, 4);
  if (fmEnd === -1) {
    throw new Error('SKILL.md frontmatter block not terminated (expected "\\n---")');
  }
  const fmText = content.slice(4, fmEnd);
  const bodyMd = content.slice(fmEnd + 4).replace(/^\n+/, "");
  const fm = parseFrontmatterFields(fmText);
  const errors = [];
  const name = fm.name ?? opts.skillName ?? "";
  if (!name)
    errors.push("missing required field: name (or skillName hint)");
  if (!fm.host)
    errors.push("missing required field: host");
  if (errors.length > 0) {
    throw new Error(`SKILL.md validation failed: ${errors.join("; ")}`);
  }
  const frontmatter = {
    name,
    description: fm.description,
    host: fm.host,
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    args: Array.isArray(fm.args) ? fm.args : [],
    trusted: fm.trusted === true,
    version: typeof fm.version === "string" ? fm.version : undefined,
    source: fm.source === "agent" || fm.source === "human" ? fm.source : undefined
  };
  return { frontmatter, bodyMd };
}
function parseFrontmatterFields(fm) {
  const result = {};
  const lines = fm.split(`
`);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const scalar = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (scalar && !line.startsWith(" ")) {
      const key = scalar[1];
      const rawVal = scalar[2];
      if (!rawVal) {
        const nextNonBlank = findNextNonBlank(lines, i + 1);
        if (nextNonBlank !== -1 && lines[nextNonBlank].match(/^\s+-\s/)) {
          if (key === "args") {
            const { items, consumed } = collectArgsList(lines, i + 1);
            result[key] = items;
            i += 1 + consumed;
          } else {
            const { items, consumed } = collectStringList(lines, i + 1);
            result[key] = items;
            i += 1 + consumed;
          }
          continue;
        }
        i++;
        continue;
      }
      if (rawVal === "[]") {
        result[key] = [];
        i++;
        continue;
      }
      result[key] = parseScalar(rawVal);
      i++;
      continue;
    }
    i++;
  }
  return result;
}
function findNextNonBlank(lines, from) {
  for (let i = from;i < lines.length; i++) {
    if (lines[i].trim())
      return i;
  }
  return -1;
}
function collectStringList(lines, from) {
  const items = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const m = line.match(/^\s+-\s+(.*)$/);
    if (!m)
      break;
    items.push(stripQuotes(m[1]));
    i++;
  }
  return { items, consumed: i - from };
}
function collectArgsList(lines, from) {
  const items = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const itemStart = line.match(/^(\s+)-\s+(.+?):\s*(.*)$/);
    if (!itemStart)
      break;
    const indent = itemStart[1] + "  ";
    const arg = { name: "" };
    if (itemStart[2] === "name") {
      arg.name = stripQuotes(itemStart[3]);
    } else if (itemStart[2] === "description") {
      arg.description = stripQuotes(itemStart[3]);
    }
    i++;
    while (i < lines.length) {
      const cont = lines[i];
      if (!cont.startsWith(indent) || !cont.trim())
        break;
      const kv = cont.match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (!kv)
        break;
      if (kv[1] === "name")
        arg.name = stripQuotes(kv[2]);
      else if (kv[1] === "description")
        arg.description = stripQuotes(kv[2]);
      i++;
    }
    items.push(arg);
  }
  return { items, consumed: i - from };
}
function parseScalar(raw) {
  const v = raw.trim();
  if (v === "true")
    return true;
  if (v === "false")
    return false;
  if (/^-?\d+$/.test(v))
    return parseInt(v, 10);
  return stripQuotes(v);
}
function stripQuotes(v) {
  const trimmed = v.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
function listBrowserSkills(tiers) {
  const t = tiers ?? defaultTierPaths();
  const seen = new Map;
  const order = [
    { tier: "project", root: t.project },
    { tier: "global", root: t.global },
    { tier: "bundled", root: t.bundled }
  ];
  for (const { tier, root } of order) {
    if (!root || !fs14.existsSync(root))
      continue;
    let entries;
    try {
      entries = fs14.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === ".tombstones")
        continue;
      if (seen.has(entry))
        continue;
      const dir = path14.join(root, entry);
      let stat;
      try {
        stat = fs14.statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory())
        continue;
      const skillFile = path14.join(dir, "SKILL.md");
      if (!fs14.existsSync(skillFile))
        continue;
      try {
        const content = fs14.readFileSync(skillFile, "utf-8");
        const { frontmatter, bodyMd } = parseSkillFile(content, { skillName: entry });
        seen.set(entry, { name: entry, tier, dir, frontmatter, bodyMd });
      } catch {
        continue;
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}
function readBrowserSkill(name, tiers) {
  const t = tiers ?? defaultTierPaths();
  const order = [
    { tier: "project", root: t.project },
    { tier: "global", root: t.global },
    { tier: "bundled", root: t.bundled }
  ];
  for (const { tier, root } of order) {
    if (!root)
      continue;
    const dir = path14.join(root, name);
    const skillFile = path14.join(dir, "SKILL.md");
    if (!fs14.existsSync(skillFile))
      continue;
    try {
      const content = fs14.readFileSync(skillFile, "utf-8");
      const { frontmatter, bodyMd } = parseSkillFile(content, { skillName: name });
      return { name, tier, dir, frontmatter, bodyMd };
    } catch {
      continue;
    }
  }
  return null;
}
function tombstoneBrowserSkill(name, tier, tiers) {
  const t = tiers ?? defaultTierPaths();
  const root = tier === "project" ? t.project : t.global;
  if (!root) {
    throw new Error(`tombstoneBrowserSkill: tier "${tier}" has no resolved path`);
  }
  const src = path14.join(root, name);
  if (!fs14.existsSync(src)) {
    throw new Error(`tombstoneBrowserSkill: skill "${name}" not found in tier "${tier}" at ${src}`);
  }
  const tombstoneDir = path14.join(root, ".tombstones");
  fs14.mkdirSync(tombstoneDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = path14.join(tombstoneDir, `${name}-${ts}`);
  fs14.renameSync(src, dst);
  return dst;
}
var __dirname = "/private/tmp/gstack-install/browse/src";
var init_browser_skills = () => {};

// browse/src/token-registry.ts
import * as crypto3 from "crypto";
function assertValidTokenOptions(scopes, rateLimit) {
  const validScopes = ["read", "write", "admin", "meta", "control"];
  for (const s of scopes) {
    if (!validScopes.includes(s)) {
      throw new InvalidScopeError(`Invalid scope: ${s}. Valid: ${validScopes.join(", ")}`);
    }
  }
  if (rateLimit < 0)
    throw new InvalidScopeError("rateLimit must be >= 0");
}
function assertValidClientId(clientId) {
  if (typeof clientId !== "string" || clientId.trim() === "") {
    throw new ReservedClientIdError("clientId must be a non-empty string");
  }
  if (clientId.trim().toLowerCase() === "root") {
    throw new ReservedClientIdError("clientId 'root' is reserved");
  }
}
function checkRateLimit(clientId, limit) {
  if (limit <= 0)
    return { allowed: true };
  const now = Date.now();
  const bucket = rateBuckets.get(clientId);
  if (!bucket || now - bucket.windowStart >= 1000) {
    rateBuckets.set(clientId, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (bucket.count >= limit) {
    const retryAfterMs = 1000 - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 100) };
  }
  bucket.count++;
  return { allowed: true };
}
function initRegistry(root) {
  if (rootToken !== "" && rootToken !== root) {
    throw new Error("token-registry already initialized with a different token; " + "embedders must call buildFetchHandler before any registry-mutating code path");
  }
  rootToken = root;
}
function isRootToken(token) {
  if (!rootToken)
    return false;
  const tokenBytes = Buffer.byteLength(token, "utf8");
  const rootBytes = Buffer.byteLength(rootToken, "utf8");
  if (tokenBytes !== rootBytes)
    return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(rootToken, "utf8");
  return crypto3.timingSafeEqual(a, b);
}
function generateToken(prefix) {
  return `${prefix}${crypto3.randomBytes(24).toString("hex")}`;
}
function createToken(opts) {
  const {
    clientId,
    scopes = ["read", "write"],
    domains,
    tabPolicy = "own-only",
    rateLimit = 10,
    expiresSeconds = 86400
  } = opts;
  assertValidClientId(clientId);
  assertValidTokenOptions(scopes, rateLimit);
  if (expiresSeconds !== null && expiresSeconds !== undefined && expiresSeconds < 0) {
    throw new Error("expiresSeconds must be >= 0 or null");
  }
  const token = generateToken("gsk_sess_");
  const now = new Date;
  const expiresAt = expiresSeconds === null ? null : new Date(now.getTime() + expiresSeconds * 1000).toISOString();
  const info = {
    token,
    clientId,
    type: "session",
    scopes,
    domains,
    tabPolicy,
    rateLimit,
    expiresAt,
    createdAt: now.toISOString(),
    commandCount: 0
  };
  for (const [t, existing] of tokens) {
    if (existing.clientId === clientId && existing.type === "session") {
      tokens.delete(t);
      break;
    }
  }
  tokens.set(token, info);
  return info;
}
function createSetupKey(opts) {
  if (opts.clientId !== undefined)
    assertValidClientId(opts.clientId);
  const scopes = opts.scopes || ["read", "write"];
  const rateLimit = opts.rateLimit ?? 10;
  assertValidTokenOptions(scopes, rateLimit);
  const token = generateToken("gsk_setup_");
  const now = new Date;
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const info = {
    token,
    clientId: opts.clientId || `remote-${Date.now()}`,
    type: "setup",
    scopes,
    domains: opts.domains,
    tabPolicy: opts.tabPolicy || "own-only",
    rateLimit,
    expiresAt,
    createdAt: now.toISOString(),
    usesRemaining: 1,
    commandCount: 0
  };
  tokens.set(token, info);
  return info;
}
function exchangeSetupKey(setupKey, sessionExpiresSeconds) {
  const setup = tokens.get(setupKey);
  if (!setup)
    return null;
  if (setup.type !== "setup")
    return null;
  if (setup.expiresAt && new Date(setup.expiresAt) < new Date) {
    tokens.delete(setupKey);
    return null;
  }
  if (setup.usesRemaining === 0) {
    if (setup.issuedSessionToken) {
      const existing = tokens.get(setup.issuedSessionToken);
      if (existing && existing.commandCount === 0) {
        return existing;
      }
    }
    return null;
  }
  setup.usesRemaining = 0;
  const session = createToken({
    clientId: setup.clientId,
    scopes: setup.scopes,
    domains: setup.domains,
    tabPolicy: setup.tabPolicy,
    rateLimit: setup.rateLimit,
    expiresSeconds: sessionExpiresSeconds ?? 86400
  });
  setup.issuedSessionToken = session.token;
  return session;
}
function validateToken(token) {
  if (isRootToken(token)) {
    return {
      token: rootToken,
      clientId: "root",
      type: "session",
      scopes: ["read", "write", "admin", "meta", "control"],
      tabPolicy: "shared",
      rateLimit: 0,
      expiresAt: null,
      createdAt: "",
      commandCount: 0
    };
  }
  const info = tokens.get(token);
  if (!info)
    return null;
  if (info.expiresAt && new Date(info.expiresAt) < new Date) {
    tokens.delete(token);
    return null;
  }
  return info;
}
function checkScope(info, command) {
  if (info.clientId === "root")
    return true;
  if (command === "chain" && info.scopes.includes("meta"))
    return true;
  for (const scope of info.scopes) {
    if (SCOPE_MAP[scope]?.has(command))
      return true;
  }
  return false;
}
function checkDomain(info, url) {
  if (info.clientId === "root")
    return true;
  if (!info.domains || info.domains.length === 0)
    return true;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    for (const pattern of info.domains) {
      if (matchDomainGlob(hostname, pattern))
        return true;
    }
    return false;
  } catch {
    return false;
  }
}
function matchDomainGlob(hostname, pattern) {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) || hostname === pattern.slice(2);
  }
  return hostname === pattern;
}
function checkRate(info) {
  if (info.clientId === "root")
    return { allowed: true };
  return checkRateLimit(info.clientId, info.rateLimit);
}
function recordCommand(token) {
  const info = tokens.get(token);
  if (info)
    info.commandCount++;
}
function revokeToken(clientId) {
  let deleted = 0;
  for (const [token, info] of tokens) {
    if (info.clientId === clientId) {
      tokens.delete(token);
      deleted++;
    }
  }
  if (deleted > 0)
    rateBuckets.delete(clientId);
  return deleted;
}
function revokeSetupKeys(clientId) {
  let deleted = 0;
  for (const [token, info] of tokens) {
    if (info.clientId === clientId && info.type === "setup" && info.usesRemaining !== 0) {
      tokens.delete(token);
      deleted++;
    }
  }
  return deleted;
}
function getClientSession(clientId) {
  const now = new Date;
  for (const info of tokens.values()) {
    if (info.clientId !== clientId || info.type !== "session")
      continue;
    if (info.expiresAt && new Date(info.expiresAt) < now)
      continue;
    return info;
  }
  return null;
}
function grantReducesAccess(prior, grant) {
  return scopesReduced(prior.scopes, grant.scopes) || domainsReduced(prior.domains, grant.domains) || rateReduced(prior.rateLimit, grant.rateLimit) || tabPolicyReduced(prior.tabPolicy, grant.tabPolicy);
}
function scopesReduced(prior, next) {
  return prior.some((s) => !next.includes(s));
}
function domainsReduced(prior, next) {
  const priorUnrestricted = !prior || prior.length === 0;
  const nextUnrestricted = !next || next.length === 0;
  if (priorUnrestricted)
    return !nextUnrestricted;
  if (nextUnrestricted)
    return false;
  return prior.some((p) => !next.some((n) => domainGlobCovers(n, p)));
}
function domainGlobCovers(wide, narrow) {
  if (wide === narrow)
    return true;
  const wideGlob = wide.startsWith("*.");
  if (wideGlob) {
    const wideSuffix = wide.slice(1);
    const wideApex = wide.slice(2);
    if (!narrow.startsWith("*.")) {
      return narrow === wideApex || narrow.endsWith(wideSuffix);
    }
    const narrowApex = narrow.slice(2);
    return narrowApex === wideApex || narrowApex.endsWith(wideSuffix);
  }
  return false;
}
function rateReduced(prior, next) {
  const priorUnlimited = prior <= 0;
  const nextUnlimited = next <= 0;
  if (priorUnlimited)
    return !nextUnlimited;
  if (nextUnlimited)
    return false;
  return next < prior;
}
function tabPolicyReduced(prior, next) {
  return prior === "shared" && next === "own-only";
}
function listTokens(opts) {
  const now = new Date;
  const result = [];
  for (const [token, info] of tokens) {
    if (info.expiresAt && new Date(info.expiresAt) < now) {
      tokens.delete(token);
      continue;
    }
    if (info.type === "session") {
      result.push(info);
    } else if (opts?.includeSetup && info.type === "setup" && info.usesRemaining !== 0) {
      result.push(info);
    }
  }
  return result;
}
function checkConnectRateLimit() {
  const now = Date.now();
  connectAttempts = connectAttempts.filter((a) => now - a.ts < CONNECT_WINDOW_MS);
  if (connectAttempts.length >= CONNECT_RATE_LIMIT)
    return false;
  connectAttempts.push({ ts: now });
  return true;
}
var SCOPE_READ, SCOPE_WRITE, SCOPE_ADMIN, SCOPE_CONTROL, SCOPE_META, SCOPE_MAP, DEFAULT_PAIR_SCOPES, InvalidScopeError, ReservedClientIdError, rateBuckets, tokens, rootToken = "", connectAttempts, CONNECT_RATE_LIMIT = 300, CONNECT_WINDOW_MS = 60000;
var init_token_registry = __esm(() => {
  SCOPE_READ = new Set([
    "snapshot",
    "text",
    "html",
    "links",
    "forms",
    "accessibility",
    "console",
    "network",
    "perf",
    "dialog",
    "is",
    "inspect",
    "url",
    "tabs",
    "status",
    "screenshot",
    "pdf",
    "css",
    "attrs",
    "media",
    "data"
  ]);
  SCOPE_WRITE = new Set([
    "goto",
    "back",
    "forward",
    "reload",
    "load-html",
    "click",
    "fill",
    "select",
    "hover",
    "type",
    "press",
    "scroll",
    "wait",
    "upload",
    "viewport",
    "newtab",
    "closetab",
    "dialog-accept",
    "dialog-dismiss",
    "download",
    "scrape",
    "archive"
  ]);
  SCOPE_ADMIN = new Set([
    "eval",
    "js",
    "cookies",
    "storage",
    "cookie",
    "cookie-import",
    "cookie-import-browser",
    "header",
    "useragent",
    "style",
    "cleanup",
    "prettyscreenshot"
  ]);
  SCOPE_CONTROL = new Set([
    "state",
    "handoff",
    "resume",
    "stop",
    "restart",
    "connect",
    "disconnect"
  ]);
  SCOPE_META = new Set([
    "tab",
    "diff",
    "frame",
    "responsive",
    "snapshot",
    "watch",
    "inbox",
    "focus"
  ]);
  SCOPE_MAP = {
    read: SCOPE_READ,
    write: SCOPE_WRITE,
    admin: SCOPE_ADMIN,
    control: SCOPE_CONTROL,
    meta: SCOPE_META
  };
  DEFAULT_PAIR_SCOPES = ["read", "write", "admin", "meta"];
  InvalidScopeError = class InvalidScopeError extends Error {
  };
  ReservedClientIdError = class ReservedClientIdError extends Error {
  };
  rateBuckets = new Map;
  tokens = new Map;
  connectAttempts = [];
});

// browse/src/skill-token.ts
import * as crypto4 from "crypto";
function generateSpawnId() {
  return crypto4.randomBytes(8).toString("hex");
}
function skillClientId(skillName, spawnId) {
  return `skill:${skillName}:${spawnId}`;
}
function mintSkillToken(opts) {
  const clientId = skillClientId(opts.skillName, opts.spawnId);
  return createToken({
    clientId,
    scopes: opts.scopes ?? DEFAULT_SKILL_SCOPES,
    tabPolicy: "shared",
    rateLimit: 0,
    expiresSeconds: opts.spawnTimeoutSeconds + TOKEN_TTL_SLACK
  });
}
function revokeSkillToken(skillName, spawnId) {
  return Boolean(revokeToken(skillClientId(skillName, spawnId)));
}
var TOKEN_TTL_SLACK = 30, DEFAULT_SKILL_SCOPES;
var init_skill_token = __esm(() => {
  init_token_registry();
  DEFAULT_SKILL_SCOPES = ["read", "write"];
});

// browse/src/browser-skill-commands.ts
import * as fs15 from "fs";
import * as os12 from "os";
import * as path15 from "path";
async function handleSkillCommand(args, ctx) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case undefined:
    case "help":
    case "--help":
      return formatUsage();
    case "list":
      return handleList2(ctx);
    case "show":
      return handleShow2(rest, ctx);
    case "run":
      return handleRun(rest, ctx);
    case "test":
      return handleTest(rest, ctx);
    case "rm":
      return handleRm2(rest, ctx);
    default:
      throw new Error(`Unknown skill subcommand: "${sub}". Try: list, show, run, test, rm.`);
  }
}
function formatUsage() {
  return [
    "Usage: $B skill <subcommand>",
    "",
    "  list                                  List all skills with resolved tier",
    "  show <name>                           Print SKILL.md",
    "  run <name> [--arg k=v]... [--timeout=Ns]   Run the skill script",
    "  test <name>                           Run script.test.ts",
    "  rm <name> [--global]                  Tombstone a user-tier skill"
  ].join(`
`);
}
function handleList2(ctx) {
  const tiers = ctx.tiers ?? defaultTierPaths();
  const skills = listBrowserSkills(tiers);
  if (skills.length === 0) {
    return `No browser-skills found.

Try: $B skill show <name>  (none right now)
`;
  }
  const lines = ["NAME                          TIER     HOST                        DESC"];
  for (const s of skills) {
    const desc = (s.frontmatter.description ?? "").slice(0, 40);
    lines.push([
      s.name.padEnd(30),
      s.tier.padEnd(8),
      s.frontmatter.host.padEnd(28),
      desc
    ].join(" "));
  }
  return lines.join(`
`) + `
`;
}
function handleShow2(args, ctx) {
  const name = args[0];
  if (!name)
    throw new Error("Usage: $B skill show <name>");
  const tiers = ctx.tiers ?? defaultTierPaths();
  const skill = readBrowserSkill(name, tiers);
  if (!skill)
    throw new Error(`Skill "${name}" not found in any tier.`);
  return readFile(path15.join(skill.dir, "SKILL.md"));
}
function readFile(p) {
  return fs15.readFileSync(p, "utf-8");
}
function parseSkillRunArgs(args) {
  const passthrough = [];
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--timeout=")) {
      const n = parseInt(a.slice("--timeout=".length), 10);
      if (!isNaN(n) && n > 0)
        timeoutSeconds = n;
      continue;
    }
    passthrough.push(a);
  }
  return { passthrough, timeoutSeconds };
}
async function handleRun(args, ctx) {
  const name = args[0];
  if (!name)
    throw new Error("Usage: $B skill run <name> [--arg k=v]... [--timeout=Ns]");
  const tiers = ctx.tiers ?? defaultTierPaths();
  const skill = readBrowserSkill(name, tiers);
  if (!skill)
    throw new Error(`Skill "${name}" not found.`);
  const { passthrough, timeoutSeconds } = parseSkillRunArgs(args.slice(1));
  const result = await spawnSkill({
    skill,
    skillArgs: passthrough,
    trusted: skill.frontmatter.trusted,
    timeoutSeconds,
    port: ctx.port
  });
  if (result.exitCode !== 0 || result.timedOut || result.truncated) {
    const summary = result.truncated ? `truncated stdout at ${MAX_STDOUT_BYTES} bytes` : result.timedOut ? `timed out after ${timeoutSeconds}s` : `exit ${result.exitCode}`;
    const err = new Error(`Skill "${name}" failed: ${summary}
--- stderr ---
${result.stderr.slice(0, 4096)}`);
    err.exitCode = result.exitCode || 1;
    throw err;
  }
  return result.stdout;
}
async function handleTest(args, ctx) {
  const name = args[0];
  if (!name)
    throw new Error("Usage: $B skill test <name>");
  const tiers = ctx.tiers ?? defaultTierPaths();
  const skill = readBrowserSkill(name, tiers);
  if (!skill)
    throw new Error(`Skill "${name}" not found.`);
  const testFile = path15.join(skill.dir, "script.test.ts");
  if (!fs15.existsSync(testFile)) {
    throw new Error(`Skill "${name}" has no script.test.ts at ${testFile}`);
  }
  const { stdout, stderr, exitCode } = await runToFiles(["bun", "test", testFile], {
    cwd: skill.dir,
    env: process.env
  });
  if (exitCode !== 0) {
    throw new Error(`Skill "${name}" tests failed (exit ${exitCode}).
${stderr || stdout}`);
  }
  const report = (stdout + stderr).trim();
  if (!report) {
    throw new Error(`Skill "${name}" tests exited 0 but produced no output — the run was not captured.`);
  }
  return report + `
`;
}
async function runToFiles(cmd, opts) {
  const dir = fs15.mkdtempSync(path15.join(os12.tmpdir(), "gstack-skill-"));
  const outPath = path15.join(dir, "stdout");
  const errPath = path15.join(dir, "stderr");
  try {
    const proc = Bun.spawn(cmd, {
      windowsHide: true,
      cwd: opts.cwd,
      env: opts.env,
      stdout: Bun.file(outPath),
      stderr: Bun.file(errPath)
    });
    let timedOut = false;
    const killer = opts.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
    }, opts.timeoutMs);
    const exitCode = await proc.exited;
    if (killer !== undefined)
      clearTimeout(killer);
    const cap = opts.maxStdoutBytes ?? Infinity;
    const stdout = readCappedFile(outPath, cap);
    const stderr = readCappedFile(errPath, cap);
    return {
      stdout: stdout.text,
      stderr: stderr.text,
      exitCode: timedOut ? 124 : exitCode,
      timedOut,
      truncated: stdout.truncated
    };
  } finally {
    fs15.rmSync(dir, { recursive: true, force: true });
  }
}
function readCappedFile(p, capBytes) {
  const size = fs15.statSync(p).size;
  if (size <= capBytes)
    return { text: fs15.readFileSync(p, "utf-8"), truncated: false };
  const fd = fs15.openSync(p, "r");
  try {
    const buf = Buffer.alloc(capBytes);
    const read = fs15.readSync(fd, buf, 0, capBytes, 0);
    return { text: buf.subarray(0, read).toString("utf-8"), truncated: true };
  } finally {
    try {
      fs15.closeSync(fd);
    } catch {}
  }
}
function handleRm2(args, ctx) {
  const name = args[0];
  if (!name)
    throw new Error("Usage: $B skill rm <name> [--global]");
  const isGlobal = args.includes("--global");
  const tier = isGlobal ? "global" : "project";
  const tiers = ctx.tiers ?? defaultTierPaths();
  const effectiveTier = tier === "project" && !tiers.project ? "global" : tier;
  const dst = tombstoneBrowserSkill(name, effectiveTier, tiers);
  return `Tombstoned "${name}" (${effectiveTier} tier) → ${dst}
`;
}
async function spawnSkill(opts) {
  const spawnId = generateSpawnId();
  const tokenInfo = mintSkillToken({
    skillName: opts.skill.name,
    spawnId,
    spawnTimeoutSeconds: opts.timeoutSeconds
  });
  try {
    const env = buildSpawnEnv({
      trusted: opts.trusted,
      port: opts.port,
      skillToken: tokenInfo.token
    });
    const scriptPath = path15.join(opts.skill.dir, "script.ts");
    if (!fs15.existsSync(scriptPath)) {
      throw new Error(`Skill "${opts.skill.name}" missing script.ts at ${scriptPath}`);
    }
    return await runToFiles(["bun", "run", scriptPath, "--", ...opts.skillArgs], {
      cwd: opts.skill.dir,
      env,
      timeoutMs: opts.timeoutSeconds * 1000,
      maxStdoutBytes: MAX_STDOUT_BYTES
    });
  } finally {
    revokeSkillToken(opts.skill.name, spawnId);
  }
}
function buildSpawnEnv(opts) {
  const out = {};
  if (opts.trusted) {
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined)
        continue;
      if (k === "GSTACK_TOKEN")
        continue;
      out[k] = v;
    }
    if (!out.PATH)
      out.PATH = "/usr/local/bin:/usr/bin:/bin";
  } else {
    for (const k of UNTRUSTED_ALLOWLIST) {
      const v = process.env[k];
      if (v !== undefined)
        out[k] = v;
    }
    out.PATH = resolveMinimalPath();
  }
  if (!opts.trusted) {
    for (const k of Object.keys(out)) {
      if (SECRET_KEY_PATTERNS.some((p) => p.test(k)))
        delete out[k];
    }
  }
  out.GSTACK_PORT = String(opts.port);
  out.GSTACK_SKILL_TOKEN = opts.skillToken;
  return out;
}
function resolveMinimalPath() {
  const fallback = "/usr/local/bin:/usr/bin:/bin";
  const bunPath = process.execPath;
  if (bunPath && bunPath.includes("/bun")) {
    const dir = path15.dirname(bunPath);
    return `${dir}:${fallback}`;
  }
  return fallback;
}
var DEFAULT_TIMEOUT_SECONDS = 60, MAX_STDOUT_BYTES, SECRET_KEY_PATTERNS, UNTRUSTED_ALLOWLIST;
var init_browser_skill_commands = __esm(() => {
  init_browser_skills();
  init_skill_token();
  MAX_STDOUT_BYTES = 1024 * 1024;
  SECRET_KEY_PATTERNS = [
    /TOKEN/i,
    /KEY/i,
    /SECRET/i,
    /PASSWORD/i,
    /CREDENTIAL/i,
    /^AWS_/,
    /^AZURE_/,
    /^GCP_/,
    /^GOOGLE_APPLICATION_/,
    /^ANTHROPIC_/,
    /^OPENAI_/,
    /^GITHUB_/,
    /^GH_/,
    /^SSH_/,
    /^GPG_/,
    /^NPM_TOKEN/,
    /^PYPI_/
  ];
  UNTRUSTED_ALLOWLIST = new Set([
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "TZ"
  ]);
});

// browse/src/session-persist.ts
import * as fs16 from "fs";
function quarantineCorrupt(filePath) {
  try {
    fs16.renameSync(filePath, `${filePath}.corrupt`);
  } catch {
    safeUnlinkQuiet(filePath);
  }
}
function isSessionPersistEnabled(env = process.env) {
  return env.BROWSE_PERSIST_STATE === "1";
}
function sessionPersistIntervalMs(env = process.env) {
  const parsed = parseInt(env.BROWSE_PERSIST_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}
function serializeSessionState(state) {
  return JSON.stringify({
    version: SESSION_STATE_VERSION,
    savedAt: new Date().toISOString(),
    cookies: state.cookies,
    pages: state.pages.map((p) => ({
      url: p.url,
      isActive: p.isActive,
      storage: p.storage
    }))
  }, null, 2);
}
function isInternalCookieDomain(domain) {
  const d = domain.startsWith(".") ? domain.slice(1) : domain;
  if (d === "localhost" || d.endsWith(".internal"))
    return true;
  if (d === "::1" || d === "[::1]")
    return true;
  if (/^127\./.test(d))
    return true;
  if (/^169\.254\./.test(d))
    return true;
  return false;
}
function filterSessionCookies(cookies) {
  return cookies.filter((c) => {
    if (typeof c !== "object" || !c)
      return false;
    if (typeof c.name !== "string" || typeof c.value !== "string")
      return false;
    if (typeof c.domain !== "string" || !c.domain)
      return false;
    return !isInternalCookieDomain(c.domain);
  });
}
function deserializeSessionState(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || data.version !== SESSION_STATE_VERSION)
    return null;
  if (!Array.isArray(data.cookies) || !Array.isArray(data.pages))
    return null;
  return {
    cookies: filterSessionCookies(data.cookies),
    pages: data.pages.map((p) => ({
      url: typeof p?.url === "string" ? p.url : "",
      isActive: Boolean(p?.isActive),
      storage: p?.storage && typeof p.storage === "object" ? {
        localStorage: typeof p.storage.localStorage === "object" && p.storage.localStorage ? p.storage.localStorage : {},
        sessionStorage: typeof p.storage.sessionStorage === "object" && p.storage.sessionStorage ? p.storage.sessionStorage : {}
      } : null
    }))
  };
}
async function persistSessionState(bm, filePath) {
  if (bm.getConnectionMode() !== "launched")
    return;
  const state = await bm.saveState();
  const tmpPath = `${filePath}.tmp`;
  writeSecureFile(tmpPath, serializeSessionState(state));
  try {
    fs16.renameSync(tmpPath, filePath);
  } catch (err) {
    safeUnlinkQuiet(tmpPath);
    throw err;
  }
}
async function restoreSessionState(bm, filePath) {
  let raw;
  try {
    raw = fs16.readFileSync(filePath, "utf-8");
  } catch (err) {
    if (err?.code === "ENOENT")
      return null;
    throw err;
  }
  const state = deserializeSessionState(raw);
  if (!state) {
    console.warn(`[browse] SESSION_STATE_INVALID: corrupt ${filePath} moved to .corrupt; starting fresh`);
    quarantineCorrupt(filePath);
    return null;
  }
  await bm.closeAllPages();
  await bm.restoreState(state);
  return state;
}
var SESSION_STATE_FILE = "session-state.json", SESSION_STATE_VERSION = 1;
var init_session_persist = __esm(() => {
  init_file_permissions();
  init_error_handling2();
});

// browse/src/cdp-commands.ts
function parseQualified(name) {
  const idx = name.indexOf(".");
  if (idx <= 0 || idx === name.length - 1) {
    throw new Error(`Usage: $B cdp <Domain.method> [json-params]
` + `Cause: '${name}' is not in Domain.method format.
` + "Action: e.g. $B cdp Accessibility.getFullAXTree {}");
  }
  return { domain: name.slice(0, idx), method: name.slice(idx + 1) };
}
async function handleCdpCommand(args, bm) {
  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    return [
      "$B cdp — raw CDP method dispatch (deny-default escape hatch)",
      "",
      "Usage: $B cdp <Domain.method> [json-params]",
      "",
      "Allowed methods are listed in browse/src/cdp-allowlist.ts. To add one,",
      "open a PR with a one-line justification and the (scope, output) tags.",
      "Examples:",
      "  $B cdp Accessibility.getFullAXTree {}",
      "  $B cdp Performance.getMetrics {}",
      `  $B cdp DOM.describeNode '{"backendNodeId":42,"depth":3}'`
    ].join(`
`);
  }
  const qualified = args[0];
  const { domain, method } = parseQualified(qualified);
  let params = {};
  if (args[1]) {
    try {
      params = JSON.parse(args[1]) ?? {};
    } catch (e) {
      throw new Error(`Cannot parse params as JSON: ${e.message}
` + `Cause: argument '${args[1]}' is not valid JSON.
` + `Action: pass a JSON object literal, e.g. '{"backendNodeId":42}'.`);
    }
  }
  const tabId = bm.getActiveTabId();
  const { raw, entry } = await dispatchCdpCall({ domain, method, params, tabId, bm });
  const json = JSON.stringify(raw, null, 2);
  if (entry.output === "untrusted") {
    return wrapUntrustedContent(json, `cdp:${qualified}`);
  }
  return json;
}
var init_cdp_commands = __esm(() => {
  init_cdp_bridge();
  init_commands();
});

// browse/src/memory-snapshot.ts
function formatBytes(n) {
  if (n < 1024)
    return `${n} B`;
  if (n < 1024 * 1024)
    return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// browse/src/memory-command.ts
function collectStructureStats() {
  return {
    modificationHistory: getModificationHistoryStats(),
    activitySubscribers: getSubscriberCount(),
    inspectorSubscribers: getInspectorSubscriberCount(),
    consoleBufferLen: consoleBuffer.length,
    networkBufferLen: networkBuffer.length,
    dialogBufferLen: dialogBuffer.length,
    captureBufferBytes: getCaptureBuffer().byteSize
  };
}
function formatSnapshotText(s) {
  const lines = [];
  lines.push(`Bun server:        RSS: ${formatBytes(s.bunServer.rss)}  ` + `heap: ${formatBytes(s.bunServer.heapUsed)} / ${formatBytes(s.bunServer.heapTotal)}  ` + `external: ${formatBytes(s.bunServer.external)}`);
  if (s.processes && s.processes.length > 0) {
    const byType = {};
    for (const p of s.processes)
      byType[p.type] = (byType[p.type] ?? 0) + 1;
    const typeSummary = Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(" ");
    lines.push(`Chromium processes: ${s.processes.length} total  (${typeSummary})`);
  } else if (s.processes === null) {
    lines.push("Chromium processes: (unavailable — see notes)");
  } else {
    lines.push("Chromium processes: 0");
  }
  if (s.tabs.length > 0) {
    const sorted = [...s.tabs].sort((a, b) => b.jsHeapUsed - a.jsHeapUsed);
    const shown = sorted.slice(0, 10);
    lines.push(`Renderers:         ${s.tabs.length} tabs (top by JS heap):`);
    for (const t of shown) {
      const urlShort = t.url.length > 80 ? t.url.slice(0, 77) + "..." : t.url;
      lines.push(`  [${formatBytes(t.jsHeapUsed).padStart(8)} JS, ` + `${String(t.nodes).padStart(6)} nodes, ` + `${String(t.listeners).padStart(5)} listeners] ` + `tab #${t.id} — ${urlShort}`);
    }
    if (sorted.length > shown.length) {
      lines.push(`  ...and ${sorted.length - shown.length} more`);
    }
  } else {
    lines.push("Renderers:         (no tabs tracked)");
  }
  lines.push("─────────────────────────────────────────────────");
  lines.push("In-memory structures (Bun side):");
  const m = s.structures.modificationHistory;
  lines.push(`  modificationHistory:    ${m.current} / ${m.cap} entries` + (m.evicted > 0 ? `  (${m.evicted} evicted since reset)` : ""));
  lines.push(`  inspectorSubscribers:   ${s.structures.inspectorSubscribers}`);
  lines.push(`  activitySubscribers:    ${s.structures.activitySubscribers}`);
  lines.push(`  consoleBuffer:          ${s.structures.consoleBufferLen} entries`);
  lines.push(`  networkBuffer:          ${s.structures.networkBufferLen} entries`);
  lines.push(`  dialogBuffer:           ${s.structures.dialogBufferLen} entries`);
  lines.push(`  captureBuffer:          ${formatBytes(s.structures.captureBufferBytes)}`);
  if (s.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const n of s.notes)
      lines.push(`  - ${n}`);
  }
  return lines.join(`
`);
}
async function handleMemoryCommand(args, bm) {
  const jsonMode = args.includes("--json");
  const structures = collectStructureStats();
  const snapshot = await bm.getMemorySnapshot(structures);
  if (jsonMode)
    return JSON.stringify(snapshot);
  return formatSnapshotText(snapshot);
}
async function buildMemorySnapshotJson(bm) {
  const structures = collectStructureStats();
  return bm.getMemorySnapshot(structures);
}
var init_memory_command = __esm(() => {
  init_cdp_inspector();
  init_activity();
  init_server();
  init_buffers();
  init_network_capture();
});

// browse/src/meta-commands.ts
import * as Diff2 from "diff";
import * as fs17 from "fs";
import * as path16 from "path";
function tokenizePipeSegment(segment) {
  const tokens = [];
  let current = "";
  let inQuote = false;
  for (let i = 0;i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current)
    tokens.push(current);
  return tokens;
}
function parsePdfArgs(args) {
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--from-file") {
      const payloadPath = args[++i];
      if (!payloadPath)
        throw new Error("pdf: --from-file requires a path");
      return parsePdfFromFile(payloadPath);
    }
  }
  const result = {
    output: `${TEMP_DIR}/browse-page.pdf`
  };
  let margins;
  const positional = [];
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a === "--format") {
      result.format = requireValue(args, ++i, "format");
    } else if (a === "--page-size") {
      result.format = requireValue(args, ++i, "page-size");
    } else if (a === "--width") {
      result.width = requireValue(args, ++i, "width");
    } else if (a === "--height") {
      result.height = requireValue(args, ++i, "height");
    } else if (a === "--margins") {
      margins = requireValue(args, ++i, "margins");
    } else if (a === "--margin-top") {
      result.marginTop = requireValue(args, ++i, "margin-top");
    } else if (a === "--margin-right") {
      result.marginRight = requireValue(args, ++i, "margin-right");
    } else if (a === "--margin-bottom") {
      result.marginBottom = requireValue(args, ++i, "margin-bottom");
    } else if (a === "--margin-left") {
      result.marginLeft = requireValue(args, ++i, "margin-left");
    } else if (a === "--header-template") {
      result.headerTemplate = requireValue(args, ++i, "header-template");
    } else if (a === "--footer-template") {
      result.footerTemplate = requireValue(args, ++i, "footer-template");
    } else if (a === "--page-numbers") {
      result.pageNumbers = true;
    } else if (a === "--tagged") {
      result.tagged = true;
    } else if (a === "--outline") {
      result.outline = true;
    } else if (a === "--print-background") {
      result.printBackground = true;
    } else if (a === "--prefer-css-page-size") {
      result.preferCSSPageSize = true;
    } else if (a === "--toc") {
      result.toc = true;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown pdf flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  if (positional.length > 0)
    result.output = positional[0];
  if (margins !== undefined) {
    if (result.marginTop || result.marginRight || result.marginBottom || result.marginLeft) {
      throw new Error("pdf: --margins is mutex with --margin-top/--margin-right/--margin-bottom/--margin-left");
    }
    result.marginTop = result.marginRight = result.marginBottom = result.marginLeft = margins;
  }
  if (result.format && (result.width || result.height)) {
    throw new Error("pdf: --format is mutex with --width/--height");
  }
  if (result.pageNumbers && result.footerTemplate) {
    throw new Error("pdf: --page-numbers is mutex with --footer-template (page-numbers writes the footer itself)");
  }
  return result;
}
function parsePdfFromFile(payloadPath) {
  try {
    validateReadPath(path16.resolve(payloadPath));
  } catch {
    throw new Error(`pdf: --from-file ${payloadPath} must be under ${SAFE_DIRECTORIES.join(" or ")} (security policy). Copy the payload into the project tree or /tmp first.`);
  }
  const raw = fs17.readFileSync(payloadPath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`pdf: --from-file ${payloadPath} is not valid JSON (${msg}).`);
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`pdf: --from-file ${payloadPath} must be a JSON object, got ${Array.isArray(json) ? "array" : typeof json}.`);
  }
  const out = {
    output: json.output || `${TEMP_DIR}/browse-page.pdf`,
    format: json.format,
    width: json.width,
    height: json.height,
    marginTop: json.marginTop,
    marginRight: json.marginRight,
    marginBottom: json.marginBottom,
    marginLeft: json.marginLeft,
    headerTemplate: json.headerTemplate,
    footerTemplate: json.footerTemplate,
    pageNumbers: json.pageNumbers === true,
    tagged: json.tagged === true,
    outline: json.outline === true,
    printBackground: json.printBackground === true,
    preferCSSPageSize: json.preferCSSPageSize === true,
    toc: json.toc === true
  };
  return out;
}
function requireValue(args, i, flag) {
  const v = args[i];
  if (v === undefined || v.startsWith("--")) {
    throw new Error(`pdf: --${flag} requires a value`);
  }
  return v;
}
function buildPdfOptions(parsed) {
  const opts = {};
  if (parsed.format) {
    opts.format = parsed.format.charAt(0).toUpperCase() + parsed.format.slice(1).toLowerCase();
  } else if (parsed.width && parsed.height) {
    opts.width = parsed.width;
    opts.height = parsed.height;
  } else {
    opts.format = "Letter";
  }
  const margin = {};
  if (parsed.marginTop)
    margin.top = parsed.marginTop;
  if (parsed.marginRight)
    margin.right = parsed.marginRight;
  if (parsed.marginBottom)
    margin.bottom = parsed.marginBottom;
  if (parsed.marginLeft)
    margin.left = parsed.marginLeft;
  if (Object.keys(margin).length > 0)
    opts.margin = margin;
  const displayHeaderFooter = !!parsed.headerTemplate || !!parsed.footerTemplate || parsed.pageNumbers === true;
  if (displayHeaderFooter) {
    opts.displayHeaderFooter = true;
    if (parsed.headerTemplate !== undefined)
      opts.headerTemplate = parsed.headerTemplate;
    else if (parsed.pageNumbers || parsed.footerTemplate)
      opts.headerTemplate = "<div></div>";
    if (parsed.pageNumbers) {
      opts.footerTemplate = [
        '<div style="font-size:9pt; font-family:Helvetica,Arial,sans-serif; color:#666; ',
        'width:100%; text-align:center;">',
        '<span class="pageNumber"></span> of <span class="totalPages"></span>',
        "</div>"
      ].join("");
    } else if (parsed.footerTemplate !== undefined) {
      opts.footerTemplate = parsed.footerTemplate;
    } else {
      opts.footerTemplate = "<div></div>";
    }
  }
  if (parsed.tagged === true)
    opts.tagged = true;
  if (parsed.outline === true)
    opts.outline = true;
  if (parsed.printBackground === true)
    opts.printBackground = true;
  if (parsed.preferCSSPageSize === true)
    opts.preferCSSPageSize = true;
  return opts;
}
async function handleMetaCommand(command, args, bm, shutdown, tokenInfo, opts) {
  const session = bm.getActiveSession();
  switch (command) {
    case "tabs": {
      const tabs = await bm.getTabListWithTitles();
      return tabs.map((t) => `${t.active ? "→ " : "  "}[${t.id}] ${t.title || "(untitled)"} — ${t.url}`).join(`
`);
    }
    case "tab": {
      const id = parseInt(args[0], 10);
      if (isNaN(id))
        throw new Error("Usage: browse tab <id>");
      bm.switchTab(id);
      return `Switched to tab ${id}`;
    }
    case "newtab": {
      let url;
      let jsonMode = false;
      for (const a of args) {
        if (a === "--json") {
          jsonMode = true;
        } else if (!url) {
          url = a;
        }
      }
      const id = await bm.newTab(url);
      if (jsonMode) {
        return JSON.stringify({ tabId: id, url: url ?? null });
      }
      return `Opened tab ${id}${url ? ` → ${url}` : ""}`;
    }
    case "closetab": {
      const id = args[0] ? parseInt(args[0], 10) : undefined;
      await bm.closeTab(id);
      return `Closed tab${id ? ` ${id}` : ""}`;
    }
    case "tab-each": {
      if (args.length === 0) {
        throw new Error(`Usage: browse tab-each <command> [args...]
` + "Example: browse tab-each snapshot -i");
      }
      const innerRaw = args[0];
      const innerName = canonicalizeCommand(innerRaw);
      const innerArgs = args.slice(1);
      if (tokenInfo && tokenInfo.clientId !== "root" && !checkScope(tokenInfo, innerName)) {
        throw new Error(`tab-each rejected: subcommand "${innerRaw}" not allowed by your token scope (${tokenInfo.scopes.join(", ")}).`);
      }
      const tabs = await bm.getTabListWithTitles();
      const originalActive = tabs.find((t) => t.active)?.id ?? bm.getActiveTabId();
      const executeCmd = opts?.executeCommand;
      const results = [];
      try {
        for (const tab of tabs) {
          if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
            results.push({
              tabId: tab.id,
              url: tab.url,
              title: tab.title || "",
              status: 0,
              output: "skipped: internal page"
            });
            continue;
          }
          bm.switchTab(tab.id, { bringToFront: false });
          let status = 0;
          let output = "";
          if (executeCmd) {
            const r = await executeCmd({ command: innerName, args: innerArgs, tabId: tab.id }, tokenInfo);
            status = r.status;
            output = r.result;
            if (status !== 200) {
              try {
                output = JSON.parse(output).error || output;
              } catch (err) {
                if (!(err instanceof SyntaxError))
                  throw err;
              }
            }
          } else {
            status = 500;
            output = "tab-each requires the browse server (no executeCommand context)";
          }
          results.push({
            tabId: tab.id,
            url: tab.url,
            title: tab.title || "",
            status,
            output
          });
        }
      } finally {
        try {
          bm.switchTab(originalActive, { bringToFront: false });
        } catch {}
      }
      return JSON.stringify({
        command: innerName,
        args: innerArgs,
        total: results.length,
        results
      }, null, 2);
    }
    case "status": {
      const page = bm.getPage();
      const tabs = bm.getTabCount();
      const mode = bm.getConnectionMode();
      return [
        `Status: healthy`,
        `Mode: ${mode}`,
        `URL: ${page.url()}`,
        `Tabs: ${tabs}`,
        `PID: ${process.pid}`
      ].join(`
`);
    }
    case "url": {
      return bm.getCurrentUrl();
    }
    case "stop": {
      setTimeout(() => {
        shutdown();
      }, 25).unref?.();
      return "Server stopped";
    }
    case "restart": {
      console.log("[browse] Restart requested. Exiting for CLI to restart.");
      setTimeout(() => {
        shutdown();
      }, 25).unref?.();
      return "Restarting...";
    }
    case "screenshot": {
      const page = bm.getPage();
      let outputPath = `${TEMP_DIR}/browse-screenshot.png`;
      let clipRect;
      let targetSelector;
      let viewportOnly = false;
      let base64Mode = false;
      const remaining = [];
      let flagSelector;
      for (let i = 0;i < args.length; i++) {
        if (args[i] === "--viewport") {
          viewportOnly = true;
        } else if (args[i] === "--base64") {
          base64Mode = true;
        } else if (args[i] === "--selector") {
          flagSelector = args[++i];
          if (!flagSelector)
            throw new Error("Usage: screenshot --selector <css> [path]");
        } else if (args[i] === "--clip") {
          const coords = args[++i];
          if (!coords)
            throw new Error("Usage: screenshot --clip x,y,w,h [path]");
          const parts = coords.split(",").map(Number);
          if (parts.length !== 4 || parts.some(isNaN))
            throw new Error("Usage: screenshot --clip x,y,width,height — all must be numbers");
          clipRect = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
        } else if (args[i].startsWith("--")) {
          throw new Error(`Unknown screenshot flag: ${args[i]}`);
        } else {
          remaining.push(args[i]);
        }
      }
      for (const arg of remaining) {
        const isFilePath = arg.includes("/") && /\.(png|jpe?g|webp|pdf)$/i.test(arg);
        if (isFilePath) {
          outputPath = arg;
        } else if (arg.startsWith("@e") || arg.startsWith("@c") || arg.startsWith(".") || arg.startsWith("#") || arg.includes("[")) {
          targetSelector = arg;
        } else {
          outputPath = arg;
        }
      }
      if (flagSelector !== undefined) {
        if (targetSelector !== undefined) {
          throw new Error("--selector conflicts with positional selector — choose one");
        }
        targetSelector = flagSelector;
      }
      validateOutputPath(outputPath);
      if (clipRect && targetSelector) {
        throw new Error("Cannot use --clip with a selector/ref — choose one");
      }
      if (viewportOnly && clipRect) {
        throw new Error("Cannot use --viewport with --clip — choose one");
      }
      if (base64Mode) {
        let buffer;
        if (targetSelector) {
          const resolved = await bm.resolveRef(targetSelector);
          const locator = "locator" in resolved ? resolved.locator : page.locator(resolved.selector);
          buffer = await locator.screenshot({ timeout: 5000 });
        } else if (clipRect) {
          buffer = await page.screenshot({ clip: clipRect });
        } else {
          buffer = await page.screenshot({ fullPage: !viewportOnly });
          ({ buffer } = await guardScreenshotBuffer(buffer));
        }
        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error("Screenshot too large for --base64 (>10MB). Use disk path instead.");
        }
        return `data:image/png;base64,${buffer.toString("base64")}`;
      }
      if (targetSelector) {
        const resolved = await bm.resolveRef(targetSelector);
        const locator = "locator" in resolved ? resolved.locator : page.locator(resolved.selector);
        await locator.screenshot({ path: outputPath, timeout: 5000 });
        return `Screenshot saved (element): ${outputPath}`;
      }
      if (clipRect) {
        await page.screenshot({ path: outputPath, clip: clipRect });
        return `Screenshot saved (clip ${clipRect.x},${clipRect.y},${clipRect.width},${clipRect.height}): ${outputPath}`;
      }
      await page.screenshot({ path: outputPath, fullPage: !viewportOnly });
      if (!viewportOnly)
        await guardScreenshotPath(outputPath);
      return `Screenshot saved${viewportOnly ? " (viewport)" : ""}: ${outputPath}`;
    }
    case "pdf": {
      const page = bm.getPage();
      const parsed = parsePdfArgs(args);
      validateOutputPath(parsed.output);
      if (parsed.toc) {
        const deadline = Date.now() + 3000;
        let ready = false;
        while (Date.now() < deadline) {
          try {
            ready = await page.evaluate("!!window.__pagedjsAfterFired");
          } catch {}
          if (ready)
            break;
          await new Promise((r) => setTimeout(r, 150));
        }
      }
      const opts = buildPdfOptions(parsed);
      opts.path = parsed.output;
      await page.pdf(opts);
      return `PDF saved: ${parsed.output}`;
    }
    case "responsive": {
      const page = bm.getPage();
      const prefix = args[0] || `${TEMP_DIR}/browse-responsive`;
      validateOutputPath(prefix);
      const viewports = [
        { name: "mobile", width: 375, height: 812 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1280, height: 720 }
      ];
      const originalViewport = page.viewportSize();
      const results = [];
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const screenshotPath = `${prefix}-${vp.name}.png`;
        validateOutputPath(screenshotPath);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await guardScreenshotPath(screenshotPath);
        results.push(`${vp.name} (${vp.width}x${vp.height}): ${screenshotPath}`);
      }
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      }
      return results.join(`
`);
    }
    case "chain": {
      const jsonStr = args[0];
      if (!jsonStr)
        throw new Error(`Usage: echo '[["goto","url"],["text"]]' | browse chain
` + "   or: browse chain 'goto url | click @e5 | snapshot -ic'");
      let rawCommands;
      try {
        rawCommands = JSON.parse(jsonStr);
        if (!Array.isArray(rawCommands))
          throw new Error("not array");
      } catch (err) {
        if (!(err instanceof SyntaxError) && err?.message !== "not array")
          throw err;
        rawCommands = jsonStr.split(" | ").filter((seg) => seg.trim().length > 0).map((seg) => tokenizePipeSegment(seg.trim()));
      }
      const commands = rawCommands.map((cmd) => {
        const [rawName, ...cmdArgs] = cmd;
        const name = canonicalizeCommand(rawName);
        return { rawName, name, args: cmdArgs };
      });
      if (tokenInfo && tokenInfo.clientId !== "root") {
        for (const c of commands) {
          if (!checkScope(tokenInfo, c.name)) {
            throw new Error(`Chain rejected: subcommand "${c.rawName}" not allowed by your token scope (${tokenInfo.scopes.join(", ")}). ` + `All subcommands must be within scope.`);
          }
        }
      }
      const executeCmd = opts?.executeCommand;
      const results = [];
      let lastWasWrite = false;
      if (executeCmd) {
        for (const c of commands) {
          const cr = await executeCmd({ command: c.name, args: c.args }, tokenInfo);
          const label = c.rawName === c.name ? c.name : `${c.rawName}→${c.name}`;
          if (cr.status === 200) {
            results.push(`[${label}] ${cr.result}`);
          } else {
            let errMsg = cr.result;
            try {
              errMsg = JSON.parse(cr.result).error || cr.result;
            } catch (err) {
              if (!(err instanceof SyntaxError))
                throw err;
            }
            results.push(`[${label}] ERROR: ${errMsg}`);
          }
          lastWasWrite = WRITE_COMMANDS.has(c.name);
        }
      } else {
        throw new Error("chain requires the browse server (no executeCommand context)");
      }
      if (lastWasWrite) {
        await bm.getPage().waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      }
      return results.join(`

`);
    }
    case "diff": {
      const [url1, url2] = args;
      if (!url1 || !url2)
        throw new Error("Usage: browse diff <url1> <url2>");
      const page = bm.getPage();
      const normalizedUrl1 = await validateNavigationUrl(url1);
      await page.goto(normalizedUrl1, { waitUntil: "domcontentloaded", timeout: 15000 });
      const text1 = await getCleanText(page);
      const normalizedUrl2 = await validateNavigationUrl(url2);
      await page.goto(normalizedUrl2, { waitUntil: "domcontentloaded", timeout: 15000 });
      const text2 = await getCleanText(page);
      const changes = Diff2.diffLines(text1, text2);
      const output = [`--- ${url1}`, `+++ ${url2}`, ""];
      for (const part of changes) {
        const prefix = part.added ? "+" : part.removed ? "-" : " ";
        const lines = part.value.split(`
`).filter((l) => l.length > 0);
        for (const line of lines) {
          output.push(`${prefix} ${line}`);
        }
      }
      return wrapUntrustedContent(output.join(`
`), `diff: ${url1} vs ${url2}`);
    }
    case "snapshot": {
      const isScoped = tokenInfo && tokenInfo.clientId !== "root";
      const snapshotResult = await handleSnapshot(args, session, {
        splitForScoped: !!isScoped
      });
      if (isScoped) {
        return snapshotResult;
      }
      return wrapUntrustedContent(snapshotResult, bm.getCurrentUrl());
    }
    case "handoff": {
      const message = args.join(" ") || "User takeover requested";
      return await bm.handoff(message);
    }
    case "resume": {
      bm.resume();
      const isScoped2 = tokenInfo && tokenInfo.clientId !== "root";
      const snapshot = await handleSnapshot(["-i"], session, { splitForScoped: !!isScoped2 });
      if (isScoped2) {
        return `RESUMED
${snapshot}`;
      }
      return `RESUMED
${wrapUntrustedContent(snapshot, bm.getCurrentUrl())}`;
    }
    case "connect": {
      if (bm.getConnectionMode() === "headed") {
        return "Already in headed mode with extension.";
      }
      return "The connect command must be run from the CLI (not sent to a running server). Run: $B connect";
    }
    case "disconnect": {
      if (bm.getConnectionMode() !== "headed") {
        return "Not in headed mode — nothing to disconnect.";
      }
      console.log("[browse] Disconnecting headed browser. Restarting in headless mode.");
      await shutdown();
      return "Disconnected. Server will restart in headless mode on next command.";
    }
    case "focus": {
      if (bm.getConnectionMode() !== "headed") {
        return "focus requires headed mode. Run `$B connect` first.";
      }
      try {
        const { execSync } = await import("child_process");
        const appNames = ["Comet", "Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"];
        let activated = false;
        for (const appName of appNames) {
          try {
            execSync(`osascript -e 'tell application "${appName}" to activate'`, { stdio: "pipe", timeout: 3000, windowsHide: true });
            activated = true;
            break;
          } catch (err) {
            if (err?.status === undefined && !err?.message?.includes("Command failed"))
              throw err;
          }
        }
        if (!activated) {
          return "Could not bring browser to foreground. macOS only.";
        }
        if (args.length > 0 && args[0].startsWith("@")) {
          try {
            const resolved = await bm.resolveRef(args[0]);
            if ("locator" in resolved) {
              await resolved.locator.scrollIntoViewIfNeeded({ timeout: 5000 });
              return `Browser activated. Scrolled ${args[0]} into view.`;
            }
          } catch (err) {
            if (!err?.message?.includes("not found") && !err?.message?.includes("closed") && !err?.message?.includes("Target") && !err?.message?.includes("timeout"))
              throw err;
          }
        }
        return "Browser window activated.";
      } catch (err) {
        return `focus failed: ${err.message}. macOS only.`;
      }
    }
    case "watch": {
      if (args[0] === "stop") {
        if (!bm.isWatching())
          return "Not currently watching.";
        const result = bm.stopWatch();
        const durationSec = Math.round(result.duration / 1000);
        const lastSnapshot = result.snapshots.length > 0 ? wrapUntrustedContent(result.snapshots[result.snapshots.length - 1], bm.getCurrentUrl()) : "(none)";
        return [
          `WATCH STOPPED (${durationSec}s, ${result.snapshots.length} snapshots)`,
          "",
          "Last snapshot:",
          lastSnapshot
        ].join(`
`);
      }
      if (bm.isWatching())
        return "Already watching. Run `$B watch stop` to stop.";
      if (bm.getConnectionMode() !== "headed") {
        return "watch requires headed mode. Run `$B connect` first.";
      }
      bm.startWatch();
      return "WATCHING — observing user browsing. Periodic snapshots every 5s.\nRun `$B watch stop` to stop and get summary.";
    }
    case "inbox": {
      const { execSync } = await import("child_process");
      let gitRoot;
      try {
        gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true }).trim();
      } catch (err) {
        if (err?.status === undefined && !err?.message?.includes("Command failed"))
          throw err;
        return "Not in a git repository — cannot locate inbox.";
      }
      const inboxDir = path16.join(gitRoot, ".context", "sidebar-inbox");
      if (!fs17.existsSync(inboxDir))
        return "Inbox empty.";
      const files = fs17.readdirSync(inboxDir).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort().reverse();
      if (files.length === 0)
        return "Inbox empty.";
      const messages = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs17.readFileSync(path16.join(inboxDir, file), "utf-8"));
          messages.push({
            timestamp: data.timestamp || "",
            url: data.page?.url || "unknown",
            userMessage: data.userMessage || ""
          });
        } catch (err) {
          if (!(err instanceof SyntaxError) && err?.code !== "ENOENT" && err?.code !== "EACCES")
            throw err;
        }
      }
      if (messages.length === 0)
        return "Inbox empty.";
      const lines = [];
      lines.push(`SIDEBAR INBOX (${messages.length} message${messages.length === 1 ? "" : "s"})`);
      lines.push("────────────────────────────────");
      for (const msg of messages) {
        const ts = msg.timestamp ? `[${msg.timestamp}]` : "[unknown]";
        lines.push(`${ts} ${wrapUntrustedContent(msg.url, "inbox-url")}`);
        lines.push(`  "${wrapUntrustedContent(msg.userMessage, "inbox-message")}"`);
        lines.push("");
      }
      lines.push("────────────────────────────────");
      if (args.includes("--clear")) {
        for (const file of files) {
          try {
            fs17.unlinkSync(path16.join(inboxDir, file));
          } catch (err) {
            if (err?.code !== "ENOENT")
              throw err;
          }
        }
        lines.push(`Cleared ${files.length} message${files.length === 1 ? "" : "s"}.`);
      }
      return lines.join(`
`);
    }
    case "state": {
      const [action, name] = args;
      if (!action || !name)
        throw new Error("Usage: state save|load <name>");
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error("State name must be alphanumeric (a-z, 0-9, _, -)");
      }
      const config = resolveConfig();
      const stateDir = path16.join(config.stateDir, "browse-states");
      mkdirSecure(stateDir);
      const statePath = path16.join(stateDir, `${name}.json`);
      if (action === "save") {
        const state = await bm.saveState();
        const saveData = {
          version: 1,
          savedAt: new Date().toISOString(),
          cookies: state.cookies,
          pages: state.pages.map((p) => ({ url: p.url, isActive: p.isActive }))
        };
        writeSecureFile(statePath, JSON.stringify(saveData, null, 2));
        return `State saved: ${statePath} (${state.cookies.length} cookies, ${state.pages.length} pages)
⚠️  Cookies stored in plaintext. Delete when no longer needed.`;
      }
      if (action === "load") {
        if (!fs17.existsSync(statePath))
          throw new Error(`State not found: ${statePath}`);
        const data = JSON.parse(fs17.readFileSync(statePath, "utf-8"));
        if (!Array.isArray(data.cookies) || !Array.isArray(data.pages)) {
          throw new Error("Invalid state file: expected cookies and pages arrays");
        }
        const validatedCookies = filterSessionCookies(data.cookies);
        if (validatedCookies.length < data.cookies.length) {
          console.warn(`[browse] Filtered ${data.cookies.length - validatedCookies.length} invalid cookies from state file`);
        }
        if (data.savedAt) {
          const ageMs = Date.now() - new Date(data.savedAt).getTime();
          const SEVEN_DAYS = 604800000;
          if (ageMs > SEVEN_DAYS) {
            console.warn(`[browse] Warning: State file is ${Math.round(ageMs / 86400000)} days old. Consider re-saving.`);
          }
        }
        bm.setFrame(null);
        await bm.closeAllPages();
        await bm.restoreState({
          cookies: validatedCookies,
          pages: data.pages.map((p) => ({
            url: typeof p.url === "string" ? p.url : "",
            isActive: Boolean(p.isActive),
            storage: null
          }))
        });
        return `State loaded: ${data.cookies.length} cookies, ${data.pages.length} pages`;
      }
      throw new Error("Usage: state save|load <name>");
    }
    case "frame": {
      const target = args[0];
      if (!target)
        throw new Error("Usage: frame <selector|@ref|--name name|--url pattern|main>");
      if (target === "main") {
        bm.setFrame(null);
        bm.clearRefs();
        return "Switched to main frame";
      }
      const page = bm.getPage();
      let frame = null;
      if (target === "--name") {
        if (!args[1])
          throw new Error("Usage: frame --name <name>");
        frame = page.frame({ name: args[1] });
      } else if (target === "--url") {
        if (!args[1])
          throw new Error("Usage: frame --url <pattern>");
        frame = page.frame({ url: new RegExp(escapeRegExp(args[1])) });
      } else {
        const resolved = await bm.resolveRef(target);
        const locator = "locator" in resolved ? resolved.locator : page.locator(resolved.selector);
        const elementHandle = await locator.elementHandle({ timeout: 5000 });
        frame = await elementHandle?.contentFrame() ?? null;
        await elementHandle?.dispose();
      }
      if (!frame)
        throw new Error(`Frame not found: ${target}`);
      bm.setFrame(frame);
      bm.clearRefs();
      return `Switched to frame: ${frame.url()}`;
    }
    case "ux-audit": {
      const page = bm.getPage();
      const data = await page.evaluate(() => {
        const HEADING_CAP = 50;
        const INTERACTIVE_CAP = 200;
        const TEXT_BLOCK_CAP = 50;
        const logoEl = document.querySelector('[class*="logo"], [id*="logo"], header img, [aria-label*="home"], a[href="/"]');
        const siteId = logoEl ? {
          found: true,
          text: (logoEl.textContent || "").trim().slice(0, 100),
          tag: logoEl.tagName,
          alt: logoEl.alt || null
        } : { found: false, text: null, tag: null, alt: null };
        const h1 = document.querySelector("h1");
        const pageName = h1 ? {
          found: true,
          text: h1.textContent?.trim().slice(0, 200) || ""
        } : { found: false, text: null };
        const navEls = document.querySelectorAll('nav, [role="navigation"]');
        const navItems = [];
        navEls.forEach((nav, i) => {
          if (i >= 5)
            return;
          const links = nav.querySelectorAll("a");
          navItems.push({
            text: (nav.getAttribute("aria-label") || `nav-${i}`).slice(0, 50),
            links: links.length
          });
        });
        const activeNavItems = document.querySelectorAll('nav [aria-current], nav .active, nav .current, [role="navigation"] [aria-current], [role="navigation"] .active, [role="navigation"] .current');
        const youAreHere = Array.from(activeNavItems).slice(0, 5).map((el) => ({
          text: (el.textContent || "").trim().slice(0, 50),
          tag: el.tagName
        }));
        const searchEl = document.querySelector('input[type="search"], [role="search"], input[name*="search"], input[placeholder*="search" i], input[aria-label*="search" i]');
        const search = { found: !!searchEl };
        const breadcrumbEl = document.querySelector('[aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs, [class*="breadcrumb"]');
        const breadcrumbs = breadcrumbEl ? {
          found: true,
          items: Array.from(breadcrumbEl.querySelectorAll("a, span, li")).slice(0, 10).map((el) => (el.textContent || "").trim().slice(0, 30))
        } : { found: false, items: [] };
        const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).slice(0, HEADING_CAP).map((h) => ({
          tag: h.tagName,
          text: (h.textContent || "").trim().slice(0, 80),
          size: getComputedStyle(h).fontSize
        }));
        const interactiveEls = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex]')).slice(0, INTERACTIVE_CAP);
        const interactive = interactiveEls.map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: (el.textContent || el.placeholder || "").trim().slice(0, 50),
            type: el.type || null,
            role: el.getAttribute("role"),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            visible: rect.width > 0 && rect.height > 0
          };
        }).filter((el) => el.visible);
        const textBlocks = Array.from(document.querySelectorAll('p, [class*="description"], [class*="intro"], [class*="welcome"], [class*="hero"] p, main p')).slice(0, TEXT_BLOCK_CAP).map((el) => ({
          text: (el.textContent || "").trim().slice(0, 200),
          wordCount: (el.textContent || "").trim().split(/\s+/).filter(Boolean).length
        }));
        const bodyText = (document.body?.textContent || "").trim();
        const totalWords = bodyText.split(/\s+/).filter(Boolean).length;
        return {
          url: window.location.href,
          title: document.title,
          siteId,
          pageName,
          navigation: navItems,
          youAreHere,
          search,
          breadcrumbs,
          headings,
          interactive,
          textBlocks,
          totalWords
        };
      });
      return JSON.stringify(data, null, 2);
    }
    case "domain-skill": {
      return await handleDomainSkillCommand(args, bm);
    }
    case "skill": {
      const port = opts?.daemonPort;
      if (port === undefined) {
        throw new Error("skill command requires daemonPort in MetaCommandOpts (server bug)");
      }
      return await handleSkillCommand(args, { port });
    }
    case "cdp": {
      await Promise.resolve().then(() => init_cdp_commands());
      return await handleCdpCommand(args, bm);
    }
    case "memory": {
      await Promise.resolve().then(() => init_memory_command());
      return await handleMemoryCommand(args, bm);
    }
    default:
      throw new Error(`Unknown meta command: ${command}`);
  }
}
var init_meta_commands = __esm(() => {
  init_snapshot();
  init_read_commands();
  init_commands();
  init_domain_skill_commands();
  init_browser_skill_commands();
  init_url_validation();
  init_token_registry();
  init_path_security();
  init_screenshot_size_guard();
  init_path_security();
  init_file_permissions();
  init_platform();
  init_config();
  init_session_persist();
});

// browse/src/find-security-sidecar.ts
import { existsSync as existsSync10 } from "fs";
import { join as join14, dirname as dirname9 } from "path";
import { execFileSync as execFileSync2 } from "child_process";
function nodeOnPath() {
  try {
    execFileSync2("node", ["--version"], { stdio: "ignore", timeout: 2000, windowsHide: true });
    return "node";
  } catch {
    return null;
  }
}
function browseRoot() {
  let candidate = dirname9(import.meta.path || "");
  for (let i = 0;i < 6; i += 1) {
    if (existsSync10(join14(candidate, "browse", "dist", "security-sidecar.js"))) {
      return candidate;
    }
    if (existsSync10(join14(candidate, "src", "security-sidecar-entry.ts"))) {
      return candidate;
    }
    const next = dirname9(candidate);
    if (next === candidate)
      break;
    candidate = next;
  }
  return process.cwd();
}
function findSecuritySidecar() {
  const node = nodeOnPath();
  if (!node)
    return null;
  const root = browseRoot();
  const compiled = join14(root, "browse", "dist", "security-sidecar.js");
  if (existsSync10(compiled)) {
    return { node, entry: compiled, mode: "compiled" };
  }
  const devEntry = join14(root, "src", "security-sidecar-entry.ts");
  if (existsSync10(devEntry)) {
    return { node, entry: devEntry, mode: "dev" };
  }
  return null;
}
var init_find_security_sidecar = () => {};

// browse/src/security-sidecar-client.ts
import { spawn as spawn2 } from "child_process";
function getState() {
  if (!state) {
    state = {
      child: null,
      pending: new Map,
      buffer: "",
      failures: [],
      available: true,
      brokenCircuit: false,
      nextId: 1
    };
  }
  return state;
}
function recordFailure() {
  const s = getState();
  const now = Date.now();
  s.failures = s.failures.filter((t) => now - t < RESPAWN_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= RESPAWN_LIMIT) {
    s.brokenCircuit = true;
    s.available = false;
  }
}
function processBuffer() {
  const s = getState();
  let idx = s.buffer.indexOf(`
`);
  while (idx !== -1) {
    const line = s.buffer.slice(0, idx).trim();
    s.buffer = s.buffer.slice(idx + 1);
    idx = s.buffer.indexOf(`
`);
    if (!line)
      continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      recordFailure();
      continue;
    }
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!id)
      continue;
    const pending = s.pending.get(id);
    if (!pending)
      continue;
    s.pending.delete(id);
    clearTimeout(pending.timer);
    if (parsed.ok) {
      pending.resolve(parsed);
    } else {
      recordFailure();
      pending.reject(new Error(parsed.error ?? "sidecar-error"));
    }
  }
}
function shutdownChild() {
  const s = getState();
  if (!s.child)
    return;
  try {
    s.child.kill("SIGTERM");
  } catch {}
  s.child = null;
  for (const [, p] of s.pending) {
    clearTimeout(p.timer);
    p.reject(new Error("sidecar-died"));
  }
  s.pending.clear();
}
function spawnSidecar() {
  const s = getState();
  if (s.brokenCircuit)
    return false;
  const location = findSecuritySidecar();
  if (!location) {
    s.available = false;
    return false;
  }
  try {
    const child = spawn2(location.node, [location.entry], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => {
      s.buffer += chunk.toString("utf-8");
      processBuffer();
    });
    child.on("exit", () => {
      shutdownChild();
    });
    child.on("error", () => {
      recordFailure();
      shutdownChild();
    });
    s.child = child;
    s.available = true;
    return true;
  } catch {
    recordFailure();
    return false;
  }
}
function isSidecarAvailable() {
  const s = getState();
  if (s.brokenCircuit)
    return { available: false, reason: "circuit-broken" };
  if (s.child)
    return { available: true };
  const location = findSecuritySidecar();
  if (!location)
    return { available: false, reason: "no-node-or-entry" };
  return { available: true };
}
async function scanWithSidecar(text, opts) {
  const s = getState();
  if (s.brokenCircuit) {
    throw new Error("sidecar-circuit-broken");
  }
  if (Buffer.byteLength(text, "utf-8") > REQUEST_CAP_BYTES) {
    throw new Error("payload-too-large");
  }
  if (!s.child) {
    if (!spawnSidecar()) {
      throw new Error("sidecar-spawn-failed");
    }
  }
  const id = String(s.nextId++);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.pending.delete(id);
      recordFailure();
      reject(new Error("sidecar-timeout"));
    }, timeoutMs);
    s.pending.set(id, {
      resolve: (response) => {
        const r = response;
        resolve({ verdict: r.verdict });
      },
      reject,
      timer
    });
    const payload = JSON.stringify({ id, op: "scan-page-content", text }) + `
`;
    try {
      s.child.stdin.write(payload);
    } catch (err) {
      clearTimeout(timer);
      s.pending.delete(id);
      recordFailure();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
var REQUEST_CAP_BYTES, DEFAULT_TIMEOUT_MS = 5000, RESPAWN_WINDOW_MS, RESPAWN_LIMIT = 3, state = null;
var init_security_sidecar_client = __esm(() => {
  init_find_security_sidecar();
  REQUEST_CAP_BYTES = 64 * 1024;
  RESPAWN_WINDOW_MS = 10 * 60 * 1000;
  process.on("exit", () => shutdownChild());
});

// browse/src/sse-helpers.ts
function createSseEndpoint(req, config) {
  const heartbeatMs = config.heartbeatMs ?? 15000;
  const encoder = new TextEncoder;
  const stream = new ReadableStream({
    start(controller) {
      let cleanedUp = false;
      let heartbeat = null;
      let unsubscribe = null;
      const cleanup = () => {
        if (cleanedUp)
          return;
        cleanedUp = true;
        if (heartbeat !== null) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (unsubscribe !== null) {
          unsubscribe();
          unsubscribe = null;
        }
        try {
          controller.close();
        } catch {}
      };
      const send = (event, data) => {
        if (cleanedUp)
          return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}
data: ${JSON.stringify(data, sanitizeReplacer)}

`));
        } catch {
          cleanup();
        }
      };
      if (config.initialReplay) {
        try {
          config.initialReplay(send);
        } catch {
          cleanup();
          return;
        }
        if (cleanedUp)
          return;
      }
      unsubscribe = config.subscribe((entry) => {
        send(config.liveEventName, entry);
      });
      heartbeat = setInterval(() => {
        if (cleanedUp)
          return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat

`));
        } catch {
          cleanup();
        }
      }, heartbeatMs);
      req.signal.addEventListener("abort", cleanup);
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
var init_sse_helpers = __esm(() => {
  init_sanitize();
});

// browse/src/audit.ts
function initAuditLog(logPath) {
  auditPath = logPath;
}
function writeAuditEntry(entry) {
  if (!auditPath)
    return;
  try {
    const truncatedArgs = entry.args.length > MAX_ARGS_LENGTH ? entry.args.slice(0, MAX_ARGS_LENGTH) + "…" : entry.args;
    const truncatedError = entry.error && entry.error.length > MAX_ERROR_LENGTH ? entry.error.slice(0, MAX_ERROR_LENGTH) + "…" : entry.error;
    const record = {
      ts: entry.ts,
      cmd: entry.cmd,
      args: truncatedArgs,
      origin: entry.origin,
      durationMs: entry.durationMs,
      status: entry.status,
      hasCookies: entry.hasCookies,
      mode: entry.mode
    };
    if (entry.aliasOf)
      record.aliasOf = entry.aliasOf;
    if (truncatedError)
      record.error = truncatedError;
    appendSecureFile(auditPath, JSON.stringify(record) + `
`);
  } catch {}
}
var MAX_ARGS_LENGTH = 200, MAX_ERROR_LENGTH = 300, auditPath = null;
var init_audit = __esm(() => {
  init_file_permissions();
});

// browse/src/port-allocator.ts
import * as net from "net";
function normalizePortError(err) {
  const maybeNodeError = err;
  return {
    available: false,
    code: maybeNodeError?.code,
    message: maybeNodeError?.message || String(err)
  };
}
function isOccupiedPort(result) {
  return result.code === "EADDRINUSE";
}
function formatPortFailureDetail(attempt) {
  const { code, message } = attempt.result;
  return code ? `${attempt.port} (${code}: ${message})` : `${attempt.port} (${message})`;
}
function formatExplicitPortUnavailableError(port, result) {
  if (isOccupiedPort(result)) {
    return new Error(`[browse] Port ${port} (from BROWSE_PORT env) is in use`);
  }
  const detail = result.code ? `${result.code}: ${result.message}` : result.message;
  return new Error(`[browse] Cannot bind BROWSE_PORT=${port} on 127.0.0.1 (${detail}). ` + `This usually means localhost port binding is blocked by the current sandbox or OS permissions, ` + `not that the port is occupied. Allow localhost binding, or run browse from an unrestricted terminal.`);
}
function formatRandomPortUnavailableError(attempts) {
  const blockingAttempts = attempts.filter((attempt) => !isOccupiedPort(attempt.result));
  if (blockingAttempts.length > 0) {
    const last = blockingAttempts[blockingAttempts.length - 1];
    return new Error(`[browse] Cannot bind localhost ports after ${attempts.length} attempts in range ` + `${RANDOM_PORT_MIN}-${RANDOM_PORT_MAX}. Last error: ${formatPortFailureDetail(last)}. ` + `This usually means the current sandbox or OS permissions are blocking localhost port binding, ` + `not that every sampled port is occupied. Allow localhost binding, set BROWSE_PORT to an approved ` + `port, or run browse from an unrestricted terminal.`);
  }
  return new Error(`[browse] No available port after ${RANDOM_PORT_RETRIES} attempts in range ` + `${RANDOM_PORT_MIN}-${RANDOM_PORT_MAX}; every sampled port was already in use`);
}
function checkPortAvailable(port, hostname = "127.0.0.1") {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let settled = false;
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      resolve(result);
    };
    srv.once("error", (err) => finish(normalizePortError(err)));
    try {
      srv.listen(port, hostname, () => {
        srv.close(() => finish({ available: true }));
      });
    } catch (err) {
      finish(normalizePortError(err));
    }
  });
}
async function findAvailablePort(explicitPort) {
  if (explicitPort) {
    const result = await checkPortAvailable(explicitPort);
    if (result.available) {
      return explicitPort;
    }
    throw formatExplicitPortUnavailableError(explicitPort, result);
  }
  const attempts = [];
  for (let attempt = 0;attempt < RANDOM_PORT_RETRIES; attempt++) {
    const port = RANDOM_PORT_MIN + Math.floor(Math.random() * (RANDOM_PORT_MAX - RANDOM_PORT_MIN));
    const result = await checkPortAvailable(port);
    if (result.available) {
      return port;
    }
    attempts.push({ port, result });
  }
  throw formatRandomPortUnavailableError(attempts);
}
var RANDOM_PORT_MIN = 1e4, RANDOM_PORT_MAX = 49151, RANDOM_PORT_RETRIES = 5;
var init_port_allocator = () => {};

// lib/fs-atomic.ts
var init_fs_atomic = () => {};

// browse/src/terminal-agent-control.ts
import * as fs18 from "fs";
import * as path17 from "path";
function resolveTerminalAgentScript(searchHints = {}) {
  const meta = searchHints.metaDir || __dirname;
  const exec = searchHints.execPath || process.execPath;
  const candidates = [
    path17.resolve(meta, "terminal-agent.ts"),
    path17.resolve(path17.dirname(exec), "..", "src", "terminal-agent.ts")
  ];
  for (const c of candidates) {
    if (fs18.existsSync(c))
      return c;
  }
  return null;
}
function spawnTerminalAgent(opts) {
  const stateDir = path17.dirname(opts.stateFile);
  const prior = readAgentRecord(stateDir);
  if (prior) {
    killAgentByRecord(prior, "SIGTERM");
    clearAgentRecord(stateDir);
  }
  const script = opts.scriptPath || resolveTerminalAgentScript();
  if (!script || !fs18.existsSync(script))
    return null;
  const proc = Bun.spawn(["bun", "run", script], {
    cwd: opts.cwd || process.cwd(),
    env: {
      ...process.env,
      BROWSE_STATE_FILE: opts.stateFile,
      BROWSE_SERVER_PORT: String(opts.serverPort),
      BROWSE_OWNER_PID: String(opts.ownerPid),
      ...opts.extraEnv || {}
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
  });
  proc.unref?.();
  return proc.pid ?? null;
}
function agentRecordPath(stateDir) {
  return path17.join(stateDir, "terminal-agent-pid");
}
function readAgentRecord(stateDir) {
  try {
    const raw = fs18.readFileSync(agentRecordPath(stateDir), "utf-8");
    const j = JSON.parse(raw);
    if (typeof j?.pid === "number" && typeof j?.gen === "string" && typeof j?.startedAt === "number") {
      return j;
    }
    return null;
  } catch {
    return null;
  }
}
function clearAgentRecord(stateDir) {
  safeUnlink(agentRecordPath(stateDir));
}
function killAgentByRecord(record, signal = "SIGTERM") {
  if (!isProcessAlive(record.pid))
    return false;
  safeKill(record.pid, signal);
  return true;
}
var __dirname = "/private/tmp/gstack-install/browse/src";
var init_terminal_agent_control = __esm(() => {
  init_error_handling2();
  init_file_permissions();
  init_fs_atomic();
});

// node_modules/smart-buffer/build/utils.js
var require_utils = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var buffer_1 = __require("buffer");
  var ERRORS = {
    INVALID_ENCODING: "Invalid encoding provided. Please specify a valid encoding the internal Node.js Buffer supports.",
    INVALID_SMARTBUFFER_SIZE: "Invalid size provided. Size must be a valid integer greater than zero.",
    INVALID_SMARTBUFFER_BUFFER: "Invalid Buffer provided in SmartBufferOptions.",
    INVALID_SMARTBUFFER_OBJECT: "Invalid SmartBufferOptions object supplied to SmartBuffer constructor or factory methods.",
    INVALID_OFFSET: "An invalid offset value was provided.",
    INVALID_OFFSET_NON_NUMBER: "An invalid offset value was provided. A numeric value is required.",
    INVALID_LENGTH: "An invalid length value was provided.",
    INVALID_LENGTH_NON_NUMBER: "An invalid length value was provived. A numeric value is required.",
    INVALID_TARGET_OFFSET: "Target offset is beyond the bounds of the internal SmartBuffer data.",
    INVALID_TARGET_LENGTH: "Specified length value moves cursor beyong the bounds of the internal SmartBuffer data.",
    INVALID_READ_BEYOND_BOUNDS: "Attempted to read beyond the bounds of the managed data.",
    INVALID_WRITE_BEYOND_BOUNDS: "Attempted to write beyond the bounds of the managed data."
  };
  exports.ERRORS = ERRORS;
  function checkEncoding(encoding) {
    if (!buffer_1.Buffer.isEncoding(encoding)) {
      throw new Error(ERRORS.INVALID_ENCODING);
    }
  }
  exports.checkEncoding = checkEncoding;
  function isFiniteInteger(value) {
    return typeof value === "number" && isFinite(value) && isInteger(value);
  }
  exports.isFiniteInteger = isFiniteInteger;
  function checkOffsetOrLengthValue(value, offset) {
    if (typeof value === "number") {
      if (!isFiniteInteger(value) || value < 0) {
        throw new Error(offset ? ERRORS.INVALID_OFFSET : ERRORS.INVALID_LENGTH);
      }
    } else {
      throw new Error(offset ? ERRORS.INVALID_OFFSET_NON_NUMBER : ERRORS.INVALID_LENGTH_NON_NUMBER);
    }
  }
  function checkLengthValue(length) {
    checkOffsetOrLengthValue(length, false);
  }
  exports.checkLengthValue = checkLengthValue;
  function checkOffsetValue(offset) {
    checkOffsetOrLengthValue(offset, true);
  }
  exports.checkOffsetValue = checkOffsetValue;
  function checkTargetOffset(offset, buff) {
    if (offset < 0 || offset > buff.length) {
      throw new Error(ERRORS.INVALID_TARGET_OFFSET);
    }
  }
  exports.checkTargetOffset = checkTargetOffset;
  function isInteger(value) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value;
  }
  function bigIntAndBufferInt64Check(bufferMethod) {
    if (typeof BigInt === "undefined") {
      throw new Error("Platform does not support JS BigInt type.");
    }
    if (typeof buffer_1.Buffer.prototype[bufferMethod] === "undefined") {
      throw new Error(`Platform does not support Buffer.prototype.${bufferMethod}.`);
    }
  }
  exports.bigIntAndBufferInt64Check = bigIntAndBufferInt64Check;
});

// node_modules/smart-buffer/build/smartbuffer.js
var require_smartbuffer = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var utils_1 = require_utils();
  var DEFAULT_SMARTBUFFER_SIZE = 4096;
  var DEFAULT_SMARTBUFFER_ENCODING = "utf8";

  class SmartBuffer {
    constructor(options) {
      this.length = 0;
      this._encoding = DEFAULT_SMARTBUFFER_ENCODING;
      this._writeOffset = 0;
      this._readOffset = 0;
      if (SmartBuffer.isSmartBufferOptions(options)) {
        if (options.encoding) {
          utils_1.checkEncoding(options.encoding);
          this._encoding = options.encoding;
        }
        if (options.size) {
          if (utils_1.isFiniteInteger(options.size) && options.size > 0) {
            this._buff = Buffer.allocUnsafe(options.size);
          } else {
            throw new Error(utils_1.ERRORS.INVALID_SMARTBUFFER_SIZE);
          }
        } else if (options.buff) {
          if (Buffer.isBuffer(options.buff)) {
            this._buff = options.buff;
            this.length = options.buff.length;
          } else {
            throw new Error(utils_1.ERRORS.INVALID_SMARTBUFFER_BUFFER);
          }
        } else {
          this._buff = Buffer.allocUnsafe(DEFAULT_SMARTBUFFER_SIZE);
        }
      } else {
        if (typeof options !== "undefined") {
          throw new Error(utils_1.ERRORS.INVALID_SMARTBUFFER_OBJECT);
        }
        this._buff = Buffer.allocUnsafe(DEFAULT_SMARTBUFFER_SIZE);
      }
    }
    static fromSize(size, encoding) {
      return new this({
        size,
        encoding
      });
    }
    static fromBuffer(buff, encoding) {
      return new this({
        buff,
        encoding
      });
    }
    static fromOptions(options) {
      return new this(options);
    }
    static isSmartBufferOptions(options) {
      const castOptions = options;
      return castOptions && (castOptions.encoding !== undefined || castOptions.size !== undefined || castOptions.buff !== undefined);
    }
    readInt8(offset) {
      return this._readNumberValue(Buffer.prototype.readInt8, 1, offset);
    }
    readInt16BE(offset) {
      return this._readNumberValue(Buffer.prototype.readInt16BE, 2, offset);
    }
    readInt16LE(offset) {
      return this._readNumberValue(Buffer.prototype.readInt16LE, 2, offset);
    }
    readInt32BE(offset) {
      return this._readNumberValue(Buffer.prototype.readInt32BE, 4, offset);
    }
    readInt32LE(offset) {
      return this._readNumberValue(Buffer.prototype.readInt32LE, 4, offset);
    }
    readBigInt64BE(offset) {
      utils_1.bigIntAndBufferInt64Check("readBigInt64BE");
      return this._readNumberValue(Buffer.prototype.readBigInt64BE, 8, offset);
    }
    readBigInt64LE(offset) {
      utils_1.bigIntAndBufferInt64Check("readBigInt64LE");
      return this._readNumberValue(Buffer.prototype.readBigInt64LE, 8, offset);
    }
    writeInt8(value, offset) {
      this._writeNumberValue(Buffer.prototype.writeInt8, 1, value, offset);
      return this;
    }
    insertInt8(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeInt8, 1, value, offset);
    }
    writeInt16BE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeInt16BE, 2, value, offset);
    }
    insertInt16BE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeInt16BE, 2, value, offset);
    }
    writeInt16LE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeInt16LE, 2, value, offset);
    }
    insertInt16LE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeInt16LE, 2, value, offset);
    }
    writeInt32BE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeInt32BE, 4, value, offset);
    }
    insertInt32BE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeInt32BE, 4, value, offset);
    }
    writeInt32LE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeInt32LE, 4, value, offset);
    }
    insertInt32LE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeInt32LE, 4, value, offset);
    }
    writeBigInt64BE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigInt64BE");
      return this._writeNumberValue(Buffer.prototype.writeBigInt64BE, 8, value, offset);
    }
    insertBigInt64BE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigInt64BE");
      return this._insertNumberValue(Buffer.prototype.writeBigInt64BE, 8, value, offset);
    }
    writeBigInt64LE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigInt64LE");
      return this._writeNumberValue(Buffer.prototype.writeBigInt64LE, 8, value, offset);
    }
    insertBigInt64LE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigInt64LE");
      return this._insertNumberValue(Buffer.prototype.writeBigInt64LE, 8, value, offset);
    }
    readUInt8(offset) {
      return this._readNumberValue(Buffer.prototype.readUInt8, 1, offset);
    }
    readUInt16BE(offset) {
      return this._readNumberValue(Buffer.prototype.readUInt16BE, 2, offset);
    }
    readUInt16LE(offset) {
      return this._readNumberValue(Buffer.prototype.readUInt16LE, 2, offset);
    }
    readUInt32BE(offset) {
      return this._readNumberValue(Buffer.prototype.readUInt32BE, 4, offset);
    }
    readUInt32LE(offset) {
      return this._readNumberValue(Buffer.prototype.readUInt32LE, 4, offset);
    }
    readBigUInt64BE(offset) {
      utils_1.bigIntAndBufferInt64Check("readBigUInt64BE");
      return this._readNumberValue(Buffer.prototype.readBigUInt64BE, 8, offset);
    }
    readBigUInt64LE(offset) {
      utils_1.bigIntAndBufferInt64Check("readBigUInt64LE");
      return this._readNumberValue(Buffer.prototype.readBigUInt64LE, 8, offset);
    }
    writeUInt8(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeUInt8, 1, value, offset);
    }
    insertUInt8(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeUInt8, 1, value, offset);
    }
    writeUInt16BE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeUInt16BE, 2, value, offset);
    }
    insertUInt16BE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeUInt16BE, 2, value, offset);
    }
    writeUInt16LE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeUInt16LE, 2, value, offset);
    }
    insertUInt16LE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeUInt16LE, 2, value, offset);
    }
    writeUInt32BE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeUInt32BE, 4, value, offset);
    }
    insertUInt32BE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeUInt32BE, 4, value, offset);
    }
    writeUInt32LE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeUInt32LE, 4, value, offset);
    }
    insertUInt32LE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeUInt32LE, 4, value, offset);
    }
    writeBigUInt64BE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigUInt64BE");
      return this._writeNumberValue(Buffer.prototype.writeBigUInt64BE, 8, value, offset);
    }
    insertBigUInt64BE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigUInt64BE");
      return this._insertNumberValue(Buffer.prototype.writeBigUInt64BE, 8, value, offset);
    }
    writeBigUInt64LE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigUInt64LE");
      return this._writeNumberValue(Buffer.prototype.writeBigUInt64LE, 8, value, offset);
    }
    insertBigUInt64LE(value, offset) {
      utils_1.bigIntAndBufferInt64Check("writeBigUInt64LE");
      return this._insertNumberValue(Buffer.prototype.writeBigUInt64LE, 8, value, offset);
    }
    readFloatBE(offset) {
      return this._readNumberValue(Buffer.prototype.readFloatBE, 4, offset);
    }
    readFloatLE(offset) {
      return this._readNumberValue(Buffer.prototype.readFloatLE, 4, offset);
    }
    writeFloatBE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeFloatBE, 4, value, offset);
    }
    insertFloatBE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeFloatBE, 4, value, offset);
    }
    writeFloatLE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeFloatLE, 4, value, offset);
    }
    insertFloatLE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeFloatLE, 4, value, offset);
    }
    readDoubleBE(offset) {
      return this._readNumberValue(Buffer.prototype.readDoubleBE, 8, offset);
    }
    readDoubleLE(offset) {
      return this._readNumberValue(Buffer.prototype.readDoubleLE, 8, offset);
    }
    writeDoubleBE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeDoubleBE, 8, value, offset);
    }
    insertDoubleBE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeDoubleBE, 8, value, offset);
    }
    writeDoubleLE(value, offset) {
      return this._writeNumberValue(Buffer.prototype.writeDoubleLE, 8, value, offset);
    }
    insertDoubleLE(value, offset) {
      return this._insertNumberValue(Buffer.prototype.writeDoubleLE, 8, value, offset);
    }
    readString(arg1, encoding) {
      let lengthVal;
      if (typeof arg1 === "number") {
        utils_1.checkLengthValue(arg1);
        lengthVal = Math.min(arg1, this.length - this._readOffset);
      } else {
        encoding = arg1;
        lengthVal = this.length - this._readOffset;
      }
      if (typeof encoding !== "undefined") {
        utils_1.checkEncoding(encoding);
      }
      const value = this._buff.slice(this._readOffset, this._readOffset + lengthVal).toString(encoding || this._encoding);
      this._readOffset += lengthVal;
      return value;
    }
    insertString(value, offset, encoding) {
      utils_1.checkOffsetValue(offset);
      return this._handleString(value, true, offset, encoding);
    }
    writeString(value, arg2, encoding) {
      return this._handleString(value, false, arg2, encoding);
    }
    readStringNT(encoding) {
      if (typeof encoding !== "undefined") {
        utils_1.checkEncoding(encoding);
      }
      let nullPos = this.length;
      for (let i = this._readOffset;i < this.length; i++) {
        if (this._buff[i] === 0) {
          nullPos = i;
          break;
        }
      }
      const value = this._buff.slice(this._readOffset, nullPos);
      this._readOffset = nullPos + 1;
      return value.toString(encoding || this._encoding);
    }
    insertStringNT(value, offset, encoding) {
      utils_1.checkOffsetValue(offset);
      this.insertString(value, offset, encoding);
      this.insertUInt8(0, offset + value.length);
      return this;
    }
    writeStringNT(value, arg2, encoding) {
      this.writeString(value, arg2, encoding);
      this.writeUInt8(0, typeof arg2 === "number" ? arg2 + value.length : this.writeOffset);
      return this;
    }
    readBuffer(length) {
      if (typeof length !== "undefined") {
        utils_1.checkLengthValue(length);
      }
      const lengthVal = typeof length === "number" ? length : this.length;
      const endPoint = Math.min(this.length, this._readOffset + lengthVal);
      const value = this._buff.slice(this._readOffset, endPoint);
      this._readOffset = endPoint;
      return value;
    }
    insertBuffer(value, offset) {
      utils_1.checkOffsetValue(offset);
      return this._handleBuffer(value, true, offset);
    }
    writeBuffer(value, offset) {
      return this._handleBuffer(value, false, offset);
    }
    readBufferNT() {
      let nullPos = this.length;
      for (let i = this._readOffset;i < this.length; i++) {
        if (this._buff[i] === 0) {
          nullPos = i;
          break;
        }
      }
      const value = this._buff.slice(this._readOffset, nullPos);
      this._readOffset = nullPos + 1;
      return value;
    }
    insertBufferNT(value, offset) {
      utils_1.checkOffsetValue(offset);
      this.insertBuffer(value, offset);
      this.insertUInt8(0, offset + value.length);
      return this;
    }
    writeBufferNT(value, offset) {
      if (typeof offset !== "undefined") {
        utils_1.checkOffsetValue(offset);
      }
      this.writeBuffer(value, offset);
      this.writeUInt8(0, typeof offset === "number" ? offset + value.length : this._writeOffset);
      return this;
    }
    clear() {
      this._writeOffset = 0;
      this._readOffset = 0;
      this.length = 0;
      return this;
    }
    remaining() {
      return this.length - this._readOffset;
    }
    get readOffset() {
      return this._readOffset;
    }
    set readOffset(offset) {
      utils_1.checkOffsetValue(offset);
      utils_1.checkTargetOffset(offset, this);
      this._readOffset = offset;
    }
    get writeOffset() {
      return this._writeOffset;
    }
    set writeOffset(offset) {
      utils_1.checkOffsetValue(offset);
      utils_1.checkTargetOffset(offset, this);
      this._writeOffset = offset;
    }
    get encoding() {
      return this._encoding;
    }
    set encoding(encoding) {
      utils_1.checkEncoding(encoding);
      this._encoding = encoding;
    }
    get internalBuffer() {
      return this._buff;
    }
    toBuffer() {
      return this._buff.slice(0, this.length);
    }
    toString(encoding) {
      const encodingVal = typeof encoding === "string" ? encoding : this._encoding;
      utils_1.checkEncoding(encodingVal);
      return this._buff.toString(encodingVal, 0, this.length);
    }
    destroy() {
      this.clear();
      return this;
    }
    _handleString(value, isInsert, arg3, encoding) {
      let offsetVal = this._writeOffset;
      let encodingVal = this._encoding;
      if (typeof arg3 === "number") {
        offsetVal = arg3;
      } else if (typeof arg3 === "string") {
        utils_1.checkEncoding(arg3);
        encodingVal = arg3;
      }
      if (typeof encoding === "string") {
        utils_1.checkEncoding(encoding);
        encodingVal = encoding;
      }
      const byteLength = Buffer.byteLength(value, encodingVal);
      if (isInsert) {
        this.ensureInsertable(byteLength, offsetVal);
      } else {
        this._ensureWriteable(byteLength, offsetVal);
      }
      this._buff.write(value, offsetVal, byteLength, encodingVal);
      if (isInsert) {
        this._writeOffset += byteLength;
      } else {
        if (typeof arg3 === "number") {
          this._writeOffset = Math.max(this._writeOffset, offsetVal + byteLength);
        } else {
          this._writeOffset += byteLength;
        }
      }
      return this;
    }
    _handleBuffer(value, isInsert, offset) {
      const offsetVal = typeof offset === "number" ? offset : this._writeOffset;
      if (isInsert) {
        this.ensureInsertable(value.length, offsetVal);
      } else {
        this._ensureWriteable(value.length, offsetVal);
      }
      value.copy(this._buff, offsetVal);
      if (isInsert) {
        this._writeOffset += value.length;
      } else {
        if (typeof offset === "number") {
          this._writeOffset = Math.max(this._writeOffset, offsetVal + value.length);
        } else {
          this._writeOffset += value.length;
        }
      }
      return this;
    }
    ensureReadable(length, offset) {
      let offsetVal = this._readOffset;
      if (typeof offset !== "undefined") {
        utils_1.checkOffsetValue(offset);
        offsetVal = offset;
      }
      if (offsetVal < 0 || offsetVal + length > this.length) {
        throw new Error(utils_1.ERRORS.INVALID_READ_BEYOND_BOUNDS);
      }
    }
    ensureInsertable(dataLength, offset) {
      utils_1.checkOffsetValue(offset);
      this._ensureCapacity(this.length + dataLength);
      if (offset < this.length) {
        this._buff.copy(this._buff, offset + dataLength, offset, this._buff.length);
      }
      if (offset + dataLength > this.length) {
        this.length = offset + dataLength;
      } else {
        this.length += dataLength;
      }
    }
    _ensureWriteable(dataLength, offset) {
      const offsetVal = typeof offset === "number" ? offset : this._writeOffset;
      this._ensureCapacity(offsetVal + dataLength);
      if (offsetVal + dataLength > this.length) {
        this.length = offsetVal + dataLength;
      }
    }
    _ensureCapacity(minLength) {
      const oldLength = this._buff.length;
      if (minLength > oldLength) {
        let data = this._buff;
        let newLength = oldLength * 3 / 2 + 1;
        if (newLength < minLength) {
          newLength = minLength;
        }
        this._buff = Buffer.allocUnsafe(newLength);
        data.copy(this._buff, 0, 0, oldLength);
      }
    }
    _readNumberValue(func, byteSize, offset) {
      this.ensureReadable(byteSize, offset);
      const value = func.call(this._buff, typeof offset === "number" ? offset : this._readOffset);
      if (typeof offset === "undefined") {
        this._readOffset += byteSize;
      }
      return value;
    }
    _insertNumberValue(func, byteSize, value, offset) {
      utils_1.checkOffsetValue(offset);
      this.ensureInsertable(byteSize, offset);
      func.call(this._buff, value, offset);
      this._writeOffset += byteSize;
      return this;
    }
    _writeNumberValue(func, byteSize, value, offset) {
      if (typeof offset === "number") {
        if (offset < 0) {
          throw new Error(utils_1.ERRORS.INVALID_WRITE_BEYOND_BOUNDS);
        }
        utils_1.checkOffsetValue(offset);
      }
      const offsetVal = typeof offset === "number" ? offset : this._writeOffset;
      this._ensureWriteable(byteSize, offsetVal);
      func.call(this._buff, value, offsetVal);
      if (typeof offset === "number") {
        this._writeOffset = Math.max(this._writeOffset, offsetVal + byteSize);
      } else {
        this._writeOffset += byteSize;
      }
      return this;
    }
  }
  exports.SmartBuffer = SmartBuffer;
});

// node_modules/socks/build/common/constants.js
var require_constants2 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.SOCKS5_NO_ACCEPTABLE_AUTH = exports.SOCKS5_CUSTOM_AUTH_END = exports.SOCKS5_CUSTOM_AUTH_START = exports.SOCKS_INCOMING_PACKET_SIZES = exports.SocksClientState = exports.Socks5Response = exports.Socks5HostType = exports.Socks5Auth = exports.Socks4Response = exports.SocksCommand = exports.ERRORS = exports.DEFAULT_TIMEOUT = undefined;
  var DEFAULT_TIMEOUT = 30000;
  exports.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
  var ERRORS = {
    InvalidSocksCommand: "An invalid SOCKS command was provided. Valid options are connect, bind, and associate.",
    InvalidSocksCommandForOperation: "An invalid SOCKS command was provided. Only a subset of commands are supported for this operation.",
    InvalidSocksCommandChain: "An invalid SOCKS command was provided. Chaining currently only supports the connect command.",
    InvalidSocksClientOptionsDestination: "An invalid destination host was provided.",
    InvalidSocksClientOptionsExistingSocket: "An invalid existing socket was provided. This should be an instance of stream.Duplex.",
    InvalidSocksClientOptionsProxy: "Invalid SOCKS proxy details were provided.",
    InvalidSocksClientOptionsTimeout: "An invalid timeout value was provided. Please enter a value above 0 (in ms).",
    InvalidSocksClientOptionsProxiesLength: "At least two socks proxies must be provided for chaining.",
    InvalidSocksClientOptionsCustomAuthRange: "Custom auth must be a value between 0x80 and 0xFE.",
    InvalidSocksClientOptionsCustomAuthOptions: "When a custom_auth_method is provided, custom_auth_request_handler, custom_auth_response_size, and custom_auth_response_handler must also be provided and valid.",
    NegotiationError: "Negotiation error",
    SocketClosed: "Socket closed",
    ProxyConnectionTimedOut: "Proxy connection timed out",
    InternalError: "SocksClient internal error (this should not happen)",
    InvalidSocks4HandshakeResponse: "Received invalid Socks4 handshake response",
    Socks4ProxyRejectedConnection: "Socks4 Proxy rejected connection",
    InvalidSocks4IncomingConnectionResponse: "Socks4 invalid incoming connection response",
    Socks4ProxyRejectedIncomingBoundConnection: "Socks4 Proxy rejected incoming bound connection",
    InvalidSocks5InitialHandshakeResponse: "Received invalid Socks5 initial handshake response",
    InvalidSocks5IntiailHandshakeSocksVersion: "Received invalid Socks5 initial handshake (invalid socks version)",
    InvalidSocks5InitialHandshakeNoAcceptedAuthType: "Received invalid Socks5 initial handshake (no accepted authentication type)",
    InvalidSocks5InitialHandshakeUnknownAuthType: "Received invalid Socks5 initial handshake (unknown authentication type)",
    Socks5AuthenticationFailed: "Socks5 Authentication failed",
    InvalidSocks5FinalHandshake: "Received invalid Socks5 final handshake response",
    InvalidSocks5FinalHandshakeRejected: "Socks5 proxy rejected connection",
    InvalidSocks5IncomingConnectionResponse: "Received invalid Socks5 incoming connection response",
    Socks5ProxyRejectedIncomingBoundConnection: "Socks5 Proxy rejected incoming bound connection"
  };
  exports.ERRORS = ERRORS;
  var SOCKS_INCOMING_PACKET_SIZES = {
    Socks5InitialHandshakeResponse: 2,
    Socks5UserPassAuthenticationResponse: 2,
    Socks5ResponseHeader: 5,
    Socks5ResponseIPv4: 10,
    Socks5ResponseIPv6: 22,
    Socks5ResponseHostname: (hostNameLength) => hostNameLength + 7,
    Socks4Response: 8
  };
  exports.SOCKS_INCOMING_PACKET_SIZES = SOCKS_INCOMING_PACKET_SIZES;
  var SocksCommand;
  (function(SocksCommand) {
    SocksCommand[SocksCommand["connect"] = 1] = "connect";
    SocksCommand[SocksCommand["bind"] = 2] = "bind";
    SocksCommand[SocksCommand["associate"] = 3] = "associate";
  })(SocksCommand || (exports.SocksCommand = SocksCommand = {}));
  var Socks4Response;
  (function(Socks4Response) {
    Socks4Response[Socks4Response["Granted"] = 90] = "Granted";
    Socks4Response[Socks4Response["Failed"] = 91] = "Failed";
    Socks4Response[Socks4Response["Rejected"] = 92] = "Rejected";
    Socks4Response[Socks4Response["RejectedIdent"] = 93] = "RejectedIdent";
  })(Socks4Response || (exports.Socks4Response = Socks4Response = {}));
  var Socks5Auth;
  (function(Socks5Auth) {
    Socks5Auth[Socks5Auth["NoAuth"] = 0] = "NoAuth";
    Socks5Auth[Socks5Auth["GSSApi"] = 1] = "GSSApi";
    Socks5Auth[Socks5Auth["UserPass"] = 2] = "UserPass";
  })(Socks5Auth || (exports.Socks5Auth = Socks5Auth = {}));
  var SOCKS5_CUSTOM_AUTH_START = 128;
  exports.SOCKS5_CUSTOM_AUTH_START = SOCKS5_CUSTOM_AUTH_START;
  var SOCKS5_CUSTOM_AUTH_END = 254;
  exports.SOCKS5_CUSTOM_AUTH_END = SOCKS5_CUSTOM_AUTH_END;
  var SOCKS5_NO_ACCEPTABLE_AUTH = 255;
  exports.SOCKS5_NO_ACCEPTABLE_AUTH = SOCKS5_NO_ACCEPTABLE_AUTH;
  var Socks5Response;
  (function(Socks5Response) {
    Socks5Response[Socks5Response["Granted"] = 0] = "Granted";
    Socks5Response[Socks5Response["Failure"] = 1] = "Failure";
    Socks5Response[Socks5Response["NotAllowed"] = 2] = "NotAllowed";
    Socks5Response[Socks5Response["NetworkUnreachable"] = 3] = "NetworkUnreachable";
    Socks5Response[Socks5Response["HostUnreachable"] = 4] = "HostUnreachable";
    Socks5Response[Socks5Response["ConnectionRefused"] = 5] = "ConnectionRefused";
    Socks5Response[Socks5Response["TTLExpired"] = 6] = "TTLExpired";
    Socks5Response[Socks5Response["CommandNotSupported"] = 7] = "CommandNotSupported";
    Socks5Response[Socks5Response["AddressNotSupported"] = 8] = "AddressNotSupported";
  })(Socks5Response || (exports.Socks5Response = Socks5Response = {}));
  var Socks5HostType;
  (function(Socks5HostType) {
    Socks5HostType[Socks5HostType["IPv4"] = 1] = "IPv4";
    Socks5HostType[Socks5HostType["Hostname"] = 3] = "Hostname";
    Socks5HostType[Socks5HostType["IPv6"] = 4] = "IPv6";
  })(Socks5HostType || (exports.Socks5HostType = Socks5HostType = {}));
  var SocksClientState;
  (function(SocksClientState) {
    SocksClientState[SocksClientState["Created"] = 0] = "Created";
    SocksClientState[SocksClientState["Connecting"] = 1] = "Connecting";
    SocksClientState[SocksClientState["Connected"] = 2] = "Connected";
    SocksClientState[SocksClientState["SentInitialHandshake"] = 3] = "SentInitialHandshake";
    SocksClientState[SocksClientState["ReceivedInitialHandshakeResponse"] = 4] = "ReceivedInitialHandshakeResponse";
    SocksClientState[SocksClientState["SentAuthentication"] = 5] = "SentAuthentication";
    SocksClientState[SocksClientState["ReceivedAuthenticationResponse"] = 6] = "ReceivedAuthenticationResponse";
    SocksClientState[SocksClientState["SentFinalHandshake"] = 7] = "SentFinalHandshake";
    SocksClientState[SocksClientState["ReceivedFinalResponse"] = 8] = "ReceivedFinalResponse";
    SocksClientState[SocksClientState["BoundWaitingForConnection"] = 9] = "BoundWaitingForConnection";
    SocksClientState[SocksClientState["Established"] = 10] = "Established";
    SocksClientState[SocksClientState["Disconnected"] = 11] = "Disconnected";
    SocksClientState[SocksClientState["Error"] = 99] = "Error";
  })(SocksClientState || (exports.SocksClientState = SocksClientState = {}));
});

// node_modules/socks/build/common/util.js
var require_util = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.shuffleArray = exports.SocksClientError = undefined;

  class SocksClientError extends Error {
    constructor(message, options) {
      super(message);
      this.options = options;
    }
  }
  exports.SocksClientError = SocksClientError;
  function shuffleArray(array) {
    for (let i = array.length - 1;i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
  exports.shuffleArray = shuffleArray;
});

// node_modules/ip-address/dist/address-error.js
var require_address_error = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.AddressError = undefined;

  class AddressError extends Error {
    constructor(message, parseMessage) {
      super(message);
      this.name = "AddressError";
      this.parseMessage = parseMessage;
    }
  }
  exports.AddressError = AddressError;
});

// node_modules/ip-address/dist/common.js
var require_common = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.isInSubnet = isInSubnet;
  exports.isHostInSubnet = isHostInSubnet;
  exports.isCorrect = isCorrect;
  exports.prefixLengthFromMask = prefixLengthFromMask;
  exports.numberToPaddedHex = numberToPaddedHex;
  exports.stringToPaddedHex = stringToPaddedHex;
  exports.testBit = testBit;
  var address_error_1 = require_address_error();
  function isInSubnet(address) {
    if (this.subnetMask < address.subnetMask) {
      return false;
    }
    return isHostInSubnet.call(this, address);
  }
  function isHostInSubnet(address) {
    return this.mask(address.subnetMask) === address.mask();
  }
  function isCorrect(defaultBits) {
    return function() {
      if (this.addressMinusSuffix !== this.correctForm()) {
        return false;
      }
      if (this.subnetMask === defaultBits && !this.parsedSubnet) {
        return true;
      }
      return this.parsedSubnet === String(this.subnetMask);
    };
  }
  function prefixLengthFromMask(value, totalBits) {
    const binary = value.toString(2).padStart(totalBits, "0");
    if (binary.length > totalBits) {
      throw new address_error_1.AddressError("Invalid subnet mask.");
    }
    const firstZero = binary.indexOf("0");
    if (firstZero === -1) {
      return totalBits;
    }
    if (binary.slice(firstZero).includes("1")) {
      throw new address_error_1.AddressError("Invalid subnet mask.");
    }
    return firstZero;
  }
  function numberToPaddedHex(number) {
    return number.toString(16).padStart(2, "0");
  }
  function stringToPaddedHex(numberString) {
    return numberToPaddedHex(parseInt(numberString, 10));
  }
  function testBit(binaryValue, position) {
    const { length } = binaryValue;
    if (position > length) {
      return false;
    }
    const positionInString = length - position;
    return binaryValue.substring(positionInString, positionInString + 1) === "1";
  }
});

// node_modules/ip-address/dist/v4/constants.js
var require_constants3 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.RE_SUBNET_STRING = exports.RE_ADDRESS = exports.GROUPS = exports.BITS = undefined;
  exports.BITS = 32;
  exports.GROUPS = 4;
  exports.RE_ADDRESS = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/g;
  exports.RE_SUBNET_STRING = /\/\d{1,2}$/;
});

// node_modules/ip-address/dist/ipv4.js
var require_ipv4 = __commonJS(function(exports) {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Address4 = undefined;
  var common = __importStar(require_common());
  var constants = __importStar(require_constants3());
  var address_error_1 = require_address_error();
  var isCorrect4 = common.isCorrect(constants.BITS);

  class Address4 {
    constructor(address) {
      this.addressMinusSuffix = "";
      this.groups = constants.GROUPS;
      this.parsedAddress = [];
      this.parsedSubnet = "";
      this.subnet = "/32";
      this.subnetMask = 32;
      this.v4 = true;
      this.isCorrect = isCorrect4;
      this.isInSubnet = common.isInSubnet;
      this.isHostInSubnet = common.isHostInSubnet;
      this.address = address;
      const subnet = constants.RE_SUBNET_STRING.exec(address);
      if (subnet) {
        this.parsedSubnet = subnet[0].replace("/", "");
        this.subnetMask = parseInt(this.parsedSubnet, 10);
        this.subnet = `/${this.subnetMask}`;
        if (this.subnetMask < 0 || this.subnetMask > constants.BITS) {
          throw new address_error_1.AddressError("Invalid subnet mask.");
        }
        address = address.replace(constants.RE_SUBNET_STRING, "");
      }
      this.addressMinusSuffix = address;
      this.parsedAddress = this.parse(address);
    }
    static isValid(address) {
      try {
        new Address4(address);
        return true;
      } catch (e) {
        return false;
      }
    }
    parse(address) {
      const groups = address.split(".");
      if (groups.some((group) => /^0\d/.test(group))) {
        throw new address_error_1.AddressError("IPv4 addresses can't have leading zeroes.");
      }
      if (!address.match(constants.RE_ADDRESS)) {
        throw new address_error_1.AddressError("Invalid IPv4 address.");
      }
      return groups;
    }
    correctForm() {
      return this.parsedAddress.map((part) => parseInt(part, 10)).join(".");
    }
    static fromAddressAndMask(address, mask) {
      const bits = common.prefixLengthFromMask(new Address4(mask).bigInt(), constants.BITS);
      return new Address4(`${address}/${bits}`);
    }
    static fromAddressAndWildcardMask(address, wildcardMask) {
      const wildcard = new Address4(wildcardMask).bigInt();
      const allOnes = (BigInt(1) << BigInt(constants.BITS)) - BigInt(1);
      const mask = wildcard ^ allOnes;
      const bits = common.prefixLengthFromMask(mask, constants.BITS);
      return new Address4(`${address}/${bits}`);
    }
    static fromWildcard(input) {
      const groups = input.split(".");
      if (groups.length !== constants.GROUPS) {
        throw new address_error_1.AddressError("Wildcard pattern must have 4 octets");
      }
      let firstWildcard = -1;
      for (let i = 0;i < groups.length; i++) {
        if (groups[i] === "*") {
          if (firstWildcard === -1) {
            firstWildcard = i;
          }
        } else if (firstWildcard !== -1) {
          throw new address_error_1.AddressError("Wildcard `*` must only appear in trailing octets (e.g. `192.168.0.*`)");
        }
      }
      const trailing = firstWildcard === -1 ? 0 : groups.length - firstWildcard;
      const replaced = groups.map((g) => g === "*" ? "0" : g);
      const subnetBits = constants.BITS - trailing * 8;
      return new Address4(`${replaced.join(".")}/${subnetBits}`);
    }
    static fromHex(hex) {
      const stripped = hex.replace(/:/g, "");
      if (!/^[0-9a-fA-F]{8}$/.test(stripped)) {
        throw new address_error_1.AddressError("IPv4 hex must be exactly 8 hex digits");
      }
      const groups = [];
      for (let i = 0;i < 8; i += 2) {
        groups.push(parseInt(stripped.slice(i, i + 2), 16));
      }
      return new Address4(groups.join("."));
    }
    static fromInteger(integer) {
      if (!Number.isInteger(integer) || integer < 0 || integer > 4294967295) {
        throw new address_error_1.AddressError("IPv4 integer must be in the range 0 to 2**32 - 1");
      }
      return Address4.fromHex(integer.toString(16).padStart(8, "0"));
    }
    static fromArpa(arpaFormAddress) {
      const leader = arpaFormAddress.replace(/(\.in-addr\.arpa)?\.$/, "");
      const address = leader.split(".").reverse().join(".");
      return new Address4(address);
    }
    toHex() {
      return this.parsedAddress.map((part) => common.stringToPaddedHex(part)).join(":");
    }
    toArray() {
      return this.parsedAddress.map((part) => parseInt(part, 10));
    }
    toGroup6() {
      const output = [];
      let i;
      for (i = 0;i < constants.GROUPS; i += 2) {
        output.push(`${common.stringToPaddedHex(this.parsedAddress[i])}${common.stringToPaddedHex(this.parsedAddress[i + 1])}`);
      }
      return output.join(":");
    }
    bigInt() {
      return BigInt(`0x${this.parsedAddress.map((n) => common.stringToPaddedHex(n)).join("")}`);
    }
    _startAddress() {
      return BigInt(`0b${this.mask() + "0".repeat(constants.BITS - this.subnetMask)}`);
    }
    startAddress() {
      return Address4.fromBigInt(this._startAddress());
    }
    startAddressExclusive() {
      const adjust = BigInt("1");
      return Address4.fromBigInt(this._startAddress() + adjust);
    }
    _endAddress() {
      return BigInt(`0b${this.mask() + "1".repeat(constants.BITS - this.subnetMask)}`);
    }
    endAddress() {
      return Address4.fromBigInt(this._endAddress());
    }
    endAddressExclusive() {
      const adjust = BigInt("1");
      return Address4.fromBigInt(this._endAddress() - adjust);
    }
    subnetMaskAddress() {
      return Address4.fromBigInt(BigInt(`0b${"1".repeat(this.subnetMask)}${"0".repeat(constants.BITS - this.subnetMask)}`));
    }
    wildcardMask() {
      return Address4.fromBigInt(BigInt(`0b${"0".repeat(this.subnetMask)}${"1".repeat(constants.BITS - this.subnetMask)}`));
    }
    networkForm() {
      return `${this.startAddress().correctForm()}/${this.subnetMask}`;
    }
    static fromBigInt(bigInt) {
      if (bigInt < 0n || bigInt > 0xffffffffn) {
        throw new address_error_1.AddressError("IPv4 BigInt must be in the range 0 to 2**32 - 1");
      }
      return Address4.fromHex(bigInt.toString(16).padStart(8, "0"));
    }
    static fromByteArray(bytes) {
      if (bytes.length !== 4) {
        throw new address_error_1.AddressError("IPv4 addresses require exactly 4 bytes");
      }
      for (let i = 0;i < bytes.length; i++) {
        if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) {
          throw new address_error_1.AddressError("All bytes must be integers between 0 and 255");
        }
      }
      return this.fromUnsignedByteArray(bytes);
    }
    static fromUnsignedByteArray(bytes) {
      if (bytes.length !== 4) {
        throw new address_error_1.AddressError("IPv4 addresses require exactly 4 bytes");
      }
      const address = bytes.join(".");
      return new Address4(address);
    }
    mask(mask) {
      if (mask === undefined) {
        mask = this.subnetMask;
      }
      return this.getBitsBase2(0, mask);
    }
    getBitsBase2(start, end) {
      return this.binaryZeroPad().slice(start, end);
    }
    reverseForm(options) {
      if (!options) {
        options = {};
      }
      const reversed = this.correctForm().split(".").reverse().join(".");
      if (options.omitSuffix) {
        return reversed;
      }
      return `${reversed}.in-addr.arpa.`;
    }
    isMulticast() {
      return this.isHostInSubnet(MULTICAST_V4);
    }
    isPrivate() {
      return PRIVATE_V4.some((subnet) => this.isHostInSubnet(subnet));
    }
    isLoopback() {
      return this.isHostInSubnet(LOOPBACK_V4);
    }
    isLinkLocal() {
      return this.isHostInSubnet(LINK_LOCAL_V4);
    }
    isUnspecified() {
      return this.isHostInSubnet(UNSPECIFIED_V4);
    }
    isBroadcast() {
      return this.isHostInSubnet(BROADCAST_V4);
    }
    isCGNAT() {
      return this.isHostInSubnet(CGNAT_V4);
    }
    binaryZeroPad() {
      if (this._binaryZeroPad === undefined) {
        this._binaryZeroPad = this.bigInt().toString(2).padStart(constants.BITS, "0");
      }
      return this._binaryZeroPad;
    }
    groupForV6() {
      const segments = this.parsedAddress;
      return this.correctForm().replace(constants.RE_ADDRESS, `<span class="hover-group group-v4 group-6">${segments.slice(0, 2).join(".")}</span>.<span class="hover-group group-v4 group-7">${segments.slice(2, 4).join(".")}</span>`);
    }
  }
  exports.Address4 = Address4;
  var MULTICAST_V4 = new Address4("224.0.0.0/4");
  var PRIVATE_V4 = [
    new Address4("10.0.0.0/8"),
    new Address4("172.16.0.0/12"),
    new Address4("192.168.0.0/16")
  ];
  var LOOPBACK_V4 = new Address4("127.0.0.0/8");
  var LINK_LOCAL_V4 = new Address4("169.254.0.0/16");
  var UNSPECIFIED_V4 = new Address4("0.0.0.0/32");
  var BROADCAST_V4 = new Address4("255.255.255.255/32");
  var CGNAT_V4 = new Address4("100.64.0.0/10");
});

// node_modules/ip-address/dist/v6/constants.js
var require_constants4 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.RE_URL_WITH_PORT = exports.RE_URL = exports.RE_ZONE_STRING = exports.RE_SUBNET_STRING = exports.RE_BAD_ADDRESS = exports.RE_BAD_CHARACTERS = exports.TYPES = exports.SCOPES = exports.GROUPS = exports.BITS = undefined;
  exports.BITS = 128;
  exports.GROUPS = 8;
  exports.SCOPES = {
    0: "Reserved",
    1: "Interface local",
    2: "Link local",
    4: "Admin local",
    5: "Site local",
    8: "Organization local",
    14: "Global",
    15: "Reserved"
  };
  exports.TYPES = {
    "ff01::1/128": "Multicast (All nodes on this interface)",
    "ff01::2/128": "Multicast (All routers on this interface)",
    "ff02::1/128": "Multicast (All nodes on this link)",
    "ff02::2/128": "Multicast (All routers on this link)",
    "ff05::2/128": "Multicast (All routers in this site)",
    "ff02::5/128": "Multicast (OSPFv3 AllSPF routers)",
    "ff02::6/128": "Multicast (OSPFv3 AllDR routers)",
    "ff02::9/128": "Multicast (RIP routers)",
    "ff02::a/128": "Multicast (EIGRP routers)",
    "ff02::d/128": "Multicast (PIM routers)",
    "ff02::16/128": "Multicast (MLDv2 reports)",
    "ff01::fb/128": "Multicast (mDNSv6)",
    "ff02::fb/128": "Multicast (mDNSv6)",
    "ff05::fb/128": "Multicast (mDNSv6)",
    "ff02::1:2/128": "Multicast (All DHCP servers and relay agents on this link)",
    "ff05::1:2/128": "Multicast (All DHCP servers and relay agents in this site)",
    "ff02::1:3/128": "Multicast (All DHCP servers on this link)",
    "ff05::1:3/128": "Multicast (All DHCP servers in this site)",
    "::/128": "Unspecified",
    "::1/128": "Loopback",
    "::ffff:0:0/96": "IPv4-mapped",
    "ff00::/8": "Multicast",
    "fe80::/10": "Link-local unicast",
    "fc00::/7": "Unique local",
    "2002::/16": "6to4",
    "2001:db8::/32": "Documentation",
    "64:ff9b::/96": "NAT64 (well-known)",
    "64:ff9b:1::/48": "NAT64 (local-use)"
  };
  exports.RE_BAD_CHARACTERS = /([^0-9a-f:/%])/gi;
  exports.RE_BAD_ADDRESS = /([0-9a-f]{5,}|:{3,}|[^:]:$|^:[^:]|\/$)/gi;
  exports.RE_SUBNET_STRING = /\/\d{1,3}(?=%|$)/;
  exports.RE_ZONE_STRING = /%.*$/;
  exports.RE_URL = /^(?:\[([0-9a-f:.]+)\]|([0-9a-f:.]+))(?:[/?#].*)?$/i;
  exports.RE_URL_WITH_PORT = /^\[([0-9a-f:.]+)\]:([0-9]{1,5})(?:[/?#].*)?$/i;
});

// node_modules/ip-address/dist/v6/helpers.js
var require_helpers = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.escapeHtml = escapeHtml;
  exports.spanAllZeroes = spanAllZeroes;
  exports.spanAll = spanAll;
  exports.spanLeadingZeroes = spanLeadingZeroes;
  exports.simpleGroup = simpleGroup;
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function spanAllZeroes(s) {
    return escapeHtml(s).replace(/(0+)/g, '<span class="zero">$1</span>');
  }
  function spanAll(s, offset = 0) {
    const letters = s.split("");
    return letters.map((n, i) => `<span class="digit value-${escapeHtml(n)} position-${i + offset}">${spanAllZeroes(n)}</span>`).join("");
  }
  function spanLeadingZeroesSimple(group) {
    return escapeHtml(group).replace(/^(0+)/, '<span class="zero">$1</span>');
  }
  function spanLeadingZeroes(address) {
    const groups = address.split(":");
    return groups.map((g) => spanLeadingZeroesSimple(g)).join(":");
  }
  function simpleGroup(addressString, offset = 0) {
    const groups = addressString.split(":");
    return groups.map((g, i) => {
      if (/group-v4/.test(g)) {
        return g;
      }
      return `<span class="hover-group group-${i + offset}">${spanLeadingZeroesSimple(g)}</span>`;
    });
  }
});

// node_modules/ip-address/dist/v6/regular-expressions.js
var require_regular_expressions = __commonJS(function(exports) {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ADDRESS_BOUNDARY = undefined;
  exports.groupPossibilities = groupPossibilities;
  exports.padGroup = padGroup;
  exports.simpleRegularExpression = simpleRegularExpression;
  exports.possibleElisions = possibleElisions;
  var v6 = __importStar(require_constants4());
  function groupPossibilities(possibilities) {
    return `(${possibilities.join("|")})`;
  }
  function padGroup(group) {
    if (group.length < 4) {
      return `0{0,${4 - group.length}}${group}`;
    }
    return group;
  }
  exports.ADDRESS_BOUNDARY = "[^A-Fa-f0-9:]";
  function simpleRegularExpression(groups) {
    const zeroIndexes = [];
    groups.forEach((group, i) => {
      const groupInteger = parseInt(group, 16);
      if (groupInteger === 0) {
        zeroIndexes.push(i);
      }
    });
    const possibilities = zeroIndexes.map((zeroIndex) => groups.map((group, i) => {
      if (i === zeroIndex) {
        const elision = i === 0 || i === v6.GROUPS - 1 ? ":" : "";
        return groupPossibilities([padGroup(group), elision]);
      }
      return padGroup(group);
    }).join(":"));
    possibilities.push(groups.map(padGroup).join(":"));
    return groupPossibilities(possibilities);
  }
  function possibleElisions(elidedGroups, moreLeft, moreRight) {
    const left = moreLeft ? "" : ":";
    const right = moreRight ? "" : ":";
    const possibilities = [];
    if (!moreLeft && !moreRight) {
      possibilities.push("::");
    }
    if (moreLeft && moreRight) {
      possibilities.push("");
    }
    if (moreRight && !moreLeft || !moreRight && moreLeft) {
      possibilities.push(":");
    }
    possibilities.push(`${left}(:0{1,4}){1,${elidedGroups - 1}}`);
    possibilities.push(`(0{1,4}:){1,${elidedGroups - 1}}${right}`);
    possibilities.push(`(0{1,4}:){${elidedGroups - 1}}0{1,4}`);
    for (let groups = 1;groups < elidedGroups - 1; groups++) {
      for (let position = 1;position < elidedGroups - groups; position++) {
        possibilities.push(`(0{1,4}:){${position}}:(0{1,4}:){${elidedGroups - position - groups - 1}}0{1,4}`);
      }
    }
    return groupPossibilities(possibilities);
  }
});

// node_modules/ip-address/dist/ipv6.js
var require_ipv6 = __commonJS(function(exports) {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Address6 = undefined;
  var common = __importStar(require_common());
  var constants4 = __importStar(require_constants3());
  var constants6 = __importStar(require_constants4());
  var helpers = __importStar(require_helpers());
  var ipv4_1 = require_ipv4();
  var regular_expressions_1 = require_regular_expressions();
  var address_error_1 = require_address_error();
  var common_1 = require_common();
  var isCorrect6 = common.isCorrect(constants6.BITS);
  function assert(condition) {
    if (!condition) {
      throw new Error("Assertion failed.");
    }
  }
  function addCommas(number) {
    const r = /(\d+)(\d{3})/;
    while (r.test(number)) {
      number = number.replace(r, "$1,$2");
    }
    return number;
  }
  function spanLeadingZeroes4(n) {
    n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
    n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');
    return n;
  }
  function compact(address, slice) {
    const s1 = [];
    const s2 = [];
    let i;
    for (i = 0;i < address.length; i++) {
      if (i < slice[0]) {
        s1.push(address[i]);
      } else if (i > slice[1]) {
        s2.push(address[i]);
      }
    }
    return s1.concat(["compact"]).concat(s2);
  }
  function paddedHex(octet) {
    return parseInt(octet, 16).toString(16).padStart(4, "0");
  }
  function unsignByte(b) {
    return b & 255;
  }

  class Address6 {
    constructor(address, optionalGroups) {
      this.addressMinusSuffix = "";
      this.parsedSubnet = "";
      this.subnet = "/128";
      this.subnetMask = 128;
      this.v4 = false;
      this.zone = "";
      this.isInSubnet = common.isInSubnet;
      this.isHostInSubnet = common.isHostInSubnet;
      this.isCorrect = isCorrect6;
      if (optionalGroups === undefined) {
        this.groups = constants6.GROUPS;
      } else {
        this.groups = optionalGroups;
      }
      this.address = address;
      const subnet = constants6.RE_SUBNET_STRING.exec(address);
      if (subnet) {
        this.parsedSubnet = subnet[0].replace("/", "");
        this.subnetMask = parseInt(this.parsedSubnet, 10);
        this.subnet = `/${this.subnetMask}`;
        if (Number.isNaN(this.subnetMask) || this.subnetMask < 0 || this.subnetMask > constants6.BITS) {
          throw new address_error_1.AddressError("Invalid subnet mask.");
        }
        address = address.replace(constants6.RE_SUBNET_STRING, "");
      }
      if (/\//.test(address)) {
        throw new address_error_1.AddressError("Invalid subnet mask.");
      }
      const zone = constants6.RE_ZONE_STRING.exec(address);
      if (zone) {
        this.zone = zone[0];
        address = address.replace(constants6.RE_ZONE_STRING, "");
      }
      this.addressMinusSuffix = address;
      this.parsedAddress = this.parse(this.addressMinusSuffix);
    }
    static isValid(address) {
      try {
        new Address6(address);
        return true;
      } catch (e) {
        return false;
      }
    }
    static fromBigInt(bigInt) {
      if (bigInt < 0n || bigInt > (1n << BigInt(constants6.BITS)) - 1n) {
        throw new address_error_1.AddressError("IPv6 BigInt must be in the range 0 to 2**128 - 1");
      }
      const hex = bigInt.toString(16).padStart(32, "0");
      const groups = [];
      for (let i = 0;i < constants6.GROUPS; i++) {
        groups.push(hex.slice(i * 4, (i + 1) * 4));
      }
      return new Address6(groups.join(":"));
    }
    static fromURL(url) {
      let host;
      let port = null;
      let result;
      const stripped = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
      if (stripped.indexOf("[") !== -1 && stripped.indexOf("]:") !== -1) {
        result = constants6.RE_URL_WITH_PORT.exec(stripped);
        if (result === null) {
          return {
            error: "failed to parse address with port",
            address: null,
            port: null
          };
        }
        host = result[1];
        port = result[2];
      } else {
        result = constants6.RE_URL.exec(stripped);
        if (result === null) {
          return {
            error: "failed to parse address from URL",
            address: null,
            port: null
          };
        }
        host = result[1] ?? result[2];
      }
      if (port) {
        port = parseInt(port, 10);
        if (port < 0 || port > 65535) {
          port = null;
        }
      } else {
        port = null;
      }
      return {
        address: new Address6(host),
        port
      };
    }
    static fromAddressAndMask(address, mask) {
      const bits = common.prefixLengthFromMask(new Address6(mask).bigInt(), constants6.BITS);
      return new Address6(`${address}/${bits}`);
    }
    static fromAddressAndWildcardMask(address, wildcardMask) {
      const wildcard = new Address6(wildcardMask).bigInt();
      const allOnes = (BigInt(1) << BigInt(constants6.BITS)) - BigInt(1);
      const mask = wildcard ^ allOnes;
      const bits = common.prefixLengthFromMask(mask, constants6.BITS);
      return new Address6(`${address}/${bits}`);
    }
    static fromWildcard(input) {
      if (input.includes("%") || input.includes("/")) {
        throw new address_error_1.AddressError("Wildcard pattern must not include a zone or CIDR suffix");
      }
      const halves = input.split("::");
      if (halves.length > 2) {
        throw new address_error_1.AddressError("Wildcard pattern cannot contain more than one '::'");
      }
      let groups;
      if (halves.length === 2) {
        const left = halves[0] === "" ? [] : halves[0].split(":");
        const right = halves[1] === "" ? [] : halves[1].split(":");
        const remaining = constants6.GROUPS - left.length - right.length;
        if (remaining < 1) {
          throw new address_error_1.AddressError("Wildcard pattern with '::' has too many groups");
        }
        groups = [...left, ...new Array(remaining).fill("0"), ...right];
      } else {
        groups = input.split(":");
      }
      if (groups.length !== constants6.GROUPS) {
        throw new address_error_1.AddressError("Wildcard pattern must have 8 groups");
      }
      let firstWildcard = -1;
      for (let i = 0;i < groups.length; i++) {
        if (groups[i] === "*") {
          if (firstWildcard === -1) {
            firstWildcard = i;
          }
        } else if (firstWildcard !== -1) {
          throw new address_error_1.AddressError("Wildcard `*` must only appear in trailing groups (e.g. `2001:db8:*:*:*:*:*:*`)");
        }
      }
      const trailing = firstWildcard === -1 ? 0 : groups.length - firstWildcard;
      const replaced = groups.map((g) => g === "*" ? "0" : g);
      const subnetBits = constants6.BITS - trailing * 16;
      return new Address6(`${replaced.join(":")}/${subnetBits}`);
    }
    static fromAddress4(address) {
      const address4 = new ipv4_1.Address4(address);
      const mask6 = constants6.BITS - (constants4.BITS - address4.subnetMask);
      return new Address6(`::ffff:${address4.correctForm()}/${mask6}`);
    }
    static fromArpa(arpaFormAddress) {
      let address = arpaFormAddress.replace(/(\.ip6\.arpa)?\.$/, "");
      const semicolonAmount = 7;
      if (address.length !== 63) {
        throw new address_error_1.AddressError("Invalid 'ip6.arpa' form.");
      }
      const parts = address.split(".").reverse();
      for (let i = semicolonAmount;i > 0; i--) {
        const insertIndex = i * 4;
        parts.splice(insertIndex, 0, ":");
      }
      address = parts.join("");
      return new Address6(address);
    }
    microsoftTranscription() {
      return `${this.correctForm().replace(/:/g, "-")}.ipv6-literal.net`;
    }
    mask(mask = this.subnetMask) {
      return this.getBitsBase2(0, mask);
    }
    possibleSubnets(subnetSize = 128) {
      const availableBits = constants6.BITS - this.subnetMask;
      const subnetBits = Math.abs(subnetSize - constants6.BITS);
      const subnetPowers = availableBits - subnetBits;
      if (subnetPowers < 0) {
        return "0";
      }
      return addCommas((BigInt("2") ** BigInt(subnetPowers)).toString(10));
    }
    _startAddress() {
      return BigInt(`0b${this.mask() + "0".repeat(constants6.BITS - this.subnetMask)}`);
    }
    startAddress() {
      return Address6.fromBigInt(this._startAddress());
    }
    startAddressExclusive() {
      const adjust = BigInt("1");
      return Address6.fromBigInt(this._startAddress() + adjust);
    }
    _endAddress() {
      return BigInt(`0b${this.mask() + "1".repeat(constants6.BITS - this.subnetMask)}`);
    }
    endAddress() {
      return Address6.fromBigInt(this._endAddress());
    }
    endAddressExclusive() {
      const adjust = BigInt("1");
      return Address6.fromBigInt(this._endAddress() - adjust);
    }
    subnetMaskAddress() {
      return Address6.fromBigInt(BigInt(`0b${"1".repeat(this.subnetMask)}${"0".repeat(constants6.BITS - this.subnetMask)}`));
    }
    wildcardMask() {
      return Address6.fromBigInt(BigInt(`0b${"0".repeat(this.subnetMask)}${"1".repeat(constants6.BITS - this.subnetMask)}`));
    }
    networkForm() {
      return `${this.startAddress().correctForm()}/${this.subnetMask}`;
    }
    getScope() {
      const type = this.getType();
      if (type === "Multicast" || type.startsWith("Multicast ")) {
        const scope = constants6.SCOPES[parseInt(this.getBits(12, 16).toString(10), 10)];
        return scope || "Unknown";
      }
      if (type === "Link-local unicast" || type === "Loopback") {
        return "Link local";
      }
      if (type === "Unspecified") {
        return "Unknown";
      }
      return "Global";
    }
    getType() {
      for (let i = 0;i < TYPE_SUBNETS.length; i++) {
        const entry = TYPE_SUBNETS[i];
        if (this.isHostInSubnet(entry[0])) {
          return entry[1];
        }
      }
      return "Global unicast";
    }
    getBits(start, end) {
      return BigInt(`0b${this.getBitsBase2(start, end)}`);
    }
    getBitsBase2(start, end) {
      return this.binaryZeroPad().slice(start, end);
    }
    getBitsBase16(start, end) {
      const length = end - start;
      if (length % 4 !== 0) {
        throw new Error("Length of bits to retrieve must be divisible by four");
      }
      return this.getBits(start, end).toString(16).padStart(length / 4, "0");
    }
    getBitsPastSubnet() {
      return this.getBitsBase2(this.subnetMask, constants6.BITS);
    }
    reverseForm(options) {
      if (!options) {
        options = {};
      }
      const characters = Math.floor(this.subnetMask / 4);
      const reversed = this.canonicalForm().replace(/:/g, "").split("").slice(0, characters).reverse().join(".");
      if (characters > 0) {
        if (options.omitSuffix) {
          return reversed;
        }
        return `${reversed}.ip6.arpa.`;
      }
      if (options.omitSuffix) {
        return "";
      }
      return "ip6.arpa.";
    }
    correctForm() {
      let i;
      let groups = [];
      let zeroCounter = 0;
      const zeroes = [];
      for (i = 0;i < this.parsedAddress.length; i++) {
        const value = parseInt(this.parsedAddress[i], 16);
        if (value === 0) {
          zeroCounter++;
        }
        if (value !== 0 && zeroCounter > 0) {
          if (zeroCounter > 1) {
            zeroes.push([i - zeroCounter, i - 1]);
          }
          zeroCounter = 0;
        }
      }
      if (zeroCounter > 1) {
        zeroes.push([this.parsedAddress.length - zeroCounter, this.parsedAddress.length - 1]);
      }
      const zeroLengths = zeroes.map((n) => n[1] - n[0] + 1);
      if (zeroes.length > 0) {
        const index = zeroLengths.indexOf(Math.max(...zeroLengths));
        groups = compact(this.parsedAddress, zeroes[index]);
      } else {
        groups = this.parsedAddress;
      }
      for (i = 0;i < groups.length; i++) {
        if (groups[i] !== "compact") {
          groups[i] = parseInt(groups[i], 16).toString(16);
        }
      }
      let correct = groups.join(":");
      correct = correct.replace(/^compact$/, "::");
      correct = correct.replace(/(^compact)|(compact$)/, ":");
      correct = correct.replace(/compact/, "");
      return correct;
    }
    binaryZeroPad() {
      if (this._binaryZeroPad === undefined) {
        this._binaryZeroPad = this.bigInt().toString(2).padStart(constants6.BITS, "0");
      }
      return this._binaryZeroPad;
    }
    parse4in6(address) {
      if (address.indexOf(".") === -1) {
        return address;
      }
      const groups = address.split(":");
      const lastGroup = groups.slice(-1)[0];
      const v4Octets = lastGroup.split(".");
      if (v4Octets.length === constants4.GROUPS && v4Octets.every((octet) => /^\d{1,3}$/.test(octet))) {
        if (v4Octets.some((octet) => /^0\d/.test(octet))) {
          const highlighted = v4Octets.map(spanLeadingZeroes4).join(".");
          const prefix = groups.slice(0, -1).map(helpers.escapeHtml).join(":");
          const separator = groups.length > 1 ? ":" : "";
          throw new address_error_1.AddressError("IPv4 addresses can't have leading zeroes.", `${prefix}${separator}${highlighted}`);
        }
      }
      const address4 = lastGroup.match(constants4.RE_ADDRESS);
      if (address4) {
        this.parsedAddress4 = address4[0];
        const v4Suffix = this.subnetMask >= 96 ? `/${this.subnetMask - 96}` : "";
        this.address4 = new ipv4_1.Address4(`${this.parsedAddress4}${v4Suffix}`);
        this.v4 = true;
        groups[groups.length - 1] = this.address4.toGroup6();
        address = groups.join(":");
      }
      return address;
    }
    parse(address) {
      address = this.parse4in6(address);
      const badCharacters = address.match(constants6.RE_BAD_CHARACTERS);
      if (badCharacters) {
        throw new address_error_1.AddressError(`Bad character${badCharacters.length > 1 ? "s" : ""} detected in address: ${badCharacters.join("")}`, address.replace(constants6.RE_BAD_CHARACTERS, '<span class="parse-error">$1</span>'));
      }
      const badAddress = address.match(constants6.RE_BAD_ADDRESS);
      if (badAddress) {
        throw new address_error_1.AddressError(`Address failed regex: ${badAddress.join("")}`, address.replace(constants6.RE_BAD_ADDRESS, '<span class="parse-error">$1</span>'));
      }
      let groups = [];
      const halves = address.split("::");
      if (halves.length === 2) {
        let first = halves[0].split(":");
        let last = halves[1].split(":");
        if (first.length === 1 && first[0] === "") {
          first = [];
        }
        if (last.length === 1 && last[0] === "") {
          last = [];
        }
        const remaining = this.groups - (first.length + last.length);
        if (!remaining) {
          throw new address_error_1.AddressError("Error parsing groups");
        }
        this.elidedGroups = remaining;
        this.elisionBegin = first.length;
        this.elisionEnd = first.length + this.elidedGroups;
        groups = groups.concat(first);
        for (let i = 0;i < remaining; i++) {
          groups.push("0");
        }
        groups = groups.concat(last);
      } else if (halves.length === 1) {
        groups = address.split(":");
        this.elidedGroups = 0;
      } else {
        throw new address_error_1.AddressError("Too many :: groups found");
      }
      groups = groups.map((group) => parseInt(group, 16).toString(16));
      if (groups.length !== this.groups) {
        throw new address_error_1.AddressError("Incorrect number of groups found");
      }
      return groups;
    }
    canonicalForm() {
      return this.parsedAddress.map(paddedHex).join(":");
    }
    decimal() {
      return this.parsedAddress.map((n) => parseInt(n, 16).toString(10).padStart(5, "0")).join(":");
    }
    bigInt() {
      return BigInt(`0x${this.parsedAddress.map(paddedHex).join("")}`);
    }
    to4() {
      const binary = this.binaryZeroPad().split("");
      const hex = BigInt(`0b${binary.slice(96, 128).join("")}`).toString(16).padStart(8, "0");
      if (this.subnetMask >= 96) {
        const v4Mask = this.subnetMask - 96;
        const groups = [];
        for (let i = 0;i < 8; i += 2) {
          groups.push(parseInt(hex.slice(i, i + 2), 16));
        }
        return new ipv4_1.Address4(`${groups.join(".")}/${v4Mask}`);
      }
      return ipv4_1.Address4.fromHex(hex);
    }
    to4in6() {
      const address4 = this.to4();
      const address6 = new Address6(this.parsedAddress.slice(0, 6).join(":"), 6);
      const correct = address6.correctForm();
      let infix = "";
      if (!/:$/.test(correct)) {
        infix = ":";
      }
      return correct + infix + address4.correctForm();
    }
    inspectTeredo() {
      const prefix = this.getBitsBase16(0, 32);
      const bitsForUdpPort = this.getBits(80, 96);
      const udpPort = (bitsForUdpPort ^ BigInt("0xffff")).toString();
      const server4 = ipv4_1.Address4.fromHex(this.getBitsBase16(32, 64));
      const bitsForClient4 = this.getBits(96, 128);
      const client4 = ipv4_1.Address4.fromHex((bitsForClient4 ^ BigInt("0xffffffff")).toString(16).padStart(8, "0"));
      const flagsBase2 = this.getBitsBase2(64, 80);
      const coneNat = (0, common_1.testBit)(flagsBase2, 15);
      const reserved = (0, common_1.testBit)(flagsBase2, 14);
      const groupIndividual = (0, common_1.testBit)(flagsBase2, 8);
      const universalLocal = (0, common_1.testBit)(flagsBase2, 9);
      const nonce = BigInt(`0b${flagsBase2.slice(2, 6) + flagsBase2.slice(8, 16)}`).toString(10);
      return {
        prefix: `${prefix.slice(0, 4)}:${prefix.slice(4, 8)}`,
        server4: server4.address,
        client4: client4.address,
        flags: flagsBase2,
        coneNat,
        microsoft: {
          reserved,
          universalLocal,
          groupIndividual,
          nonce
        },
        udpPort
      };
    }
    inspect6to4() {
      const prefix = this.getBitsBase16(0, 16);
      const gateway = ipv4_1.Address4.fromHex(this.getBitsBase16(16, 48));
      return {
        prefix: prefix.slice(0, 4),
        gateway: gateway.address
      };
    }
    to6to4() {
      if (!this.is4()) {
        return null;
      }
      const addr6to4 = [
        "2002",
        this.getBitsBase16(96, 112),
        this.getBitsBase16(112, 128),
        "",
        "/16"
      ].join(":");
      return new Address6(addr6to4);
    }
    static fromAddress4Nat64(address, prefix = "64:ff9b::/96") {
      const v4 = new ipv4_1.Address4(address);
      const prefix6 = new Address6(prefix);
      const pl = prefix6.subnetMask;
      if (pl !== 32 && pl !== 40 && pl !== 48 && pl !== 56 && pl !== 64 && pl !== 96) {
        throw new address_error_1.AddressError("NAT64 prefix length must be 32, 40, 48, 56, 64, or 96");
      }
      const prefixBits = prefix6.binaryZeroPad();
      const v4Bits = v4.binaryZeroPad();
      let bits;
      if (pl === 96) {
        bits = prefixBits.slice(0, 96) + v4Bits;
      } else {
        const beforeU = 64 - pl;
        bits = prefixBits.slice(0, pl) + v4Bits.slice(0, beforeU) + "00000000" + v4Bits.slice(beforeU) + "0".repeat(128 - 72 - (32 - beforeU));
      }
      const hex = BigInt(`0b${bits}`).toString(16).padStart(32, "0");
      const groups = [];
      for (let i = 0;i < 8; i++) {
        groups.push(hex.slice(i * 4, (i + 1) * 4));
      }
      return new Address6(groups.join(":"));
    }
    toAddress4Nat64(prefix = "64:ff9b::/96") {
      const prefix6 = new Address6(prefix);
      const pl = prefix6.subnetMask;
      if (pl !== 32 && pl !== 40 && pl !== 48 && pl !== 56 && pl !== 64 && pl !== 96) {
        throw new address_error_1.AddressError("NAT64 prefix length must be 32, 40, 48, 56, 64, or 96");
      }
      if (!this.isHostInSubnet(prefix6)) {
        return null;
      }
      const bits = this.binaryZeroPad();
      let v4Bits;
      if (pl === 96) {
        v4Bits = bits.slice(96, 128);
      } else {
        const beforeU = 64 - pl;
        v4Bits = bits.slice(pl, pl + beforeU) + bits.slice(72, 72 + (32 - beforeU));
      }
      const octets = [];
      for (let i = 0;i < 4; i++) {
        octets.push(parseInt(v4Bits.slice(i * 8, (i + 1) * 8), 2).toString());
      }
      return new ipv4_1.Address4(octets.join("."));
    }
    toByteArray() {
      const value = this.bigInt().toString(16).padStart(constants6.BITS / 4, "0");
      const bytes = [];
      for (let i = 0, length = value.length;i < length; i += 2) {
        bytes.push(parseInt(value.substring(i, i + 2), 16));
      }
      return bytes;
    }
    toUnsignedByteArray() {
      return this.toByteArray().map(unsignByte);
    }
    static fromByteArray(bytes) {
      return this.fromUnsignedByteArray(bytes.map(unsignByte));
    }
    static fromUnsignedByteArray(bytes) {
      const BYTE_MAX = BigInt("256");
      let result = BigInt("0");
      let multiplier = BigInt("1");
      for (let i = bytes.length - 1;i >= 0; i--) {
        result += multiplier * BigInt(bytes[i].toString(10));
        multiplier *= BYTE_MAX;
      }
      return Address6.fromBigInt(result);
    }
    isCanonical() {
      return this.addressMinusSuffix === this.canonicalForm();
    }
    isLinkLocal() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isLinkLocal();
      }
      if (this.getBitsBase2(0, 64) === "1111111010000000000000000000000000000000000000000000000000000000") {
        return true;
      }
      return false;
    }
    isMulticast() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isMulticast();
      }
      const type = this.getType();
      return type === "Multicast" || type.startsWith("Multicast ");
    }
    is4() {
      return this.v4;
    }
    isMapped4() {
      return this.isHostInSubnet(IPV4_MAPPED_SUBNET);
    }
    embeddedIPv4() {
      if (this.isMapped4() || this.isHostInSubnet(NAT64_WELL_KNOWN_SUBNET)) {
        return this.to4();
      }
      return null;
    }
    isTeredo() {
      return this.isHostInSubnet(TEREDO_SUBNET);
    }
    is6to4() {
      return this.isHostInSubnet(SIX_TO_FOUR_SUBNET);
    }
    isLoopback() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isLoopback();
      }
      return this.getType() === "Loopback";
    }
    isULA() {
      return this.isHostInSubnet(ULA_SUBNET);
    }
    isPrivate() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isPrivate();
      }
      return this.isULA();
    }
    isCGNAT() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isCGNAT();
      }
      return false;
    }
    isBroadcast() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isBroadcast();
      }
      return false;
    }
    isUnspecified() {
      const embedded = this.embeddedIPv4();
      if (embedded) {
        return embedded.isUnspecified();
      }
      return this.getType() === "Unspecified";
    }
    isDocumentation() {
      return this.isHostInSubnet(DOCUMENTATION_SUBNET);
    }
    href(optionalPort) {
      if (optionalPort === undefined) {
        optionalPort = "";
      } else {
        optionalPort = `:${optionalPort}`;
      }
      return `http://[${this.correctForm()}]${optionalPort}/`;
    }
    link(options) {
      if (!options) {
        options = {};
      }
      if (options.className === undefined) {
        options.className = "";
      }
      if (options.prefix === undefined) {
        options.prefix = "/#address=";
      }
      if (options.v4 === undefined) {
        options.v4 = false;
      }
      let formFunction = this.correctForm;
      if (options.v4) {
        formFunction = this.to4in6;
      }
      const form = formFunction.call(this);
      const safeHref = helpers.escapeHtml(`${options.prefix}${form}`);
      const safeForm = helpers.escapeHtml(form);
      if (options.className) {
        const safeClass = helpers.escapeHtml(options.className);
        return `<a href="${safeHref}" class="${safeClass}">${safeForm}</a>`;
      }
      return `<a href="${safeHref}">${safeForm}</a>`;
    }
    group() {
      if (this.elidedGroups === 0) {
        return helpers.simpleGroup(this.addressMinusSuffix).join(":");
      }
      assert(typeof this.elidedGroups === "number");
      assert(typeof this.elisionBegin === "number");
      const output = [];
      const [left, right] = this.addressMinusSuffix.split("::");
      if (left.length) {
        output.push(...helpers.simpleGroup(left));
      } else {
        output.push("");
      }
      const classes = ["hover-group"];
      for (let i = this.elisionBegin;i < this.elisionBegin + this.elidedGroups; i++) {
        classes.push(`group-${i}`);
      }
      output.push(`<span class="${classes.join(" ")}"></span>`);
      if (right.length) {
        output.push(...helpers.simpleGroup(right, this.elisionEnd));
      } else {
        output.push("");
      }
      if (this.is4()) {
        assert(this.address4 instanceof ipv4_1.Address4);
        output.pop();
        output.push(this.address4.groupForV6());
      }
      return output.join(":");
    }
    regularExpressionString(substringSearch = false) {
      let output = [];
      const address6 = new Address6(this.correctForm());
      if (address6.elidedGroups === 0) {
        output.push((0, regular_expressions_1.simpleRegularExpression)(address6.parsedAddress));
      } else if (address6.elidedGroups === constants6.GROUPS) {
        output.push((0, regular_expressions_1.possibleElisions)(constants6.GROUPS));
      } else {
        const halves = address6.address.split("::");
        if (halves[0].length) {
          output.push((0, regular_expressions_1.simpleRegularExpression)(halves[0].split(":")));
        }
        assert(typeof address6.elidedGroups === "number");
        output.push((0, regular_expressions_1.possibleElisions)(address6.elidedGroups, halves[0].length !== 0, halves[1].length !== 0));
        if (halves[1].length) {
          output.push((0, regular_expressions_1.simpleRegularExpression)(halves[1].split(":")));
        }
        output = [output.join(":")];
      }
      if (!substringSearch) {
        output = [
          "(?=^|",
          regular_expressions_1.ADDRESS_BOUNDARY,
          "|[^\\w\\:])(",
          ...output,
          ")(?=[^\\w\\:]|",
          regular_expressions_1.ADDRESS_BOUNDARY,
          "|$)"
        ];
      }
      return output.join("");
    }
    regularExpression(substringSearch = false) {
      return new RegExp(this.regularExpressionString(substringSearch), "i");
    }
  }
  exports.Address6 = Address6;
  var TYPE_SUBNETS = Object.keys(constants6.TYPES).map((subnet) => [
    new Address6(subnet),
    constants6.TYPES[subnet]
  ]);
  var TEREDO_SUBNET = new Address6("2001::/32");
  var SIX_TO_FOUR_SUBNET = new Address6("2002::/16");
  var ULA_SUBNET = new Address6("fc00::/7");
  var DOCUMENTATION_SUBNET = new Address6("2001:db8::/32");
  var IPV4_MAPPED_SUBNET = new Address6("::ffff:0:0/96");
  var NAT64_WELL_KNOWN_SUBNET = new Address6("64:ff9b::/96");
});

// node_modules/ip-address/dist/ip-address.js
var require_ip_address = __commonJS(function(exports) {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.v6 = exports.AddressError = exports.Address6 = exports.Address4 = undefined;
  var ipv4_1 = require_ipv4();
  Object.defineProperty(exports, "Address4", { enumerable: true, get: function() {
    return ipv4_1.Address4;
  } });
  var ipv6_1 = require_ipv6();
  Object.defineProperty(exports, "Address6", { enumerable: true, get: function() {
    return ipv6_1.Address6;
  } });
  var address_error_1 = require_address_error();
  Object.defineProperty(exports, "AddressError", { enumerable: true, get: function() {
    return address_error_1.AddressError;
  } });
  var helpers = __importStar(require_helpers());
  exports.v6 = { helpers };
});

// node_modules/socks/build/common/helpers.js
var require_helpers2 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ipToBuffer = exports.int32ToIpv4 = exports.ipv4ToInt32 = exports.validateSocksClientChainOptions = exports.validateSocksClientOptions = undefined;
  var util_1 = require_util();
  var constants_1 = require_constants2();
  var stream = __require("stream");
  var ip_address_1 = require_ip_address();
  var net = __require("net");
  function validateSocksClientOptions(options, acceptedCommands = ["connect", "bind", "associate"]) {
    if (!constants_1.SocksCommand[options.command]) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksCommand, options);
    }
    if (acceptedCommands.indexOf(options.command) === -1) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksCommandForOperation, options);
    }
    if (!isValidSocksRemoteHost(options.destination)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsDestination, options);
    }
    if (!isValidSocksProxy(options.proxy)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsProxy, options);
    }
    validateCustomProxyAuth(options.proxy, options);
    if (options.timeout && !isValidTimeoutValue(options.timeout)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsTimeout, options);
    }
    if (options.existing_socket && !(options.existing_socket instanceof stream.Duplex)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsExistingSocket, options);
    }
  }
  exports.validateSocksClientOptions = validateSocksClientOptions;
  function validateSocksClientChainOptions(options) {
    if (options.command !== "connect") {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksCommandChain, options);
    }
    if (!isValidSocksRemoteHost(options.destination)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsDestination, options);
    }
    if (!(options.proxies && Array.isArray(options.proxies) && options.proxies.length >= 2)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsProxiesLength, options);
    }
    options.proxies.forEach((proxy) => {
      if (!isValidSocksProxy(proxy)) {
        throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsProxy, options);
      }
      validateCustomProxyAuth(proxy, options);
    });
    if (options.timeout && !isValidTimeoutValue(options.timeout)) {
      throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsTimeout, options);
    }
  }
  exports.validateSocksClientChainOptions = validateSocksClientChainOptions;
  function validateCustomProxyAuth(proxy, options) {
    if (proxy.custom_auth_method !== undefined) {
      if (proxy.custom_auth_method < constants_1.SOCKS5_CUSTOM_AUTH_START || proxy.custom_auth_method > constants_1.SOCKS5_CUSTOM_AUTH_END) {
        throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsCustomAuthRange, options);
      }
      if (proxy.custom_auth_request_handler === undefined || typeof proxy.custom_auth_request_handler !== "function") {
        throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsCustomAuthOptions, options);
      }
      if (proxy.custom_auth_response_size === undefined) {
        throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsCustomAuthOptions, options);
      }
      if (proxy.custom_auth_response_handler === undefined || typeof proxy.custom_auth_response_handler !== "function") {
        throw new util_1.SocksClientError(constants_1.ERRORS.InvalidSocksClientOptionsCustomAuthOptions, options);
      }
    }
  }
  function isValidSocksRemoteHost(remoteHost) {
    return remoteHost && typeof remoteHost.host === "string" && Buffer.byteLength(remoteHost.host) < 256 && typeof remoteHost.port === "number" && remoteHost.port >= 0 && remoteHost.port <= 65535;
  }
  function isValidSocksProxy(proxy) {
    return proxy && (typeof proxy.host === "string" || typeof proxy.ipaddress === "string") && typeof proxy.port === "number" && proxy.port >= 0 && proxy.port <= 65535 && (proxy.type === 4 || proxy.type === 5);
  }
  function isValidTimeoutValue(value) {
    return typeof value === "number" && value > 0;
  }
  function ipv4ToInt32(ip) {
    const address = new ip_address_1.Address4(ip);
    return address.toArray().reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
  }
  exports.ipv4ToInt32 = ipv4ToInt32;
  function int32ToIpv4(int32) {
    const octet1 = int32 >>> 24 & 255;
    const octet2 = int32 >>> 16 & 255;
    const octet3 = int32 >>> 8 & 255;
    const octet4 = int32 & 255;
    return [octet1, octet2, octet3, octet4].join(".");
  }
  exports.int32ToIpv4 = int32ToIpv4;
  function ipToBuffer(ip) {
    if (net.isIPv4(ip)) {
      const address = new ip_address_1.Address4(ip);
      return Buffer.from(address.toArray());
    } else if (net.isIPv6(ip)) {
      const address = new ip_address_1.Address6(ip);
      return Buffer.from(address.canonicalForm().split(":").map((segment) => segment.padStart(4, "0")).join(""), "hex");
    } else {
      throw new Error("Invalid IP address format");
    }
  }
  exports.ipToBuffer = ipToBuffer;
});

// node_modules/socks/build/common/receivebuffer.js
var require_receivebuffer = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ReceiveBuffer = undefined;

  class ReceiveBuffer {
    constructor(size = 4096) {
      this.buffer = Buffer.allocUnsafe(size);
      this.offset = 0;
      this.originalSize = size;
    }
    get length() {
      return this.offset;
    }
    append(data) {
      if (!Buffer.isBuffer(data)) {
        throw new Error("Attempted to append a non-buffer instance to ReceiveBuffer.");
      }
      if (this.offset + data.length >= this.buffer.length) {
        const tmp = this.buffer;
        this.buffer = Buffer.allocUnsafe(Math.max(this.buffer.length + this.originalSize, this.buffer.length + data.length));
        tmp.copy(this.buffer);
      }
      data.copy(this.buffer, this.offset);
      return this.offset += data.length;
    }
    peek(length) {
      if (length > this.offset) {
        throw new Error("Attempted to read beyond the bounds of the managed internal data.");
      }
      return this.buffer.slice(0, length);
    }
    get(length) {
      if (length > this.offset) {
        throw new Error("Attempted to read beyond the bounds of the managed internal data.");
      }
      const value = Buffer.allocUnsafe(length);
      this.buffer.slice(0, length).copy(value);
      this.buffer.copyWithin(0, length, length + this.offset - length);
      this.offset -= length;
      return value;
    }
  }
  exports.ReceiveBuffer = ReceiveBuffer;
});

// node_modules/socks/build/client/socksclient.js
var require_socksclient = __commonJS(function(exports) {
  var __awaiter = exports && exports.__awaiter || function(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.SocksClientError = exports.SocksClient = undefined;
  var events_1 = __require("events");
  var net = __require("net");
  var smart_buffer_1 = require_smartbuffer();
  var constants_1 = require_constants2();
  var helpers_1 = require_helpers2();
  var receivebuffer_1 = require_receivebuffer();
  var util_1 = require_util();
  Object.defineProperty(exports, "SocksClientError", { enumerable: true, get: function() {
    return util_1.SocksClientError;
  } });
  var ip_address_1 = require_ip_address();

  class SocksClient extends events_1.EventEmitter {
    constructor(options) {
      super();
      this.options = Object.assign({}, options);
      (0, helpers_1.validateSocksClientOptions)(options);
      this.setState(constants_1.SocksClientState.Created);
    }
    static createConnection(options, callback) {
      return new Promise((resolve, reject) => {
        try {
          (0, helpers_1.validateSocksClientOptions)(options, ["connect"]);
        } catch (err) {
          if (typeof callback === "function") {
            callback(err);
            return resolve(err);
          } else {
            return reject(err);
          }
        }
        const client = new SocksClient(options);
        client.connect(options.existing_socket);
        client.once("established", (info) => {
          client.removeAllListeners();
          if (typeof callback === "function") {
            callback(null, info);
            resolve(info);
          } else {
            resolve(info);
          }
        });
        client.once("error", (err) => {
          client.removeAllListeners();
          if (typeof callback === "function") {
            callback(err);
            resolve(err);
          } else {
            reject(err);
          }
        });
      });
    }
    static createConnectionChain(options, callback) {
      return new Promise((resolve, reject) => __awaiter(this, undefined, undefined, function* () {
        try {
          (0, helpers_1.validateSocksClientChainOptions)(options);
        } catch (err) {
          if (typeof callback === "function") {
            callback(err);
            return resolve(err);
          } else {
            return reject(err);
          }
        }
        if (options.randomizeChain) {
          (0, util_1.shuffleArray)(options.proxies);
        }
        try {
          let sock;
          for (let i = 0;i < options.proxies.length; i++) {
            const nextProxy = options.proxies[i];
            const nextDestination = i === options.proxies.length - 1 ? options.destination : {
              host: options.proxies[i + 1].host || options.proxies[i + 1].ipaddress,
              port: options.proxies[i + 1].port
            };
            const result = yield SocksClient.createConnection({
              command: "connect",
              proxy: nextProxy,
              destination: nextDestination,
              existing_socket: sock
            });
            sock = sock || result.socket;
          }
          if (typeof callback === "function") {
            callback(null, { socket: sock });
            resolve({ socket: sock });
          } else {
            resolve({ socket: sock });
          }
        } catch (err) {
          if (typeof callback === "function") {
            callback(err);
            resolve(err);
          } else {
            reject(err);
          }
        }
      }));
    }
    static createUDPFrame(options) {
      const buff = new smart_buffer_1.SmartBuffer;
      buff.writeUInt16BE(0);
      buff.writeUInt8(options.frameNumber || 0);
      if (net.isIPv4(options.remoteHost.host)) {
        buff.writeUInt8(constants_1.Socks5HostType.IPv4);
        buff.writeUInt32BE((0, helpers_1.ipv4ToInt32)(options.remoteHost.host));
      } else if (net.isIPv6(options.remoteHost.host)) {
        buff.writeUInt8(constants_1.Socks5HostType.IPv6);
        buff.writeBuffer((0, helpers_1.ipToBuffer)(options.remoteHost.host));
      } else {
        buff.writeUInt8(constants_1.Socks5HostType.Hostname);
        buff.writeUInt8(Buffer.byteLength(options.remoteHost.host));
        buff.writeString(options.remoteHost.host);
      }
      buff.writeUInt16BE(options.remoteHost.port);
      buff.writeBuffer(options.data);
      return buff.toBuffer();
    }
    static parseUDPFrame(data) {
      const buff = smart_buffer_1.SmartBuffer.fromBuffer(data);
      buff.readOffset = 2;
      const frameNumber = buff.readUInt8();
      const hostType = buff.readUInt8();
      let remoteHost;
      if (hostType === constants_1.Socks5HostType.IPv4) {
        remoteHost = (0, helpers_1.int32ToIpv4)(buff.readUInt32BE());
      } else if (hostType === constants_1.Socks5HostType.IPv6) {
        remoteHost = ip_address_1.Address6.fromByteArray(Array.from(buff.readBuffer(16))).canonicalForm();
      } else {
        remoteHost = buff.readString(buff.readUInt8());
      }
      const remotePort = buff.readUInt16BE();
      return {
        frameNumber,
        remoteHost: {
          host: remoteHost,
          port: remotePort
        },
        data: buff.readBuffer()
      };
    }
    setState(newState) {
      if (this.state !== constants_1.SocksClientState.Error) {
        this.state = newState;
      }
    }
    connect(existingSocket) {
      this.onDataReceived = (data) => this.onDataReceivedHandler(data);
      this.onClose = () => this.onCloseHandler();
      this.onError = (err) => this.onErrorHandler(err);
      this.onConnect = () => this.onConnectHandler();
      const timer = setTimeout(() => this.onEstablishedTimeout(), this.options.timeout || constants_1.DEFAULT_TIMEOUT);
      if (timer.unref && typeof timer.unref === "function") {
        timer.unref();
      }
      if (existingSocket) {
        this.socket = existingSocket;
      } else {
        this.socket = new net.Socket;
      }
      this.socket.once("close", this.onClose);
      this.socket.once("error", this.onError);
      this.socket.once("connect", this.onConnect);
      this.socket.on("data", this.onDataReceived);
      this.setState(constants_1.SocksClientState.Connecting);
      this.receiveBuffer = new receivebuffer_1.ReceiveBuffer;
      if (existingSocket) {
        this.socket.emit("connect");
      } else {
        this.socket.connect(this.getSocketOptions());
        if (this.options.set_tcp_nodelay !== undefined && this.options.set_tcp_nodelay !== null) {
          this.socket.setNoDelay(!!this.options.set_tcp_nodelay);
        }
      }
      this.prependOnceListener("established", (info) => {
        setImmediate(() => {
          if (this.receiveBuffer.length > 0) {
            const excessData = this.receiveBuffer.get(this.receiveBuffer.length);
            info.socket.emit("data", excessData);
          }
          info.socket.resume();
        });
      });
    }
    getSocketOptions() {
      return Object.assign(Object.assign({}, this.options.socket_options), { host: this.options.proxy.host || this.options.proxy.ipaddress, port: this.options.proxy.port });
    }
    onEstablishedTimeout() {
      if (this.state !== constants_1.SocksClientState.Established && this.state !== constants_1.SocksClientState.BoundWaitingForConnection) {
        this.closeSocket(constants_1.ERRORS.ProxyConnectionTimedOut);
      }
    }
    onConnectHandler() {
      this.setState(constants_1.SocksClientState.Connected);
      if (this.options.proxy.type === 4) {
        this.sendSocks4InitialHandshake();
      } else {
        this.sendSocks5InitialHandshake();
      }
      this.setState(constants_1.SocksClientState.SentInitialHandshake);
    }
    onDataReceivedHandler(data) {
      this.receiveBuffer.append(data);
      this.processData();
    }
    processData() {
      while (this.state !== constants_1.SocksClientState.Established && this.state !== constants_1.SocksClientState.Error && this.receiveBuffer.length >= this.nextRequiredPacketBufferSize) {
        if (this.state === constants_1.SocksClientState.SentInitialHandshake) {
          if (this.options.proxy.type === 4) {
            this.handleSocks4FinalHandshakeResponse();
          } else {
            this.handleInitialSocks5HandshakeResponse();
          }
        } else if (this.state === constants_1.SocksClientState.SentAuthentication) {
          this.handleInitialSocks5AuthenticationHandshakeResponse();
        } else if (this.state === constants_1.SocksClientState.SentFinalHandshake) {
          this.handleSocks5FinalHandshakeResponse();
        } else if (this.state === constants_1.SocksClientState.BoundWaitingForConnection) {
          if (this.options.proxy.type === 4) {
            this.handleSocks4IncomingConnectionResponse();
          } else {
            this.handleSocks5IncomingConnectionResponse();
          }
        } else {
          this.closeSocket(constants_1.ERRORS.InternalError);
          break;
        }
      }
    }
    onCloseHandler() {
      this.closeSocket(constants_1.ERRORS.SocketClosed);
    }
    onErrorHandler(err) {
      this.closeSocket(err.message);
    }
    removeInternalSocketHandlers() {
      this.socket.pause();
      this.socket.removeListener("data", this.onDataReceived);
      this.socket.removeListener("close", this.onClose);
      this.socket.removeListener("error", this.onError);
      this.socket.removeListener("connect", this.onConnect);
    }
    closeSocket(err) {
      if (this.state !== constants_1.SocksClientState.Error) {
        this.setState(constants_1.SocksClientState.Error);
        this.socket.destroy();
        this.removeInternalSocketHandlers();
        this.emit("error", new util_1.SocksClientError(err, this.options));
      }
    }
    sendSocks4InitialHandshake() {
      const userId = this.options.proxy.userId || "";
      const buff = new smart_buffer_1.SmartBuffer;
      buff.writeUInt8(4);
      buff.writeUInt8(constants_1.SocksCommand[this.options.command]);
      buff.writeUInt16BE(this.options.destination.port);
      if (net.isIPv4(this.options.destination.host)) {
        buff.writeBuffer((0, helpers_1.ipToBuffer)(this.options.destination.host));
        buff.writeStringNT(userId);
      } else {
        buff.writeUInt8(0);
        buff.writeUInt8(0);
        buff.writeUInt8(0);
        buff.writeUInt8(1);
        buff.writeStringNT(userId);
        buff.writeStringNT(this.options.destination.host);
      }
      this.nextRequiredPacketBufferSize = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks4Response;
      this.socket.write(buff.toBuffer());
    }
    handleSocks4FinalHandshakeResponse() {
      const data = this.receiveBuffer.get(8);
      if (data[1] !== constants_1.Socks4Response.Granted) {
        this.closeSocket(`${constants_1.ERRORS.Socks4ProxyRejectedConnection} - (${constants_1.Socks4Response[data[1]]})`);
      } else {
        if (constants_1.SocksCommand[this.options.command] === constants_1.SocksCommand.bind) {
          const buff = smart_buffer_1.SmartBuffer.fromBuffer(data);
          buff.readOffset = 2;
          const remoteHost = {
            port: buff.readUInt16BE(),
            host: (0, helpers_1.int32ToIpv4)(buff.readUInt32BE())
          };
          if (remoteHost.host === "0.0.0.0") {
            remoteHost.host = this.options.proxy.ipaddress;
          }
          this.setState(constants_1.SocksClientState.BoundWaitingForConnection);
          this.emit("bound", { remoteHost, socket: this.socket });
        } else {
          this.setState(constants_1.SocksClientState.Established);
          this.removeInternalSocketHandlers();
          this.emit("established", { socket: this.socket });
        }
      }
    }
    handleSocks4IncomingConnectionResponse() {
      const data = this.receiveBuffer.get(8);
      if (data[1] !== constants_1.Socks4Response.Granted) {
        this.closeSocket(`${constants_1.ERRORS.Socks4ProxyRejectedIncomingBoundConnection} - (${constants_1.Socks4Response[data[1]]})`);
      } else {
        const buff = smart_buffer_1.SmartBuffer.fromBuffer(data);
        buff.readOffset = 2;
        const remoteHost = {
          port: buff.readUInt16BE(),
          host: (0, helpers_1.int32ToIpv4)(buff.readUInt32BE())
        };
        this.setState(constants_1.SocksClientState.Established);
        this.removeInternalSocketHandlers();
        this.emit("established", { remoteHost, socket: this.socket });
      }
    }
    sendSocks5InitialHandshake() {
      const buff = new smart_buffer_1.SmartBuffer;
      const supportedAuthMethods = [constants_1.Socks5Auth.NoAuth];
      if (this.options.proxy.userId || this.options.proxy.password) {
        supportedAuthMethods.push(constants_1.Socks5Auth.UserPass);
      }
      if (this.options.proxy.custom_auth_method !== undefined) {
        supportedAuthMethods.push(this.options.proxy.custom_auth_method);
      }
      buff.writeUInt8(5);
      buff.writeUInt8(supportedAuthMethods.length);
      for (const authMethod of supportedAuthMethods) {
        buff.writeUInt8(authMethod);
      }
      this.nextRequiredPacketBufferSize = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5InitialHandshakeResponse;
      this.socket.write(buff.toBuffer());
      this.setState(constants_1.SocksClientState.SentInitialHandshake);
    }
    handleInitialSocks5HandshakeResponse() {
      const data = this.receiveBuffer.get(2);
      if (data[0] !== 5) {
        this.closeSocket(constants_1.ERRORS.InvalidSocks5IntiailHandshakeSocksVersion);
      } else if (data[1] === constants_1.SOCKS5_NO_ACCEPTABLE_AUTH) {
        this.closeSocket(constants_1.ERRORS.InvalidSocks5InitialHandshakeNoAcceptedAuthType);
      } else {
        if (data[1] === constants_1.Socks5Auth.NoAuth) {
          this.socks5ChosenAuthType = constants_1.Socks5Auth.NoAuth;
          this.sendSocks5CommandRequest();
        } else if (data[1] === constants_1.Socks5Auth.UserPass) {
          this.socks5ChosenAuthType = constants_1.Socks5Auth.UserPass;
          this.sendSocks5UserPassAuthentication();
        } else if (data[1] === this.options.proxy.custom_auth_method) {
          this.socks5ChosenAuthType = this.options.proxy.custom_auth_method;
          this.sendSocks5CustomAuthentication();
        } else {
          this.closeSocket(constants_1.ERRORS.InvalidSocks5InitialHandshakeUnknownAuthType);
        }
      }
    }
    sendSocks5UserPassAuthentication() {
      const userId = this.options.proxy.userId || "";
      const password = this.options.proxy.password || "";
      const buff = new smart_buffer_1.SmartBuffer;
      buff.writeUInt8(1);
      buff.writeUInt8(Buffer.byteLength(userId));
      buff.writeString(userId);
      buff.writeUInt8(Buffer.byteLength(password));
      buff.writeString(password);
      this.nextRequiredPacketBufferSize = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5UserPassAuthenticationResponse;
      this.socket.write(buff.toBuffer());
      this.setState(constants_1.SocksClientState.SentAuthentication);
    }
    sendSocks5CustomAuthentication() {
      return __awaiter(this, undefined, undefined, function* () {
        this.nextRequiredPacketBufferSize = this.options.proxy.custom_auth_response_size;
        this.socket.write(yield this.options.proxy.custom_auth_request_handler());
        this.setState(constants_1.SocksClientState.SentAuthentication);
      });
    }
    handleSocks5CustomAuthHandshakeResponse(data) {
      return __awaiter(this, undefined, undefined, function* () {
        return yield this.options.proxy.custom_auth_response_handler(data);
      });
    }
    handleSocks5AuthenticationNoAuthHandshakeResponse(data) {
      return __awaiter(this, undefined, undefined, function* () {
        return data[1] === 0;
      });
    }
    handleSocks5AuthenticationUserPassHandshakeResponse(data) {
      return __awaiter(this, undefined, undefined, function* () {
        return data[1] === 0;
      });
    }
    handleInitialSocks5AuthenticationHandshakeResponse() {
      return __awaiter(this, undefined, undefined, function* () {
        this.setState(constants_1.SocksClientState.ReceivedAuthenticationResponse);
        let authResult = false;
        if (this.socks5ChosenAuthType === constants_1.Socks5Auth.NoAuth) {
          authResult = yield this.handleSocks5AuthenticationNoAuthHandshakeResponse(this.receiveBuffer.get(2));
        } else if (this.socks5ChosenAuthType === constants_1.Socks5Auth.UserPass) {
          authResult = yield this.handleSocks5AuthenticationUserPassHandshakeResponse(this.receiveBuffer.get(2));
        } else if (this.socks5ChosenAuthType === this.options.proxy.custom_auth_method) {
          authResult = yield this.handleSocks5CustomAuthHandshakeResponse(this.receiveBuffer.get(this.options.proxy.custom_auth_response_size));
        }
        if (!authResult) {
          this.closeSocket(constants_1.ERRORS.Socks5AuthenticationFailed);
        } else {
          this.sendSocks5CommandRequest();
        }
      });
    }
    sendSocks5CommandRequest() {
      const buff = new smart_buffer_1.SmartBuffer;
      buff.writeUInt8(5);
      buff.writeUInt8(constants_1.SocksCommand[this.options.command]);
      buff.writeUInt8(0);
      if (net.isIPv4(this.options.destination.host)) {
        buff.writeUInt8(constants_1.Socks5HostType.IPv4);
        buff.writeBuffer((0, helpers_1.ipToBuffer)(this.options.destination.host));
      } else if (net.isIPv6(this.options.destination.host)) {
        buff.writeUInt8(constants_1.Socks5HostType.IPv6);
        buff.writeBuffer((0, helpers_1.ipToBuffer)(this.options.destination.host));
      } else {
        buff.writeUInt8(constants_1.Socks5HostType.Hostname);
        buff.writeUInt8(this.options.destination.host.length);
        buff.writeString(this.options.destination.host);
      }
      buff.writeUInt16BE(this.options.destination.port);
      this.nextRequiredPacketBufferSize = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHeader;
      this.socket.write(buff.toBuffer());
      this.setState(constants_1.SocksClientState.SentFinalHandshake);
    }
    handleSocks5FinalHandshakeResponse() {
      const header = this.receiveBuffer.peek(5);
      if (header[0] !== 5 || header[1] !== constants_1.Socks5Response.Granted) {
        this.closeSocket(`${constants_1.ERRORS.InvalidSocks5FinalHandshakeRejected} - ${constants_1.Socks5Response[header[1]]}`);
      } else {
        const addressType = header[3];
        let remoteHost;
        let buff;
        if (addressType === constants_1.Socks5HostType.IPv4) {
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv4;
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(4));
          remoteHost = {
            host: (0, helpers_1.int32ToIpv4)(buff.readUInt32BE()),
            port: buff.readUInt16BE()
          };
          if (remoteHost.host === "0.0.0.0") {
            remoteHost.host = this.options.proxy.ipaddress;
          }
        } else if (addressType === constants_1.Socks5HostType.Hostname) {
          const hostLength = header[4];
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHostname(hostLength);
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(5));
          remoteHost = {
            host: buff.readString(hostLength),
            port: buff.readUInt16BE()
          };
        } else if (addressType === constants_1.Socks5HostType.IPv6) {
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv6;
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(4));
          remoteHost = {
            host: ip_address_1.Address6.fromByteArray(Array.from(buff.readBuffer(16))).canonicalForm(),
            port: buff.readUInt16BE()
          };
        }
        this.setState(constants_1.SocksClientState.ReceivedFinalResponse);
        if (constants_1.SocksCommand[this.options.command] === constants_1.SocksCommand.connect) {
          this.setState(constants_1.SocksClientState.Established);
          this.removeInternalSocketHandlers();
          this.emit("established", { remoteHost, socket: this.socket });
        } else if (constants_1.SocksCommand[this.options.command] === constants_1.SocksCommand.bind) {
          this.setState(constants_1.SocksClientState.BoundWaitingForConnection);
          this.nextRequiredPacketBufferSize = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHeader;
          this.emit("bound", { remoteHost, socket: this.socket });
        } else if (constants_1.SocksCommand[this.options.command] === constants_1.SocksCommand.associate) {
          this.setState(constants_1.SocksClientState.Established);
          this.removeInternalSocketHandlers();
          this.emit("established", {
            remoteHost,
            socket: this.socket
          });
        }
      }
    }
    handleSocks5IncomingConnectionResponse() {
      const header = this.receiveBuffer.peek(5);
      if (header[0] !== 5 || header[1] !== constants_1.Socks5Response.Granted) {
        this.closeSocket(`${constants_1.ERRORS.Socks5ProxyRejectedIncomingBoundConnection} - ${constants_1.Socks5Response[header[1]]}`);
      } else {
        const addressType = header[3];
        let remoteHost;
        let buff;
        if (addressType === constants_1.Socks5HostType.IPv4) {
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv4;
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(4));
          remoteHost = {
            host: (0, helpers_1.int32ToIpv4)(buff.readUInt32BE()),
            port: buff.readUInt16BE()
          };
          if (remoteHost.host === "0.0.0.0") {
            remoteHost.host = this.options.proxy.ipaddress;
          }
        } else if (addressType === constants_1.Socks5HostType.Hostname) {
          const hostLength = header[4];
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseHostname(hostLength);
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(5));
          remoteHost = {
            host: buff.readString(hostLength),
            port: buff.readUInt16BE()
          };
        } else if (addressType === constants_1.Socks5HostType.IPv6) {
          const dataNeeded = constants_1.SOCKS_INCOMING_PACKET_SIZES.Socks5ResponseIPv6;
          if (this.receiveBuffer.length < dataNeeded) {
            this.nextRequiredPacketBufferSize = dataNeeded;
            return;
          }
          buff = smart_buffer_1.SmartBuffer.fromBuffer(this.receiveBuffer.get(dataNeeded).slice(4));
          remoteHost = {
            host: ip_address_1.Address6.fromByteArray(Array.from(buff.readBuffer(16))).canonicalForm(),
            port: buff.readUInt16BE()
          };
        }
        this.setState(constants_1.SocksClientState.Established);
        this.removeInternalSocketHandlers();
        this.emit("established", { remoteHost, socket: this.socket });
      }
    }
    get socksClientOptions() {
      return Object.assign({}, this.options);
    }
  }
  exports.SocksClient = SocksClient;
});

// node_modules/socks/build/index.js
var require_build = __commonJS(function(exports) {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __exportStar = exports && exports.__exportStar || function(m, exports2) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
        __createBinding(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  __exportStar(require_socksclient(), exports);
});

// browse/src/socks-bridge.ts
import * as net2 from "net";
function buildUpstream(upstream) {
  return {
    host: upstream.host,
    port: upstream.port,
    type: 5,
    ...upstream.userId ? { userId: upstream.userId } : {},
    ...upstream.password ? { password: upstream.password } : {}
  };
}
function parseConnectRequest(reqData) {
  if (reqData.length < 7 || reqData[0] !== SOCKS5_VERSION || reqData[1] !== CMD_CONNECT) {
    return null;
  }
  const atyp = reqData[3];
  if (atyp === ATYP_IPV4) {
    if (reqData.length < 10)
      return null;
    const host = `${reqData[4]}.${reqData[5]}.${reqData[6]}.${reqData[7]}`;
    const port = reqData.readUInt16BE(8);
    return { host, port };
  }
  if (atyp === ATYP_DOMAINNAME) {
    const len = reqData[4];
    if (reqData.length < 5 + len + 2)
      return null;
    const host = reqData.subarray(5, 5 + len).toString("utf8");
    const port = reqData.readUInt16BE(5 + len);
    return { host, port };
  }
  if (atyp === ATYP_IPV6) {
    if (reqData.length < 22)
      return null;
    const parts = [];
    for (let i = 4;i < 20; i += 2)
      parts.push(reqData.readUInt16BE(i).toString(16));
    const host = parts.join(":");
    const port = reqData.readUInt16BE(20);
    return { host, port };
  }
  return null;
}
function writeReply(sock, code) {
  const reply = Buffer.from([SOCKS5_VERSION, code, 0, ATYP_IPV4, 0, 0, 0, 0, 0, 0]);
  try {
    sock.write(reply);
  } catch {}
}
async function startSocksBridge(opts) {
  const upstreamProxy = buildUpstream(opts.upstream);
  const requestedPort = opts.port ?? 0;
  const inFlight = new Set;
  function greetingSize(buf) {
    if (buf.length < 2)
      return null;
    return 2 + buf[1];
  }
  function connectSize(buf) {
    if (buf.length < 5)
      return null;
    const atyp = buf[3];
    if (atyp === ATYP_IPV4)
      return 10;
    if (atyp === ATYP_IPV6)
      return 22;
    if (atyp === ATYP_DOMAINNAME)
      return 7 + buf[4];
    return null;
  }
  const server = net2.createServer((clientSocket) => {
    inFlight.add(clientSocket);
    clientSocket.once("close", () => inFlight.delete(clientSocket));
    let state = "greeting";
    let buf = Buffer.alloc(0);
    let upstreamSocket = null;
    const killBoth = (reason) => {
      state = "closed";
      try {
        clientSocket.destroy();
      } catch {}
      if (upstreamSocket) {
        try {
          upstreamSocket.destroy();
        } catch {}
      }
    };
    const handshakeTimeout = setTimeout(() => {
      if (state === "greeting" || state === "connect" || state === "connecting") {
        killBoth("handshake timeout");
      }
    }, 30000);
    clientSocket.once("close", () => clearTimeout(handshakeTimeout));
    const onData = (chunk) => {
      if (state === "closed" || state === "piped")
        return;
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      if (state === "greeting") {
        const sz = greetingSize(buf);
        if (sz == null || buf.length < sz)
          return;
        const greeting = buf.subarray(0, sz);
        buf = buf.subarray(sz);
        if (greeting[0] !== SOCKS5_VERSION) {
          killBoth("bad version");
          return;
        }
        try {
          clientSocket.write(Buffer.from([SOCKS5_VERSION, NO_AUTH_METHOD]));
        } catch {
          killBoth("write greeting reply failed");
          return;
        }
        state = "connect";
      }
      if (state === "connect") {
        const sz = connectSize(buf);
        if (sz == null || buf.length < sz)
          return;
        const reqData = buf.subarray(0, sz);
        const remainder = buf.subarray(sz);
        const dest = parseConnectRequest(reqData);
        if (!dest) {
          writeReply(clientSocket, REPLY_GENERAL_FAILURE);
          killBoth("bad connect request");
          return;
        }
        state = "connecting";
        clientSocket.pause();
        import_socks.SocksClient.createConnection({
          proxy: upstreamProxy,
          command: "connect",
          destination: { host: dest.host, port: dest.port },
          timeout: UPSTREAM_CONNECT_TIMEOUT_MS
        }).then((result) => {
          if (state === "closed") {
            try {
              result.socket.destroy();
            } catch {}
            return;
          }
          upstreamSocket = result.socket;
          writeReply(clientSocket, REPLY_SUCCESS);
          if (remainder.length > 0) {
            try {
              upstreamSocket.write(remainder);
            } catch {
              killBoth("replay write failed");
              return;
            }
          }
          upstreamSocket.on("error", () => killBoth("upstream error"));
          upstreamSocket.on("close", () => {
            try {
              clientSocket.destroy();
            } catch {}
          });
          clientSocket.removeListener("data", onData);
          clientSocket.pipe(upstreamSocket);
          upstreamSocket.pipe(clientSocket);
          clientSocket.resume();
          state = "piped";
        }).catch(() => {
          writeReply(clientSocket, REPLY_HOST_UNREACHABLE);
          killBoth("upstream connect failed");
        });
        return;
      }
    };
    clientSocket.on("data", onData);
    clientSocket.on("error", () => killBoth("client error"));
  });
  await new Promise((resolve, reject) => {
    const onErr = (e) => {
      server.off("listening", onListen);
      reject(e);
    };
    const onListen = () => {
      server.off("error", onErr);
      resolve();
    };
    server.once("error", onErr);
    server.once("listening", onListen);
    server.listen(requestedPort, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("socks-bridge: unexpected listener address");
  }
  return {
    port: address.port,
    server,
    close: async () => {
      for (const sock of inFlight) {
        try {
          sock.destroy();
        } catch {}
      }
      inFlight.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}
async function testUpstream(opts) {
  const upstreamProxy = buildUpstream(opts.upstream);
  const testHost = opts.testHost ?? "1.1.1.1";
  const testPort = opts.testPort ?? 443;
  const budgetMs = opts.budgetMs ?? 5000;
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 500;
  const start = Date.now();
  let lastErr;
  for (let attempt = 1;attempt <= retries; attempt++) {
    const elapsed = Date.now() - start;
    const remaining = budgetMs - elapsed;
    if (remaining <= 0)
      break;
    const perAttempt = Math.min(remaining, Math.max(500, Math.floor(budgetMs / retries)));
    try {
      const result = await import_socks.SocksClient.createConnection({
        proxy: upstreamProxy,
        command: "connect",
        destination: { host: testHost, port: testPort },
        timeout: perAttempt
      });
      try {
        result.socket.destroy();
      } catch {}
      return { ok: true, attempts: attempt, ms: Date.now() - start };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const elapsedAfter = Date.now() - start;
        if (elapsedAfter + backoffMs >= budgetMs)
          break;
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const err = new Error(`SOCKS5 upstream rejected or unreachable after ${retries} attempts (${Date.now() - start}ms): ${reason}`);
  err.upstreamHost = opts.upstream.host;
  err.upstreamPort = opts.upstream.port;
  throw err;
}
var import_socks, SOCKS5_VERSION = 5, NO_AUTH_METHOD = 0, CMD_CONNECT = 1, ATYP_IPV4 = 1, ATYP_DOMAINNAME = 3, ATYP_IPV6 = 4, REPLY_SUCCESS = 0, REPLY_GENERAL_FAILURE = 1, REPLY_HOST_UNREACHABLE = 4, UPSTREAM_CONNECT_TIMEOUT_MS = 15000;
var init_socks_bridge = __esm(() => {
  import_socks = __toESM(require_build(), 1);
});

// browse/src/proxy-config.ts
function parseProxyConfig(opts) {
  let url;
  try {
    url = new URL(opts.proxyUrl);
  } catch {
    throw new ProxyConfigError("expected scheme://[user:pass@]host:port", `invalid proxy URL — could not parse`);
  }
  const scheme = url.protocol.replace(":", "");
  if (scheme !== "socks5" && scheme !== "http" && scheme !== "https") {
    throw new ProxyConfigError("use socks5://, http://, or https://", `unsupported proxy scheme '${scheme}'`);
  }
  if (!url.hostname) {
    throw new ProxyConfigError("expected scheme://[user:pass@]host:port", `invalid proxy URL — missing host`);
  }
  const port = url.port ? parseInt(url.port, 10) : scheme === "http" ? 80 : scheme === "https" ? 443 : 1080;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new ProxyConfigError("expected scheme://[user:pass@]host:port", `invalid proxy URL — bad port`);
  }
  const urlHasUser = !!url.username;
  const urlHasPass = !!url.password;
  const envHasUser = !!opts.envUser;
  const envHasPass = !!opts.envPass;
  const urlHasCreds = urlHasUser || urlHasPass;
  const envHasCreds = envHasUser || envHasPass;
  if (urlHasCreds && envHasCreds) {
    throw new ProxyConfigError("unset BROWSE_PROXY_USER/PASS or remove user:pass@ from --proxy", `proxy creds set in both env (BROWSE_PROXY_USER) and URL — pick one source`);
  }
  let userId;
  let password;
  if (urlHasCreds) {
    userId = decodeURIComponent(url.username);
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } else if (envHasCreds) {
    userId = opts.envUser;
    password = opts.envPass;
  }
  return {
    scheme,
    host: url.hostname,
    port,
    ...userId ? { userId } : {},
    ...password ? { password } : {},
    hasAuth: !!(userId || password)
  };
}
function toUpstreamConfig(cfg) {
  return {
    host: cfg.host,
    port: cfg.port,
    ...cfg.userId ? { userId: cfg.userId } : {},
    ...cfg.password ? { password: cfg.password } : {}
  };
}
var ProxyConfigError;
var init_proxy_config = __esm(() => {
  ProxyConfigError = class ProxyConfigError extends Error {
    hint;
    constructor(hint, message) {
      super(message);
      this.hint = hint;
      this.name = "ProxyConfigError";
    }
  };
});

// lib/egress-receipt.ts
import { createHash as createHash3 } from "node:crypto";
import fs19 from "node:fs";
import os13 from "node:os";
import path18 from "node:path";
function resolveEgressHome(env = process.env) {
  const configured = env.GSTACK_HOME || env.GSTACK_STATE_DIR;
  if (configured)
    return path18.resolve(configured);
  return path18.join(env.HOME || os13.homedir(), ".gstack");
}
function egressLedgerPath(home) {
  return path18.join(home, "security", "egress.jsonl");
}
function sha256Hex(data) {
  return createHash3("sha256").update(data).digest("hex");
}
function receiptError(message, cause) {
  const error = cause === undefined ? new Error(message) : new Error(message, { cause });
  error.code = EGRESS_RECEIPT_FAILED;
  return error;
}
function requireString(value, name) {
  if (typeof value !== "string" || !value)
    throw receiptError(`Egress receipt requires a non-empty ${name}`);
  if (Buffer.byteLength(value) > MAX_FIELD_BYTES) {
    throw receiptError(`Egress receipt ${name} exceeds ${MAX_FIELD_BYTES} bytes (${Buffer.byteLength(value)})`);
  }
  return value;
}
function withLedgerLock(ledger, callback, budgetMs = LEDGER_LOCK_BUDGET_MS) {
  const lock = `${ledger}.lock`;
  const deadline = Date.now() + Math.max(0, budgetMs);
  for (;; ) {
    try {
      fs19.mkdirSync(lock);
      break;
    } catch (error) {
      if (error?.code !== "EEXIST")
        throw error;
      if (Date.now() > deadline) {
        try {
          const age = Date.now() - fs19.statSync(lock).mtimeMs;
          if (age > 1e4) {
            fs19.rmdirSync(lock);
            continue;
          }
        } catch {}
        throw receiptError(`Egress ledger is locked: ${lock}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    return callback();
  } finally {
    try {
      fs19.rmdirSync(lock);
    } catch {}
  }
}
function lastRawLine(ledger) {
  let fd;
  try {
    fd = fs19.openSync(ledger, "r");
  } catch (error) {
    if (error?.code === "ENOENT")
      return null;
    throw error;
  }
  try {
    const size = fs19.fstatSync(fd).size;
    if (size === 0)
      return null;
    const length = Math.min(size, TAIL_READ_BYTES);
    const buffer = Buffer.alloc(length);
    fs19.readSync(fd, buffer, 0, length, size - length);
    const tail = buffer.toString("utf8");
    const lines = tail.split(`
`).filter((line) => line.length > 0);
    return lines.length ? lines[lines.length - 1] : null;
  } finally {
    fs19.closeSync(fd);
  }
}
function warnLedgerSizeOnce(ledger) {
  if (warnedLedgerSize)
    return;
  let size;
  try {
    size = fs19.statSync(ledger).size;
  } catch {
    return;
  }
  if (size <= LEDGER_WARN_BYTES)
    return;
  warnedLedgerSize = true;
  process.stderr.write(ledgerSizeWarning(ledger, size) + `
`);
}
function ledgerSizeWarning(ledger, size) {
  const mb = (size / (1024 * 1024)).toFixed(1);
  return `gstack: egress ledger is large (${mb}MB): ${ledger}. ` + `This file records what gstack ATTEMPTS to send off-machine (content-free receipts, for auditing). ` + `Inspect it with 'gstack-egress list'. Trimming arrives with ledger rotation (TODO); until then it only grows.`;
}
function lockBudget(value) {
  if (value === undefined)
    return LEDGER_LOCK_BUDGET_MS;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw receiptError("Egress receipt lockBudgetMs must be a non-negative finite number");
  }
  return value;
}
function appendChained(homeOrNull, record, env, budgetMs = LEDGER_LOCK_BUDGET_MS) {
  const home = homeOrNull ?? resolveEgressHome(env);
  const ledger = egressLedgerPath(home);
  try {
    fs19.mkdirSync(path18.dirname(ledger), { recursive: true, mode: 448 });
    return withLedgerLock(ledger, () => {
      const previous = lastRawLine(ledger);
      const line = JSON.stringify({ ...record, prev: previous == null ? "" : sha256Hex(previous) });
      const existed = fs19.existsSync(ledger);
      fs19.appendFileSync(ledger, `${line}
`, { mode: 384 });
      if (!existed)
        fs19.chmodSync(ledger, 384);
      return { id: sha256Hex(line), path: ledger };
    }, budgetMs);
  } catch (error) {
    if (error?.code === EGRESS_RECEIPT_FAILED)
      throw error;
    throw receiptError(`Egress receipt could not be written to ${ledger}: ${error?.message ?? error}`, error);
  }
}
function writeReceipt(opts) {
  const sink = requireString(opts.sink, "sink");
  const host = requireString(opts.host, "host");
  const payloadClass = requireString(opts.payloadClass, "payloadClass");
  const consent = requireString(opts.consent, "consent");
  const bytes = opts.bytes ?? 0;
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw receiptError("Egress receipt bytes must be a non-negative integer");
  const sha256 = opts.sha256 ?? null;
  if (sha256 !== null && !SHA256_HEX.test(String(sha256)))
    throw receiptError("Egress receipt sha256 must be 64 lowercase hex chars or null");
  const budgetMs = lockBudget(opts.lockBudgetMs);
  const home = opts.home ?? resolveEgressHome(opts.env);
  warnLedgerSizeOnce(egressLedgerPath(home));
  return appendChained(home, {
    ts: new Date().toISOString(),
    type: "egress",
    sink,
    host,
    payload_class: payloadClass,
    bytes,
    sha256,
    consent
  }, opts.env, budgetMs);
}
var EGRESS_RECEIPT_FAILED = "EGRESS_RECEIPT_FAILED", SHA256_HEX, LEDGER_WARN_BYTES, TAIL_READ_BYTES = 4096, LEDGER_LOCK_BUDGET_MS = 2500, MAX_FIELD_BYTES = 512, warnedLedgerSize = false;
var init_egress_receipt = __esm(() => {
  SHA256_HEX = /^[0-9a-f]{64}$/;
  LEDGER_WARN_BYTES = 25 * 1024 * 1024;
});

// browse/src/proxy-redact.ts
function redactProxyUrl(input) {
  if (!input)
    return "<no proxy>";
  let url;
  try {
    url = new URL(input);
  } catch {
    return "<malformed proxy url>";
  }
  if (url.username)
    url.username = REDACTED;
  if (url.password)
    url.password = REDACTED;
  return url.toString();
}
var REDACTED = "***";

// browse/src/tunnel-denial-log.ts
import { promises as fsp } from "fs";
import * as path19 from "path";
import * as os14 from "os";
async function ensureDir3() {
  if (dirEnsured)
    return;
  try {
    mkdirSecure(LOG_DIR);
    dirEnsured = true;
  } catch {}
}
function logTunnelDenial(req, url, reason) {
  const now = Date.now();
  while (writeTimestamps.length && writeTimestamps[0] < now - WINDOW_MS) {
    writeTimestamps.shift();
  }
  if (writeTimestamps.length >= RATE_CAP) {
    droppedSinceLastWrite += 1;
    return;
  }
  writeTimestamps.push(now);
  const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const entry = {
    ts: new Date(now).toISOString(),
    kind: "tunnel_auth_denial",
    reason,
    path: url.pathname,
    method: req.method,
    sourceIp
  };
  if (droppedSinceLastWrite > 0) {
    entry.droppedSinceLastWrite = droppedSinceLastWrite;
    droppedSinceLastWrite = 0;
  }
  (async () => {
    try {
      await ensureDir3();
      await fsp.appendFile(LOG_PATH, JSON.stringify(entry) + `
`);
    } catch {}
  })();
}
var LOG_DIR, LOG_PATH, RATE_CAP = 60, WINDOW_MS = 60000, writeTimestamps, droppedSinceLastWrite = 0, dirEnsured = false;
var init_tunnel_denial_log = __esm(() => {
  init_file_permissions();
  LOG_DIR = path19.join(os14.homedir(), ".gstack", "security");
  LOG_PATH = path19.join(LOG_DIR, "attempts.jsonl");
  writeTimestamps = [];
});

// browse/src/session-cookie-store.ts
import * as crypto5 from "crypto";
function createSessionCookieStore(opts) {
  const { cookieName, ttlMs } = opts;
  const maxSessions = opts.maxSessions ?? 1e4;
  const sessions = new Map;
  function pruneExpired(now) {
    let checked = 0;
    for (const [token, session] of sessions) {
      if (checked++ >= 20)
        break;
      if (session.expiresAt <= now)
        sessions.delete(token);
    }
    while (sessions.size > maxSessions) {
      const first = sessions.keys().next().value;
      if (!first)
        break;
      sessions.delete(first);
    }
  }
  return {
    mint() {
      const token = crypto5.randomBytes(32).toString("base64url");
      const now = Date.now();
      const expiresAt = now + ttlMs;
      sessions.set(token, { createdAt: now, expiresAt });
      pruneExpired(now);
      return { token, expiresAt };
    },
    validate(token) {
      if (!token)
        return false;
      const s = sessions.get(token);
      if (!s) {
        pruneExpired(Date.now());
        return false;
      }
      if (Date.now() > s.expiresAt) {
        sessions.delete(token);
        pruneExpired(Date.now());
        return false;
      }
      return true;
    },
    revoke(token) {
      if (!token)
        return;
      sessions.delete(token);
    },
    extract(req) {
      const cookieHeader = req.headers.get("cookie");
      if (!cookieHeader)
        return null;
      for (const part of cookieHeader.split(";")) {
        const [name, ...valueParts] = part.trim().split("=");
        if (name === cookieName) {
          return valueParts.join("=") || null;
        }
      }
      return null;
    },
    buildSetCookie(token) {
      const maxAge = Math.floor(ttlMs / 1000);
      return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
    },
    __reset() {
      sessions.clear();
    }
  };
}
var init_session_cookie_store = () => {};

// browse/src/sse-session-cookie.ts
function mintSseSessionToken() {
  return store.mint();
}
function validateSseSessionToken(token) {
  return store.validate(token);
}
function extractSseCookie(req) {
  return store.extract(req);
}
function buildSseSetCookie(token) {
  return store.buildSetCookie(token);
}
var TTL_MS, SSE_COOKIE_NAME = "gstack_sse", store;
var init_sse_session_cookie = __esm(() => {
  init_session_cookie_store();
  TTL_MS = 30 * 60 * 1000;
  store = createSessionCookieStore({ cookieName: SSE_COOKIE_NAME, ttlMs: TTL_MS });
});

// browse/src/pty-session-cookie.ts
function mintPtySessionToken() {
  return store2.mint();
}
function revokePtySessionToken(token) {
  store2.revoke(token);
}
function buildPtySetCookie(token) {
  return store2.buildSetCookie(token);
}
var TTL_MS2, PTY_COOKIE_NAME = "gstack_pty", store2;
var init_pty_session_cookie = __esm(() => {
  init_session_cookie_store();
  TTL_MS2 = 30 * 60 * 1000;
  store2 = createSessionCookieStore({ cookieName: PTY_COOKIE_NAME, ttlMs: TTL_MS2 });
});

// browse/src/pty-session-lease.ts
import * as crypto6 from "crypto";
function mintLease() {
  const sessionId = crypto6.randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + LEASE_TTL_MS;
  leases.set(sessionId, { createdAt: now, expiresAt });
  pruneExpired(now);
  return { sessionId, expiresAt };
}
function validateLease(sessionId) {
  if (!sessionId)
    return { ok: false };
  const lease = leases.get(sessionId);
  if (!lease) {
    pruneExpired(Date.now());
    return { ok: false };
  }
  if (Date.now() > lease.expiresAt) {
    leases.delete(sessionId);
    pruneExpired(Date.now());
    return { ok: false };
  }
  return { ok: true, expiresAt: lease.expiresAt };
}
function refreshLease(sessionId) {
  if (!sessionId)
    return { ok: false };
  const lease = leases.get(sessionId);
  if (!lease)
    return { ok: false };
  const now = Date.now();
  if (now > lease.expiresAt) {
    leases.delete(sessionId);
    return { ok: false };
  }
  lease.expiresAt = now + LEASE_TTL_MS;
  return { ok: true, expiresAt: lease.expiresAt };
}
function revokeLease(sessionId) {
  if (!sessionId)
    return;
  leases.delete(sessionId);
}
function pruneExpired(now) {
  let checked = 0;
  for (const [sessionId, lease] of leases) {
    if (checked++ >= 20)
      break;
    if (lease.expiresAt <= now)
      leases.delete(sessionId);
  }
  while (leases.size > MAX_LEASES) {
    const first = leases.keys().next().value;
    if (!first)
      break;
    leases.delete(first);
  }
}
var LEASE_TTL_MS, MAX_LEASES = 1e4, leases;
var init_pty_session_lease = __esm(() => {
  LEASE_TTL_MS = parseInt(process.env.GSTACK_PTY_LEASE_TTL_MS || `${30 * 60 * 1000}`, 10);
  leases = new Map;
});

// browse/src/server.ts
import * as fs20 from "fs";
import * as path20 from "path";
import * as crypto7 from "crypto";
function sanitizeAuthToken(raw) {
  if (!raw)
    return null;
  const stripped = raw.replace(/[\s ​-‍﻿]/g, "");
  if (stripped.length < 16)
    return null;
  return stripped;
}
function resolveConfigFromEnv() {
  return {
    authToken: sanitizeAuthToken(process.env.AUTH_TOKEN) || crypto7.randomUUID(),
    browsePort: parseInt(process.env.BROWSE_PORT || "0", 10),
    config: resolveConfig()
  };
}
function canDispatchOverTunnel(command, args) {
  if (typeof command !== "string" || command.length === 0)
    return false;
  if (Array.isArray(args) && hasOutArg(args))
    return false;
  const cmd = canonicalizeCommand(command);
  return TUNNEL_COMMANDS.has(cmd);
}
function resolveNgrokAuthtoken() {
  let authtoken = process.env.NGROK_AUTHTOKEN;
  if (authtoken)
    return authtoken;
  const home = process.env.HOME || "";
  const ngrokEnvPath = path20.join(home, ".gstack", "ngrok.env");
  if (fs20.existsSync(ngrokEnvPath)) {
    try {
      const envContent = fs20.readFileSync(ngrokEnvPath, "utf-8");
      const match = envContent.match(/^NGROK_AUTHTOKEN=(.+)$/m);
      if (match)
        return match[1].trim();
    } catch {}
  }
  const ngrokConfigs = [
    path20.join(home, "Library", "Application Support", "ngrok", "ngrok.yml"),
    path20.join(home, ".config", "ngrok", "ngrok.yml"),
    path20.join(home, ".ngrok2", "ngrok.yml")
  ];
  for (const conf of ngrokConfigs) {
    try {
      const content = fs20.readFileSync(conf, "utf-8");
      const match = content.match(/authtoken:\s*(.+)/);
      if (match)
        return match[1].trim();
    } catch {}
  }
  return null;
}
async function closeTunnel() {
  try {
    if (tunnelListener)
      await tunnelListener.close();
  } catch {}
  try {
    if (tunnelServer)
      tunnelServer.stop(true);
  } catch {}
  tunnelListener = null;
  tunnelServer = null;
  tunnelUrl = null;
  tunnelActive = false;
}
async function startTunnel(opts) {
  let boundTunnel;
  try {
    boundTunnel = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: opts.fetchHandler
    });
  } catch (err) {
    return { ok: false, stage: "bind", error: err };
  }
  const tunnelPort = boundTunnel.port;
  try {
    const ngrok = await import("@ngrok/ngrok");
    const domain = process.env.NGROK_DOMAIN;
    const forwardOpts = { addr: tunnelPort, authtoken: opts.authtoken };
    if (domain)
      forwardOpts.domain = domain;
    writeReceipt({
      sink: "browse-tunnel",
      host: domain || "connect.ngrok-agent.com",
      payloadClass: "tunnel-session-open (scoped-token browser-command surface)",
      bytes: 0,
      sha256: null,
      consent: opts.consent
    });
    tunnelListener = await ngrok.forward(forwardOpts);
    tunnelUrl = tunnelListener.url();
    tunnelServer = boundTunnel;
    tunnelActive = true;
    console.log(`[browse] Tunnel listener bound on 127.0.0.1:${tunnelPort}, ngrok → ${tunnelUrl}`);
    const stateContent = JSON.parse(fs20.readFileSync(config.stateFile, "utf-8"));
    stateContent.tunnel = { url: tunnelUrl, domain: domain || null, startedAt: new Date().toISOString() };
    const tmpState = tmpStatePath();
    fs20.writeFileSync(tmpState, JSON.stringify(stateContent, null, 2), { mode: 384 });
    fs20.renameSync(tmpState, config.stateFile);
    return { ok: true, url: tunnelUrl };
  } catch (err) {
    try {
      if (tunnelListener)
        await tunnelListener.close();
    } catch {}
    try {
      boundTunnel.stop(true);
    } catch {}
    tunnelListener = null;
    return { ok: false, stage: "ngrok", error: err };
  }
}
function readTerminalPort() {
  try {
    const f = path20.join(path20.dirname(config.stateFile), "terminal-port");
    const v = parseInt(fs20.readFileSync(f, "utf-8").trim(), 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function readTerminalInternalToken() {
  try {
    const f = path20.join(path20.dirname(config.stateFile), "terminal-internal-token");
    const t = fs20.readFileSync(f, "utf-8").trim();
    return t.length > 16 ? t : null;
  } catch {
    return null;
  }
}
async function grantPtyToken(token, sessionId) {
  const port = readTerminalPort();
  const internal = readTerminalInternalToken();
  if (!port || !internal)
    return false;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/internal/grant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internal}`
      },
      body: JSON.stringify(sessionId ? { token, sessionId } : { token }),
      signal: AbortSignal.timeout(2000)
    });
    return resp.ok;
  } catch {
    return false;
  }
}
async function restartPtySession(sessionId) {
  const port = readTerminalPort();
  const internal = readTerminalInternalToken();
  if (!port || !internal)
    return false;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/internal/restart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internal}`
      },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(5000)
    });
    return resp.ok;
  } catch {
    return false;
  }
}
function extractToken(req) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer "))
    return null;
  return header.slice(7);
}
function getTokenInfo(req) {
  const token = extractToken(req);
  if (!token)
    return null;
  return validateToken(token);
}
function isRootRequest(req) {
  const token = extractToken(req);
  return token !== null && isRootToken(token);
}
function generateHelpText() {
  const groups = new Map;
  for (const [cmd, meta] of Object.entries(COMMAND_DESCRIPTIONS)) {
    const display = meta.usage || cmd;
    const list = groups.get(meta.category) || [];
    list.push(display);
    groups.set(meta.category, list);
  }
  const categoryOrder = [
    "Navigation",
    "Reading",
    "Interaction",
    "Inspection",
    "Visual",
    "Snapshot",
    "Meta",
    "Tabs",
    "Server"
  ];
  const lines = ["gstack browse — headless browser for AI agents", "", "Commands:"];
  for (const cat of categoryOrder) {
    const cmds = groups.get(cat);
    if (!cmds)
      continue;
    lines.push(`  ${(cat + ":").padEnd(15)}${cmds.join(", ")}`);
  }
  lines.push("");
  lines.push("Snapshot flags:");
  const flagPairs = [];
  for (const flag of SNAPSHOT_FLAGS) {
    const label = flag.valueHint ? `${flag.short} ${flag.valueHint}` : flag.short;
    flagPairs.push(`${label}  ${flag.long}`);
  }
  for (let i = 0;i < flagPairs.length; i += 2) {
    const left = flagPairs[i].padEnd(28);
    const right = flagPairs[i + 1] || "";
    lines.push(`  ${left}${right}`);
  }
  return lines.join(`
`);
}
function tmpStatePath() {
  return `${config.stateFile}.tmp.${process.pid}.${crypto7.randomBytes(4).toString("hex")}`;
}
async function flushBuffers() {
  if (flushInProgress)
    return;
  flushInProgress = true;
  try {
    const newConsoleCount = consoleBuffer.totalAdded - lastConsoleFlushed;
    if (newConsoleCount > 0) {
      const entries = consoleBuffer.last(Math.min(newConsoleCount, consoleBuffer.length));
      const lines = entries.map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.level}] ${e.text}`).join(`
`) + `
`;
      appendSecureFile(CONSOLE_LOG_PATH, lines);
      lastConsoleFlushed = consoleBuffer.totalAdded;
    }
    const newNetworkCount = networkBuffer.totalAdded - lastNetworkFlushed;
    if (newNetworkCount > 0) {
      const entries = networkBuffer.last(Math.min(newNetworkCount, networkBuffer.length));
      const lines = entries.map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.method} ${e.url} → ${e.status || "pending"} (${e.duration || "?"}ms, ${e.size || "?"}B)`).join(`
`) + `
`;
      appendSecureFile(NETWORK_LOG_PATH, lines);
      lastNetworkFlushed = networkBuffer.totalAdded;
    }
    const newDialogCount = dialogBuffer.totalAdded - lastDialogFlushed;
    if (newDialogCount > 0) {
      const entries = dialogBuffer.last(Math.min(newDialogCount, dialogBuffer.length));
      const lines = entries.map((e) => `[${new Date(e.timestamp).toISOString()}] [${e.type}] "${e.message}" → ${e.action}${e.response ? ` "${e.response}"` : ""}`).join(`
`) + `
`;
      appendSecureFile(DIALOG_LOG_PATH, lines);
      lastDialogFlushed = dialogBuffer.totalAdded;
    }
  } catch (err) {
    console.error("[browse] Buffer flush failed:", err.message);
  } finally {
    flushInProgress = false;
  }
}
function resetIdleTimer() {
  lastActivity = Date.now();
}
function idleCheckTick() {
  if (activeBrowserManager.getConnectionMode() === "headed")
    return;
  if (tunnelActive)
    return;
  if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
    console.log(`[browse] Idle for ${IDLE_TIMEOUT_MS / 1000}s, shutting down`);
    activeShutdown?.();
  }
}
function parentWatchdogTick(parentPid = BROWSE_PARENT_PID) {
  try {
    process.kill(parentPid, 0);
  } catch {
    if (hasActivePicker())
      return;
    const headed = activeBrowserManager.getConnectionMode() === "headed" && !headedParentShutdownSuppressed;
    if (headed || tunnelActive) {
      console.log(`[browse] Parent process ${parentPid} exited in ${headed ? "headed" : "tunnel"} mode, shutting down`);
      activeShutdown?.();
    } else if (!parentGone) {
      parentGone = true;
      console.log(`[browse] Parent process ${parentPid} exited (server stays alive, idle timeout will clean up)`);
    }
  }
}
function suppressHeadedParentShutdown() {
  if (headedParentShutdownSuppressed)
    return;
  headedParentShutdownSuppressed = true;
  console.log("[browse] Parent-death headed shutdown suppressed (promoted to headed at runtime); watchdog stays armed as the tunnel-orphan reaper");
}
function isWriteInvocation(command, args) {
  return WRITE_COMMANDS.has(command) || hasOutArg(args);
}
function getInspectorSubscriberCount() {
  return inspectorSubscribers.size;
}
function emitInspectorEvent(event) {
  for (const notify of inspectorSubscribers) {
    queueMicrotask(() => {
      try {
        notify(event);
      } catch (err) {
        console.error("[browse] Inspector event subscriber threw:", err.message);
      }
    });
  }
}
function findPort() {
  return findAvailablePort(BROWSE_PORT);
}
function wrapError(err) {
  const msg = err.message || String(err);
  if (err.name === "TimeoutError" || msg.includes("Timeout") || msg.includes("timeout")) {
    if (msg.includes("locator.click") || msg.includes("locator.fill") || msg.includes("locator.hover")) {
      return `Element not found or not interactable within timeout. Check your selector or run 'snapshot' for fresh refs.`;
    }
    if (msg.includes("page.goto") || msg.includes("Navigation")) {
      return `Page navigation timed out. The URL may be unreachable or the page may be loading slowly.`;
    }
    return `Operation timed out: ${msg.split(`
`)[0]}`;
  }
  if (msg.includes("resolved to") && msg.includes("elements")) {
    return `Selector matched multiple elements. Be more specific or use @refs from 'snapshot'.`;
  }
  return msg;
}
async function handleCommandInternalImpl(body, tokenInfo, opts) {
  const { args = [], tabId } = body;
  const rawCommand = body.command;
  if (!rawCommand) {
    return { status: 400, result: JSON.stringify({ error: 'Missing "command" field' }), json: true };
  }
  const command = canonicalizeCommand(rawCommand);
  const isAliased = command !== rawCommand;
  if (command === "chain" && (opts?.chainDepth ?? 0) > 0) {
    return { status: 400, result: JSON.stringify({ error: "Nested chain commands are not allowed" }), json: true };
  }
  if (tokenInfo && tokenInfo.clientId !== "root") {
    if (!checkScope(tokenInfo, command)) {
      return {
        status: 403,
        json: true,
        result: JSON.stringify({
          error: `Command "${command}" not allowed by your token scope`,
          hint: `Your scopes: ${tokenInfo.scopes.join(", ")}. Ask the user to re-pair without --restrict for full page access, or with --control for browser control commands.`
        })
      };
    }
    if (hasOutArg(args) && !tokenInfo.scopes.includes("write")) {
      return {
        status: 403,
        json: true,
        result: JSON.stringify({
          error: `"--out" writes to disk and requires the "write" scope`,
          hint: `Your scopes: ${tokenInfo.scopes.join(", ")}. Re-pair with write access to use --out.`
        })
      };
    }
    if ((command === "goto" || command === "newtab") && args[0]) {
      if (!checkDomain(tokenInfo, args[0])) {
        return {
          status: 403,
          json: true,
          result: JSON.stringify({
            error: `Domain not allowed by your token scope`,
            hint: `Allowed domains: ${tokenInfo.domains?.join(", ") || "none configured"}`
          })
        };
      }
    }
    if (!opts?.skipRateCheck) {
      const rateResult = checkRate(tokenInfo);
      if (!rateResult.allowed) {
        return {
          status: 429,
          json: true,
          result: JSON.stringify({
            error: "Rate limit exceeded",
            hint: `Max ${tokenInfo.rateLimit} requests/second. Retry after ${rateResult.retryAfterMs}ms.`
          }),
          headers: { "Retry-After": String(Math.ceil((rateResult.retryAfterMs || 1000) / 1000)) }
        };
      }
    }
    if (!opts?.skipRateCheck && tokenInfo.token)
      recordCommand(tokenInfo.token);
  }
  let savedTabId = null;
  if (tabId !== undefined && tabId !== null) {
    savedTabId = browserManager.getActiveTabId();
    try {
      browserManager.switchTab(tabId, { bringToFront: false });
    } catch (err) {
      console.warn("[browse] Failed to pin tab", tabId, ":", err.message);
    }
  }
  if (command !== "newtab" && tokenInfo && tokenInfo.clientId !== "root" && tokenInfo.tabPolicy === "own-only") {
    const targetTab = tabId ?? browserManager.getActiveTabId();
    if (!browserManager.checkTabAccess(targetTab, tokenInfo.clientId, { isWrite: isWriteInvocation(command, args), ownOnly: true })) {
      return {
        status: 403,
        json: true,
        result: JSON.stringify({
          error: "Tab not owned by your agent. Use newtab to create your own tab.",
          hint: `Tab ${targetTab} is owned by ${browserManager.getTabOwner(targetTab) || "root"}. Your agent: ${tokenInfo.clientId}.`
        })
      };
    }
  }
  if (command === "newtab" && tokenInfo && tokenInfo.clientId !== "root") {
    const newId = await browserManager.newTab(args[0] || undefined, tokenInfo.clientId);
    return {
      status: 200,
      json: true,
      result: JSON.stringify({
        tabId: newId,
        owner: tokenInfo.clientId,
        hint: 'Include "tabId": ' + newId + " in subsequent commands to target this tab."
      })
    };
  }
  if (browserManager.isWatching() && isWriteInvocation(command, args)) {
    return {
      status: 400,
      json: true,
      result: JSON.stringify({ error: "Cannot run mutation commands while watching. Run `$B watch stop` first." })
    };
  }
  const startTime = Date.now();
  if (!opts?.skipActivity) {
    emitActivity({
      type: "command_start",
      command,
      args,
      url: browserManager.getCurrentUrl(),
      tabs: browserManager.getTabCount(),
      mode: browserManager.getConnectionMode(),
      clientId: tokenInfo?.clientId
    });
  }
  try {
    let result;
    const session = browserManager.getActiveSession();
    let hiddenContentWarnings = [];
    if (READ_COMMANDS.has(command)) {
      const isScoped = tokenInfo && tokenInfo.clientId !== "root";
      if (isScoped && DOM_CONTENT_COMMANDS.has(command)) {
        const page = session.getPage();
        try {
          const strippedDescs = await markHiddenElements(page);
          if (strippedDescs.length > 0) {
            console.warn(`[browse] Content security: ${strippedDescs.length} hidden elements flagged on ${command} for ${tokenInfo.clientId}`);
            hiddenContentWarnings = strippedDescs.slice(0, 8).map((d) => `hidden content: ${d.slice(0, 120)}`);
            if (strippedDescs.length > 8) {
              hiddenContentWarnings.push(`hidden content: +${strippedDescs.length - 8} more flagged elements`);
            }
          }
          if (command === "text") {
            const target = session.getActiveFrameOrPage();
            result = await getCleanTextWithStripping(target);
          } else {
            result = await handleReadCommand(command, args, session, browserManager);
          }
        } finally {
          await cleanupHiddenMarkers(page);
        }
      } else {
        result = await handleReadCommand(command, args, session, browserManager);
      }
    } else if (WRITE_COMMANDS.has(command)) {
      result = await handleWriteCommand(command, args, session, browserManager);
    } else if (META_COMMANDS.has(command)) {
      const chainDepth = opts?.chainDepth ?? 0;
      const shutdownFn = () => activeShutdown ? activeShutdown() : Promise.resolve();
      result = await handleMetaCommand(command, args, browserManager, shutdownFn, tokenInfo, {
        chainDepth,
        daemonPort: LOCAL_LISTEN_PORT,
        executeCommand: (body, ti) => handleCommandInternal(body, ti, {
          skipRateCheck: true,
          skipActivity: true,
          chainDepth: chainDepth + 1
        })
      });
      if (command === "watch" && args[0] !== "stop" && browserManager.isWatching()) {
        const watchInterval = setInterval(async () => {
          if (!browserManager.isWatching()) {
            clearInterval(watchInterval);
            return;
          }
          try {
            const snapshot = await handleSnapshot(["-i"], browserManager.getActiveSession());
            browserManager.addWatchSnapshot(snapshot);
          } catch {}
        }, 5000);
        browserManager.watchInterval = watchInterval;
      }
    } else if (command === "help") {
      const helpText = generateHelpText();
      return { status: 200, result: helpText };
    } else {
      return {
        status: 400,
        json: true,
        result: JSON.stringify({
          error: buildUnknownCommandError(rawCommand, ALL_COMMANDS),
          hint: `Available commands: ${[...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS].sort().join(", ")}`
        })
      };
    }
    if (PAGE_CONTENT_COMMANDS.has(command) && command !== "chain") {
      const isScoped = tokenInfo && tokenInfo.clientId !== "root";
      if (isScoped) {
        const filterResult = runContentFilters(result, browserManager.getCurrentUrl(), command);
        if (filterResult.blocked) {
          return { status: 403, json: true, result: JSON.stringify({ error: filterResult.message }) };
        }
        if (command === "text") {
          result = datamarkContent(result);
        }
        const combinedWarnings = [...filterResult.warnings, ...hiddenContentWarnings];
        result = wrapUntrustedPageContent(result, command, combinedWarnings.length > 0 ? combinedWarnings : undefined);
      } else {
        result = wrapUntrustedContent(result, browserManager.getCurrentUrl());
      }
    }
    const successDuration = Date.now() - startTime;
    if (!opts?.skipActivity) {
      emitActivity({
        type: "command_end",
        command,
        args,
        url: browserManager.getCurrentUrl(),
        duration: successDuration,
        status: "ok",
        result,
        tabs: browserManager.getTabCount(),
        mode: browserManager.getConnectionMode(),
        clientId: tokenInfo?.clientId
      });
    }
    writeAuditEntry({
      ts: new Date().toISOString(),
      cmd: command,
      aliasOf: isAliased ? rawCommand : undefined,
      args: args.join(" "),
      origin: browserManager.getCurrentUrl(),
      durationMs: successDuration,
      status: "ok",
      hasCookies: browserManager.hasCookieImports(),
      mode: browserManager.getConnectionMode()
    });
    browserManager.resetFailures();
    if (savedTabId !== null) {
      try {
        browserManager.switchTab(savedTabId, { bringToFront: false });
      } catch (restoreErr) {
        console.warn("[browse] Failed to restore tab after command:", restoreErr.message);
      }
    }
    return { status: 200, result };
  } catch (err) {
    if (savedTabId !== null) {
      try {
        browserManager.switchTab(savedTabId, { bringToFront: false });
      } catch (restoreErr) {
        console.warn("[browse] Failed to restore tab after error:", restoreErr.message);
      }
    }
    const errorDuration = Date.now() - startTime;
    if (!opts?.skipActivity) {
      emitActivity({
        type: "command_end",
        command,
        args,
        url: browserManager.getCurrentUrl(),
        duration: errorDuration,
        status: "error",
        error: err.message,
        tabs: browserManager.getTabCount(),
        mode: browserManager.getConnectionMode(),
        clientId: tokenInfo?.clientId
      });
    }
    writeAuditEntry({
      ts: new Date().toISOString(),
      cmd: command,
      aliasOf: isAliased ? rawCommand : undefined,
      args: args.join(" "),
      origin: browserManager.getCurrentUrl(),
      durationMs: errorDuration,
      status: "error",
      error: err.message,
      hasCookies: browserManager.hasCookieImports(),
      mode: browserManager.getConnectionMode()
    });
    browserManager.incrementFailures();
    let errorMsg = wrapError(err);
    const hint = browserManager.getFailureHint();
    if (hint)
      errorMsg += `
` + hint;
    return { status: 500, result: JSON.stringify({ error: errorMsg }), json: true };
  }
}
async function handleCommandInternal(body, tokenInfo, opts) {
  const cr = await handleCommandInternalImpl(body, tokenInfo, opts);
  return { ...cr, result: stripLoneSurrogates(cr.result) };
}
function buildCommandResponse(cr) {
  const contentType = cr.json ? "application/json" : "text/plain";
  const safeBody = typeof cr.result === "string" ? sanitizeBody(cr.result, !!cr.json) : cr.result;
  return new Response(safeBody, {
    status: cr.status,
    headers: { "Content-Type": contentType, ...cr.headers }
  });
}
async function handleCommand(body, tokenInfo) {
  const cr = await handleCommandInternal(body, tokenInfo);
  return buildCommandResponse(cr);
}
function emergencyCleanup() {
  if (isShuttingDown)
    return;
  isShuttingDown = true;
  try {
    if (fs20.existsSync(config.stateFile)) {
      const raw = fs20.readFileSync(config.stateFile, "utf-8");
      const state = JSON.parse(raw);
      if (state.xvfbPid && state.xvfbStartTime) {
        try {
          init_xvfb();
          cleanupXvfb({
            pid: state.xvfbPid,
            startTime: state.xvfbStartTime,
            display: state.xvfbDisplay || ":99"
          });
        } catch {}
      }
    }
  } catch {}
  if (activeBrowserManager.getConnectionMode() === "headed" || process.env.BROWSE_HEADED === "1") {
    cleanSingletonLocks(resolveChromiumProfile());
  }
  safeUnlinkQuiet(config.stateFile);
}
function buildFetchHandler(cfg) {
  if (!cfg.authToken || cfg.authToken.length < 16) {
    throw new Error("buildFetchHandler: cfg.authToken must be a non-empty string >= 16 chars");
  }
  if (!cfg.browserManager) {
    throw new Error("buildFetchHandler: cfg.browserManager is required");
  }
  ensureStateDir(cfg.config);
  initAuditLog(cfg.config.auditLog);
  initRegistry(cfg.authToken);
  const { authToken, browserManager: cfgBrowserManager, startTime, beforeRoute, browsePort } = cfg;
  const ownsTerminalAgent = cfg.ownsTerminalAgent === false ? false : true;
  let agentWatchdogInterval = null;
  const respawnHistory = [];
  const AGENT_WATCHDOG_TICK_MS = parseInt(process.env.GSTACK_AGENT_WATCHDOG_TICK_MS || "60000", 10);
  const RESPAWN_GUARD_MAX = 3;
  const RESPAWN_GUARD_WINDOW_MS = Math.max(60000, AGENT_WATCHDOG_TICK_MS * (RESPAWN_GUARD_MAX + 2));
  let agentRespawnGuardTripped = false;
  if (ownsTerminalAgent) {
    agentWatchdogInterval = setInterval(() => {
      if (isShuttingDown)
        return;
      if (agentRespawnGuardTripped)
        return;
      const stateDir = path20.dirname(cfg.config.stateFile);
      const record = readAgentRecord(stateDir);
      if (record && isProcessAlive(record.pid))
        return;
      const now = Date.now();
      while (respawnHistory.length && now - respawnHistory[0] > RESPAWN_GUARD_WINDOW_MS) {
        respawnHistory.shift();
      }
      if (respawnHistory.length >= RESPAWN_GUARD_MAX) {
        agentRespawnGuardTripped = true;
        console.error(`[browse] terminal-agent respawn guard tripped (${RESPAWN_GUARD_MAX} crashes in ${RESPAWN_GUARD_WINDOW_MS / 1000}s) — manual restart required`);
        return;
      }
      respawnHistory.push(now);
      try {
        const pid = spawnTerminalAgent({
          stateFile: cfg.config.stateFile,
          serverPort: cfg.browsePort,
          ownerPid: process.pid,
          cwd: cfg.config.projectDir
        });
        if (pid) {
          console.log(`[browse] terminal-agent respawned by watchdog (PID: ${pid})`);
        } else {
          console.warn("[browse] terminal-agent respawn skipped — script not found on disk");
        }
      } catch (err) {
        console.warn("[browse] terminal-agent respawn failed:", err?.message || err);
      }
    }, AGENT_WATCHDOG_TICK_MS);
    agentWatchdogInterval?.unref?.();
  }
  function validateAuth(req) {
    const header = req.headers.get("authorization");
    if (header === null)
      return false;
    const got = Buffer.from(header);
    const want = Buffer.from(`Bearer ${authToken}`);
    return got.length === want.length && crypto7.timingSafeEqual(got, want);
  }
  async function shutdown(exitCode = 0) {
    if (isShuttingDown)
      return;
    isShuttingDown = true;
    console.log("[browse] Shutting down...");
    if (ownsTerminalAgent) {
      try {
        const stateDir = path20.dirname(config.stateFile);
        const record = readAgentRecord(stateDir);
        if (record)
          killAgentByRecord(record, "SIGTERM");
      } catch (err) {
        console.warn("[browse] Failed to kill terminal-agent:", err.message);
      }
      safeUnlinkQuiet(path20.join(path20.dirname(config.stateFile), "terminal-port"));
      safeUnlinkQuiet(path20.join(path20.dirname(config.stateFile), "terminal-internal-token"));
      safeUnlinkQuiet(agentRecordPath(path20.dirname(config.stateFile)));
    }
    try {
      detachSession();
    } catch (err) {
      console.warn("[browse] Failed to detach CDP session:", err.message);
    }
    inspectorSubscribers.clear();
    if (cfgBrowserManager.isWatching())
      cfgBrowserManager.stopWatch();
    clearInterval(flushInterval);
    clearInterval(idleCheckInterval);
    if (agentWatchdogInterval)
      clearInterval(agentWatchdogInterval);
    if (sessionPersistInterval) {
      clearInterval(sessionPersistInterval);
      sessionPersistInterval = null;
    }
    await flushBuffers();
    if (isSessionPersistEnabled()) {
      const finalSnapshot = persistSessionState(cfgBrowserManager, path20.join(config.stateDir, SESSION_STATE_FILE)).catch((err) => {
        console.warn(`[browse] SESSION_PERSIST_FAILED at shutdown: ${err?.message ?? err}`);
      });
      await Promise.race([
        finalSnapshot,
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);
    }
    await cfgBrowserManager.close();
    if (cfgBrowserManager.getConnectionMode() === "headed") {
      cleanSingletonLocks(resolveChromiumProfile());
    }
    safeUnlinkQuiet(config.stateFile);
    process.exit(exitCode);
  }
  async function stopListeners(local, tunnel) {
    try {
      if (local?.stop)
        local.stop(true);
    } catch (err) {
      console.warn("[browse] local listener stop failed:", err?.message || err);
    }
    try {
      if (tunnel?.stop)
        tunnel.stop(true);
    } catch (err) {
      console.warn("[browse] tunnel listener stop failed:", err?.message || err);
    }
  }
  activeShutdown = shutdown;
  activeBrowserManager = cfgBrowserManager;
  cfgBrowserManager.onHeadedPromotion = suppressHeadedParentShutdown;
  const callerOnDisconnect = cfgBrowserManager.onDisconnect;
  cfgBrowserManager.onDisconnect = async (code) => {
    if (callerOnDisconnect) {
      try {
        await callerOnDisconnect(code);
      } catch (err) {
        console.warn("[browse] caller onDisconnect threw:", err?.message ?? err);
      }
    }
    await activeShutdown?.(code ?? 2);
  };
  const browserManager = cfgBrowserManager;
  const makeFetchHandler = (surface) => async (req) => {
    const url = new URL(req.url);
    if (surface === "tunnel") {
      const isGetConnect = req.method === "GET" && url.pathname === "/connect";
      const allowed = TUNNEL_PATHS.has(url.pathname);
      if (!allowed && !isGetConnect) {
        logTunnelDenial(req, url, "path_not_on_tunnel");
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (isRootRequest(req)) {
        logTunnelDenial(req, url, "root_token_on_tunnel");
        return new Response(JSON.stringify({
          error: "Root token rejected on tunnel surface",
          hint: "Remote agents must pair via /connect to receive a scoped token."
        }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname !== "/connect" && !getTokenInfo(req)) {
        logTunnelDenial(req, url, "missing_scoped_token");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (beforeRoute) {
      const auth = getTokenInfo(req);
      const overlayResp = await beforeRoute(req, surface, auth);
      if (overlayResp)
        return overlayResp;
    }
    if (url.pathname === "/connect" && req.method === "GET") {
      if (!checkConnectRateLimit()) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ alive: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname.startsWith("/cookie-picker")) {
      return handleCookiePickerRoute(url, req, browserManager, authToken);
    }
    if (url.pathname === "/welcome") {
      const welcomePath = (() => {
        const rawSlug = process.env.GSTACK_SLUG || "unknown";
        const slug = /^[a-z0-9_-]+$/.test(rawSlug) ? rawSlug : "unknown";
        const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
        const projectWelcome = `${homeDir}/.gstack/projects/${slug}/designs/welcome-page-20260331/finalized.html`;
        if (fs20.existsSync(projectWelcome))
          return projectWelcome;
        const rawSkillRoot = process.env.GSTACK_SKILL_ROOT || `${homeDir}/.claude/skills/gstack`;
        if (rawSkillRoot.includes(".."))
          return null;
        const builtinWelcome = `${rawSkillRoot}/browse/src/welcome.html`;
        if (fs20.existsSync(builtinWelcome))
          return builtinWelcome;
        return null;
      })();
      if (welcomePath) {
        try {
          const html = __require("fs").readFileSync(welcomePath, "utf-8");
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        } catch (err) {
          console.error("[browse] Failed to read welcome page:", welcomePath, err.message);
        }
      }
      return new Response(`<!DOCTYPE html><html><head><title>GStack Browser</title>
          <style>body{background:#111;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
          .msg{text-align:center;opacity:.7;}.gold{color:#f5a623;font-size:2em;margin-bottom:12px;}</style></head>
          <body><div class="msg"><div class="gold">◈</div><p>GStack Browser ready.</p><p style="font-size:.85em">Waiting for commands from Claude Code.</p></div></body></html>`, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/extension-token" && req.method === "POST") {
      let hostname = null;
      try {
        hostname = new URL(`http://${req.headers.get("host") ?? ""}`).hostname;
      } catch (err) {
        if (!(err instanceof TypeError))
          throw err;
      }
      const originOk = req.headers.get("origin") === `chrome-extension://${GSTACK_EXTENSION_ID}`;
      const hostOk = hostname === "127.0.0.1" || hostname === "localhost";
      if (!originOk || !hostOk) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ token: authToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/health") {
      const healthy = await browserManager.isHealthy();
      return new Response(JSON.stringify({
        status: healthy ? "healthy" : "unhealthy",
        mode: browserManager.getConnectionMode(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        tabs: browserManager.getTabCount(),
        terminalPort: readTerminalPort()
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/pty-session" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const port = readTerminalPort();
      if (!port) {
        return new Response(JSON.stringify({
          error: "terminal-agent not ready"
        }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      const lease = mintLease();
      const minted = mintPtySessionToken();
      const granted = await grantPtyToken(minted.token, lease.sessionId);
      if (!granted) {
        revokePtySessionToken(minted.token);
        revokeLease(lease.sessionId);
        return new Response(JSON.stringify({
          error: "failed to grant terminal session"
        }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        terminalPort: port,
        sessionId: lease.sessionId,
        attachToken: minted.token,
        leaseExpiresAt: lease.expiresAt,
        ptySessionToken: minted.token,
        expiresAt: minted.expiresAt
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildPtySetCookie(minted.token)
        }
      });
    }
    if (url.pathname === "/pty-session/reattach" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const port = readTerminalPort();
      if (!port) {
        return new Response(JSON.stringify({ error: "terminal-agent not ready" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      let body;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
      const v = sessionId ? validateLease(sessionId) : { ok: false };
      if (!v.ok) {
        return new Response(JSON.stringify({ error: "lease expired or unknown" }), {
          status: 410,
          headers: { "Content-Type": "application/json" }
        });
      }
      const minted = mintPtySessionToken();
      const granted = await grantPtyToken(minted.token, sessionId);
      if (!granted) {
        revokePtySessionToken(minted.token);
        return new Response(JSON.stringify({ error: "failed to grant attach token" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        terminalPort: port,
        sessionId,
        attachToken: minted.token,
        leaseExpiresAt: v.ok ? v.expiresAt : 0
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/pty-restart" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const port = readTerminalPort();
      if (!port) {
        return new Response(JSON.stringify({ error: "terminal-agent not ready" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      let body;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const oldSessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
      if (oldSessionId) {
        await restartPtySession(oldSessionId);
        revokeLease(oldSessionId);
      }
      const lease = mintLease();
      const minted = mintPtySessionToken();
      const granted = await grantPtyToken(minted.token, lease.sessionId);
      if (!granted) {
        revokePtySessionToken(minted.token);
        revokeLease(lease.sessionId);
        return new Response(JSON.stringify({ error: "failed to grant terminal session" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        terminalPort: port,
        sessionId: lease.sessionId,
        attachToken: minted.token,
        leaseExpiresAt: lease.expiresAt
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/pty-dispose" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const authTokenFromBody = typeof body?.authToken === "string" ? body.authToken : null;
      const headerToken = extractToken(req);
      const authedByHeader = headerToken !== null && headerToken === authToken;
      const authedByBody = authTokenFromBody !== null && authTokenFromBody === authToken;
      if (!authedByHeader && !authedByBody) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
      if (sessionId) {
        await restartPtySession(sessionId);
        revokeLease(sessionId);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/internal/lease-refresh" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      let body;
      try {
        body = await req.json();
      } catch {
        body = null;
      }
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
      const r = sessionId ? refreshLease(sessionId) : { ok: false };
      if (!r.ok) {
        return new Response(JSON.stringify({ error: "lease expired or unknown" }), {
          status: 410,
          headers: { "Content-Type": "application/json" }
        });
      }
      resetIdleTimer();
      return new Response(JSON.stringify({ ok: true, expiresAt: r.expiresAt }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/pty-inject-scan" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }, sanitizeReplacer), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      const contentLength = Number(req.headers.get("content-length") || "0");
      if (contentLength > 65536) {
        return new Response(JSON.stringify({ error: "payload-too-large", limit: 65536 }, sanitizeReplacer), { status: 413, headers: { "Content-Type": "application/json" } });
      }
      let body = {};
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "malformed-json" }, sanitizeReplacer), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const text = typeof body.text === "string" ? body.text : "";
      const origin = typeof body.origin === "string" ? body.origin : "unknown";
      if (text.length === 0) {
        return new Response(JSON.stringify({ error: "missing-text" }, sanitizeReplacer), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      let verdict = "PASS";
      const reasons = [];
      if (/(\bbit\.ly|\btinyurl\.com|\bdiscord\.gg)/i.test(text)) {
        verdict = "BLOCK";
        reasons.push("url-blocklist");
      }
      const sidecarAvail = isSidecarAvailable();
      let l4 = {
        available: sidecarAvail.available
      };
      if (sidecarAvail.available && verdict !== "BLOCK") {
        try {
          const { verdict: layerVerdict } = await scanWithSidecar(text, {
            timeoutMs: 5000
          });
          l4 = { available: true, verdict: layerVerdict };
          const lv = layerVerdict?.verdict;
          if (lv === "unsafe") {
            verdict = "BLOCK";
            reasons.push("l4-unsafe");
          } else if (lv === "suspicious") {
            verdict = "WARN";
            reasons.push("l4-suspicious");
          }
        } catch (err) {
          l4 = {
            available: false,
            error: err instanceof Error ? err.message : String(err)
          };
          if (verdict === "PASS") {
            verdict = "WARN";
            reasons.push("l4-unavailable");
          }
        }
      } else if (!sidecarAvail.available && verdict === "PASS") {
        verdict = "WARN";
        reasons.push(`l4-unavailable:${sidecarAvail.reason ?? "unknown"}`);
      }
      return new Response(JSON.stringify({ verdict, reasons, l4, datamark: "<untrusted-page-content>" }, sanitizeReplacer), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/connect" && req.method === "POST") {
      if (!checkConnectRateLimit()) {
        return new Response(JSON.stringify({
          error: "Too many connection attempts. Wait 1 minute."
        }), { status: 429, headers: { "Content-Type": "application/json" } });
      }
      try {
        const connectBody = await req.json();
        if (!connectBody.setup_key) {
          return new Response(JSON.stringify({ error: "Missing setup_key" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        const session = exchangeSetupKey(connectBody.setup_key);
        if (!session) {
          return new Response(JSON.stringify({
            error: "Invalid, expired, or already-used setup key"
          }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        console.log(`[browse] Remote agent connected: ${session.clientId} (scopes: ${session.scopes.join(",")})`);
        return new Response(JSON.stringify({
          token: session.token,
          expires: session.expiresAt,
          scopes: session.scopes,
          agent: session.clientId
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname === "/token" && req.method === "POST") {
      if (!isRootRequest(req)) {
        return new Response(JSON.stringify({
          error: "Only the root token can mint sub-tokens"
        }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      try {
        const tokenBody = await req.json();
        if (!tokenBody.clientId) {
          return new Response(JSON.stringify({ error: "Missing clientId" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        const session = createToken({
          clientId: tokenBody.clientId,
          scopes: tokenBody.scopes,
          domains: tokenBody.domains,
          tabPolicy: tokenBody.tabPolicy,
          rateLimit: tokenBody.rateLimit,
          expiresSeconds: tokenBody.expiresSeconds
        });
        return new Response(JSON.stringify({
          token: session.token,
          expires: session.expiresAt,
          scopes: session.scopes,
          agent: session.clientId
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        if (err instanceof InvalidScopeError || err instanceof ReservedClientIdError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname.startsWith("/token/") && req.method === "DELETE") {
      if (!isRootRequest(req)) {
        return new Response(JSON.stringify({ error: "Root token required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      let clientId;
      try {
        clientId = decodeURIComponent(url.pathname.slice("/token/".length));
      } catch {
        return new Response(JSON.stringify({ error: "Malformed client ID encoding" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const revoked = revokeToken(clientId);
      const tabsReleased = browserManager.releaseClientTabs(clientId).length;
      if (!revoked && tabsReleased === 0) {
        return new Response(JSON.stringify({ error: `Agent "${clientId}" not found` }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      console.log(`[browse] Revoked ${revoked} token(s), released ${tabsReleased} tab(s) for: ${clientId}`);
      return new Response(JSON.stringify({ revoked: clientId, tokens_deleted: revoked, tabs_released: tabsReleased }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/agents" && req.method === "GET") {
      if (!isRootRequest(req)) {
        return new Response(JSON.stringify({ error: "Root token required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      const agents = listTokens({ includeSetup: true }).map((t) => ({
        clientId: t.clientId,
        scopes: t.scopes,
        domains: t.domains,
        expiresAt: t.expiresAt,
        commandCount: t.commandCount,
        createdAt: t.createdAt,
        pending: t.type === "setup"
      }));
      return new Response(JSON.stringify({ agents }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/pair" && req.method === "POST") {
      if (!isRootRequest(req)) {
        return new Response(JSON.stringify({ error: "Root token required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        const pairBody = await req.json();
        if (pairBody.clientId !== undefined)
          assertValidClientId(pairBody.clientId);
        if (!pairBody.control && !pairBody.admin && Array.isArray(pairBody.scopes) && pairBody.scopes.includes("control")) {
          return new Response(JSON.stringify({
            error: "The control scope requires the control flag (--control); it cannot be granted via a scopes list."
          }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        const scopes = pairBody.control || pairBody.admin ? [...DEFAULT_PAIR_SCOPES, "control"] : pairBody.scopes || [...DEFAULT_PAIR_SCOPES];
        const grant = {
          scopes: [...scopes],
          domains: pairBody.domains,
          rateLimit: pairBody.rateLimit ?? 10,
          tabPolicy: "own-only"
        };
        assertValidTokenOptions(grant.scopes, grant.rateLimit);
        const priorSession = pairBody.clientId ? getClientSession(pairBody.clientId) : null;
        let superseded;
        if (priorSession && grantReducesAccess(priorSession, grant)) {
          const tokensDeleted = revokeToken(pairBody.clientId);
          const tabsReleased = browserManager.releaseClientTabs(pairBody.clientId).length;
          superseded = { tokens_deleted: tokensDeleted, tabs_released: tabsReleased };
          console.log(`[browse] Superseded ${tokensDeleted} token(s), released ${tabsReleased} tab(s) for reducing re-pair: ${pairBody.clientId}`);
        } else if (pairBody.clientId) {
          revokeSetupKeys(pairBody.clientId);
          if (!priorSession)
            browserManager.releaseClientTabs(pairBody.clientId);
        }
        const setupKey = createSetupKey({
          clientId: pairBody.clientId,
          scopes: [...scopes],
          domains: pairBody.domains,
          rateLimit: pairBody.rateLimit
        });
        let verifiedTunnelUrl = null;
        if (tunnelActive && tunnelUrl) {
          try {
            const probe = await fetch(`${tunnelUrl}/connect`, {
              method: "GET",
              headers: { "ngrok-skip-browser-warning": "true" },
              signal: AbortSignal.timeout(5000)
            });
            if (probe.ok) {
              verifiedTunnelUrl = tunnelUrl;
            } else {
              console.warn(`[browse] Tunnel probe failed (HTTP ${probe.status}), marking tunnel as dead`);
              await closeTunnel();
            }
          } catch {
            console.warn("[browse] Tunnel probe timed out or unreachable, marking tunnel as dead");
            await closeTunnel();
          }
        }
        return new Response(JSON.stringify({
          setup_key: setupKey.token,
          expires_at: setupKey.expiresAt,
          scopes: setupKey.scopes,
          tunnel_url: verifiedTunnelUrl,
          server_url: `http://127.0.0.1:${browsePort}`,
          ...superseded ? { superseded } : {}
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        if (err instanceof InvalidScopeError || err instanceof ReservedClientIdError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname === "/tunnel/start" && req.method === "POST") {
      if (!isRootRequest(req)) {
        return new Response(JSON.stringify({ error: "Root token required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (!isPairAgentEnabled()) {
        return new Response(JSON.stringify({
          error: "pair-agent is off (tunnel exposes this browser beyond the machine)",
          hint: "enable once with: gstack-config set pair_agent on — or run /pair-agent, which asks for consent and sets it"
        }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      if (tunnelActive && tunnelUrl && tunnelServer) {
        try {
          const probe = await fetch(`${tunnelUrl}/connect`, {
            method: "GET",
            headers: { "ngrok-skip-browser-warning": "true" },
            signal: AbortSignal.timeout(5000)
          });
          if (probe.ok) {
            return new Response(JSON.stringify({ url: tunnelUrl, already_active: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }
        } catch {}
        console.warn("[browse] Cached tunnel is dead, restarting...");
        await closeTunnel();
      }
      const authtoken = resolveNgrokAuthtoken();
      if (!authtoken) {
        return new Response(JSON.stringify({
          error: "No ngrok authtoken found",
          hint: "Run: ngrok config add-authtoken YOUR_TOKEN"
        }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const started = await startTunnel({
        fetchHandler: makeFetchHandler("tunnel"),
        authtoken,
        consent: "pair_agent=on (isPairAgentEnabled gate at /tunnel/start)"
      });
      if (!started.ok) {
        return new Response(JSON.stringify({
          error: started.stage === "bind" ? `Failed to bind tunnel listener: ${started.error.message}` : `Failed to open ngrok tunnel: ${started.error.message}`
        }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ url: started.url }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/sse-session" && req.method === "POST") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const minted = mintSseSessionToken();
      return new Response(JSON.stringify({
        expiresAt: minted.expiresAt,
        cookie: SSE_COOKIE_NAME
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildSseSetCookie(minted.token)
        }
      });
    }
    if (url.pathname === "/refs") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const refs = browserManager.getRefMap();
      return new Response(JSON.stringify({
        refs,
        url: browserManager.getCurrentUrl(),
        mode: browserManager.getConnectionMode()
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/activity/stream") {
      const cookieToken = extractSseCookie(req);
      if (!validateAuth(req) && !validateSseSessionToken(cookieToken)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const afterId = parseInt(url.searchParams.get("after") || "0", 10);
      return createSseEndpoint(req, {
        initialReplay: (send) => {
          const { entries, gap, gapFrom, availableFrom } = getActivityAfter(afterId);
          if (gap)
            send("gap", { gapFrom, availableFrom });
          for (const entry of entries)
            send("activity", entry);
        },
        subscribe,
        liveEventName: "activity"
      });
    }
    if (url.pathname === "/activity/history") {
      if (!validateAuth(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const { entries, totalAdded } = getActivityHistory(limit);
      return new Response(JSON.stringify({ entries, totalAdded, subscribers: getSubscriberCount() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/batch" && req.method === "POST") {
      const tokenInfo = getTokenInfo(req);
      if (!tokenInfo) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      resetIdleTimer();
      const body = await req.json();
      const { commands } = body;
      if (!Array.isArray(commands) || commands.length === 0) {
        return new Response(JSON.stringify({ error: '"commands" must be a non-empty array' }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (commands.length > 50) {
        return new Response(JSON.stringify({ error: "Max 50 commands per batch" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const startTime = Date.now();
      emitActivity({
        type: "command_start",
        command: "batch",
        args: [`${commands.length} commands`],
        url: browserManager.getCurrentUrl(),
        tabs: browserManager.getTabCount(),
        mode: browserManager.getConnectionMode(),
        clientId: tokenInfo?.clientId
      });
      const results = [];
      for (let i = 0;i < commands.length; i++) {
        const cmd = commands[i];
        if (!cmd || typeof cmd.command !== "string") {
          results.push({ index: i, status: 400, result: JSON.stringify({ error: 'Missing "command" field' }), command: "" });
          continue;
        }
        if (cmd.command === "batch") {
          results.push({ index: i, status: 400, result: JSON.stringify({ error: "Nested batch commands are not allowed" }), command: "batch" });
          continue;
        }
        const cr = await handleCommandInternal({ command: cmd.command, args: cmd.args, tabId: cmd.tabId }, tokenInfo, { skipRateCheck: true, skipActivity: true });
        const safeResult = typeof cr.result === "string" ? sanitizeBody(cr.result, !!cr.json) : cr.result;
        results.push({
          index: i,
          status: cr.status,
          result: safeResult,
          command: cmd.command,
          tabId: cmd.tabId
        });
      }
      const duration = Date.now() - startTime;
      emitActivity({
        type: "command_end",
        command: "batch",
        args: [`${commands.length} commands`],
        url: browserManager.getCurrentUrl(),
        duration,
        status: "ok",
        result: `${results.filter((r) => r.status === 200).length}/${commands.length} succeeded`,
        tabs: browserManager.getTabCount(),
        mode: browserManager.getConnectionMode(),
        clientId: tokenInfo?.clientId
      });
      const batchBody = stripLoneSurrogateEscapes(JSON.stringify({
        results,
        duration,
        total: commands.length,
        succeeded: results.filter((r) => r.status === 200).length,
        failed: results.filter((r) => r.status !== 200).length
      }));
      return new Response(batchBody, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/file" && req.method === "GET") {
      const tokenInfo = getTokenInfo(req);
      if (!tokenInfo) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        return new Response(JSON.stringify({ error: 'Missing "path" query parameter' }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        validateTempPath(filePath);
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (!fs20.existsSync(filePath)) {
        return new Response(JSON.stringify({ error: "File not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      const stat = fs20.statSync(filePath);
      if (stat.size > 209715200) {
        return new Response(JSON.stringify({ error: "File too large (max 200MB)" }), {
          status: 413,
          headers: { "Content-Type": "application/json" }
        });
      }
      const ext = path20.extname(filePath).toLowerCase();
      const MIME_MAP = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".avif": "image/avif",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".html": "text/html",
        ".txt": "text/plain",
        ".mhtml": "message/rfc822"
      };
      const contentType = MIME_MAP[ext] || "application/octet-stream";
      resetIdleTimer();
      return new Response(Bun.file(filePath), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stat.size),
          "Content-Disposition": `inline; filename="${path20.basename(filePath)}"`,
          "Cache-Control": "no-cache"
        }
      });
    }
    if (url.pathname === "/command" && req.method === "POST") {
      const tokenInfo = getTokenInfo(req);
      if (!tokenInfo) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      resetIdleTimer();
      const body = await req.json();
      if (surface === "tunnel") {
        if (!canDispatchOverTunnel(body?.command, body?.args)) {
          logTunnelDenial(req, url, `disallowed_command:${body?.command}`);
          return new Response(JSON.stringify({
            error: `Command '${body?.command}' is not allowed over the tunnel surface`,
            hint: `Tunnel commands: ${[...TUNNEL_COMMANDS].sort().join(", ")}. Note: --out (disk write) is never allowed over the tunnel.`
          }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
      }
      return handleCommand(body, tokenInfo);
    }
    if (!validateAuth(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/inspector/pick" && req.method === "POST") {
      const body = await req.json();
      const { selector, activeTabUrl } = body;
      if (!selector) {
        return new Response(JSON.stringify({ error: "Missing selector" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        const page = browserManager.getPage();
        const result = await inspectElement(page, selector);
        inspectorData = result;
        inspectorTimestamp = Date.now();
        browserManager._inspectorData = result;
        browserManager._inspectorTimestamp = inspectorTimestamp;
        emitInspectorEvent({ type: "pick", selector, timestamp: inspectorTimestamp });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname === "/inspector" && req.method === "GET") {
      if (!inspectorData) {
        return new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      const stale = inspectorTimestamp > 0 && Date.now() - inspectorTimestamp > 60000;
      return new Response(JSON.stringify({ data: inspectorData, timestamp: inspectorTimestamp, stale }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/inspector/apply" && req.method === "POST") {
      const body = await req.json();
      const { selector, property, value } = body;
      if (!selector || !property || value === undefined) {
        return new Response(JSON.stringify({ error: "Missing selector, property, or value" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        const page = browserManager.getPage();
        const mod = await modifyStyle(page, selector, property, value);
        emitInspectorEvent({ type: "apply", modification: mod, timestamp: Date.now() });
        return new Response(JSON.stringify(mod), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname === "/inspector/reset" && req.method === "POST") {
      try {
        const page = browserManager.getPage();
        await resetModifications(page);
        emitInspectorEvent({ type: "reset", timestamp: Date.now() });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (url.pathname === "/inspector/history" && req.method === "GET") {
      return new Response(JSON.stringify({ history: getModificationHistory() }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/memory" && req.method === "GET") {
      const cookieToken = extractSseCookie(req);
      if (!validateAuth(req) && !validateSseSessionToken(cookieToken)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      await Promise.resolve().then(() => init_memory_command());
      const snapshot = await buildMemorySnapshotJson(cfgBrowserManager);
      return new Response(JSON.stringify(snapshot, sanitizeReplacer), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/inspector/events" && req.method === "GET") {
      const cookieToken = extractSseCookie(req);
      if (!validateAuth(req) && !validateSseSessionToken(cookieToken)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      return createSseEndpoint(req, {
        initialReplay: inspectorData ? (send) => send("state", { data: inspectorData, timestamp: inspectorTimestamp }) : undefined,
        subscribe: (notify) => {
          inspectorSubscribers.add(notify);
          return () => inspectorSubscribers.delete(notify);
        },
        liveEventName: "inspector"
      });
    }
    return new Response("Not found", { status: 404 });
  };
  return {
    fetchLocal: makeFetchHandler("local"),
    fetchTunnel: makeFetchHandler("tunnel"),
    shutdown,
    stopListeners
  };
}
async function start() {
  safeUnlink(CONSOLE_LOG_PATH);
  safeUnlink(NETWORK_LOG_PATH);
  safeUnlink(DIALOG_LOG_PATH);
  const port = await findPort();
  LOCAL_LISTEN_PORT = port;
  let proxyBridge = null;
  const proxyUrl = process.env.BROWSE_PROXY_URL;
  if (proxyUrl) {
    let parsed;
    try {
      parsed = parseProxyConfig({
        proxyUrl,
        envUser: process.env.BROWSE_PROXY_USER,
        envPass: process.env.BROWSE_PROXY_PASS
      });
    } catch (err) {
      if (err instanceof ProxyConfigError) {
        console.error(`[browse] error: ${err.message} (${err.hint})`);
        process.exit(1);
      }
      throw err;
    }
    if (parsed.scheme === "socks5" && parsed.hasAuth) {
      console.log(`[browse] Testing SOCKS5 upstream ${redactProxyUrl(proxyUrl)}...`);
      try {
        const test = await testUpstream({
          upstream: toUpstreamConfig(parsed),
          budgetMs: 5000,
          retries: 3,
          backoffMs: 500
        });
        console.log(`[browse] [proxy] upstream test ok in ${test.ms}ms (${test.attempts} attempt${test.attempts === 1 ? "" : "s"})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[browse] [proxy] FAIL upstream ${redactProxyUrl(proxyUrl)}: ${msg}`);
        process.exit(1);
      }
      proxyBridge = await startSocksBridge({ upstream: toUpstreamConfig(parsed) });
      console.log(`[browse] [proxy] bridge listening on 127.0.0.1:${proxyBridge.port}`);
      browserManager.setProxyConfig({ server: `socks5://127.0.0.1:${proxyBridge.port}` });
    } else {
      browserManager.setProxyConfig({
        server: `${parsed.scheme}://${parsed.host}:${parsed.port}`,
        ...parsed.userId ? { username: parsed.userId } : {},
        ...parsed.password ? { password: parsed.password } : {}
      });
      console.log(`[browse] [proxy] using ${redactProxyUrl(proxyUrl)} (pass-through to Chromium)`);
    }
    process.on("exit", () => {
      if (proxyBridge) {
        proxyBridge.close().catch(() => {});
      }
    });
  }
  let xvfb = null;
  const xvfbDecision = shouldSpawnXvfb(process.env, process.platform);
  if (xvfbDecision.spawn) {
    const displayNum = pickFreeDisplay();
    if (displayNum == null) {
      console.error("[browse] no free X display in range :99-:120 — refusing to clobber existing X servers");
      process.exit(1);
    }
    try {
      xvfb = await spawnXvfb(displayNum);
      process.env.DISPLAY = xvfb.display;
      console.log(`[browse] [xvfb] spawned on ${xvfb.display} (pid ${xvfb.pid})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[browse] [xvfb] FAILED: ${msg}`);
      console.error(`[browse] [xvfb] hint: ${xvfbInstallHint()}`);
      process.exit(1);
    }
    process.on("exit", () => {
      try {
        xvfb?.close();
      } catch {}
    });
  } else if (process.env.BROWSE_HEADED === "1") {
    console.log(`[browse] [xvfb] skipped: ${xvfbDecision.reason}`);
  }
  const envCfg = resolveConfigFromEnv();
  const skipBrowser = process.env.BROWSE_HEADLESS_SKIP === "1";
  if (!skipBrowser) {
    const headed = process.env.BROWSE_HEADED === "1";
    if (headed) {
      await browserManager.launchHeaded(envCfg.authToken);
      console.log(`[browse] Launched headed Chromium with extension`);
    } else {
      await browserManager.launch();
    }
  }
  const startTime = Date.now();
  const handle = buildFetchHandler({
    ...envCfg,
    browsePort: port,
    browserManager,
    xvfb,
    proxyBridge,
    startTime,
    ownsTerminalAgent: true
  });
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: handle.fetchLocal
  });
  const state = {
    pid: process.pid,
    port,
    token: envCfg.authToken,
    startedAt: new Date().toISOString(),
    serverPath: path20.resolve(__browseNodeSrcDir, "server.ts"),
    binaryVersion: readVersionHash() || undefined,
    mode: browserManager.getConnectionMode(),
    ...process.env.BROWSE_CONFIG_HASH ? { configHash: process.env.BROWSE_CONFIG_HASH } : {},
    ...xvfb ? { xvfbPid: xvfb.pid, xvfbStartTime: xvfb.startTime, xvfbDisplay: xvfb.display } : {},
    ...(() => {
      const info = browserManager.getChromiumProcInfo();
      return info ? { chromiumPid: info.pid, chromiumStartTime: info.startTime } : {};
    })()
  };
  const tmpFile = tmpStatePath();
  fs20.writeFileSync(tmpFile, JSON.stringify(state, null, 2), { mode: 384 });
  fs20.renameSync(tmpFile, config.stateFile);
  browserManager.serverPort = port;
  if (!skipBrowser && isSessionPersistEnabled() && browserManager.getConnectionMode() === "launched") {
    const sessionStatePath = path20.join(config.stateDir, SESSION_STATE_FILE);
    restoreSessionState(browserManager, sessionStatePath).then((restored) => {
      if (restored) {
        console.log(`[browse] Session state restored: ${restored.cookies.length} cookies / ${restored.pages.length} tabs (BROWSE_PERSIST_STATE=1)`);
      } else {
        console.log("[browse] Session persistence on; no prior state — fresh session (BROWSE_PERSIST_STATE=1)");
      }
    }).catch((err) => {
      console.warn(`[browse] SESSION_RESTORE_FAILED: ${err?.message ?? err}`);
    });
    let persistWarned = false;
    let persistInFlight = false;
    sessionPersistInterval = setInterval(() => {
      if (isShuttingDown)
        return;
      if (persistInFlight)
        return;
      persistInFlight = true;
      persistSessionState(browserManager, sessionStatePath).catch((err) => {
        if (!persistWarned) {
          persistWarned = true;
          console.warn(`[browse] SESSION_PERSIST_FAILED: ${err?.message ?? err} (further failures suppressed)`);
        }
      }).finally(() => {
        persistInFlight = false;
      });
    }, sessionPersistIntervalMs());
    sessionPersistInterval?.unref?.();
  }
  if (browserManager.getConnectionMode() === "headed") {
    try {
      const currentUrl = browserManager.getCurrentUrl();
      if (currentUrl === "about:blank" || currentUrl === "") {
        const page = browserManager.getPage();
        page.goto(`http://127.0.0.1:${port}/welcome`, { timeout: 3000 }).catch((err) => {
          console.warn("[browse] Failed to navigate to welcome page:", err.message);
        });
      }
    } catch (err) {
      console.warn("[browse] Welcome page navigation setup failed:", err.message);
    }
  }
  try {
    const stateDir = path20.join(config.stateDir, "browse-states");
    if (fs20.existsSync(stateDir)) {
      const SEVEN_DAYS = 604800000;
      for (const file of fs20.readdirSync(stateDir)) {
        const filePath = path20.join(stateDir, file);
        const stat = fs20.statSync(filePath);
        if (Date.now() - stat.mtimeMs > SEVEN_DAYS) {
          fs20.unlinkSync(filePath);
          console.log(`[browse] Deleted stale state file: ${file}`);
        }
      }
    }
  } catch (err) {
    console.warn("[browse] Failed to clean stale state files:", err.message);
  }
  console.log(`[browse] Server running on http://127.0.0.1:${port} (PID: ${process.pid})`);
  console.log(`[browse] State file: ${config.stateFile}`);
  console.log(`[browse] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
  if (process.env.BROWSE_TUNNEL === "1" && !isPairAgentEnabled()) {
    console.error("[browse] BROWSE_TUNNEL=1 ignored: pair-agent is off. Enable once with: gstack-config set pair_agent on");
  } else if (process.env.BROWSE_TUNNEL === "1") {
    const authtoken = resolveNgrokAuthtoken();
    if (!authtoken) {
      console.error("[browse] BROWSE_TUNNEL=1 but no NGROK_AUTHTOKEN found. Set it via env var or ~/.gstack/ngrok.env");
    } else {
      const started = await startTunnel({
        fetchHandler: handle.fetchTunnel,
        authtoken,
        consent: "pair_agent=on (isPairAgentEnabled gate, BROWSE_TUNNEL=1)"
      });
      if (!started.ok) {
        console.error(`[browse] Failed to start tunnel: ${started.error.message}`);
      }
    }
  } else if (process.env.BROWSE_TUNNEL_LOCAL_ONLY === "1") {
    try {
      const boundTunnel = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: handle.fetchTunnel
      });
      tunnelServer = boundTunnel;
      tunnelActive = true;
      const tunnelPort = boundTunnel.port;
      console.log(`[browse] Tunnel listener bound (local-only test mode) on 127.0.0.1:${tunnelPort}`);
      const stateContent = JSON.parse(fs20.readFileSync(config.stateFile, "utf-8"));
      stateContent.tunnelLocalPort = tunnelPort;
      const tmpState = tmpStatePath();
      fs20.writeFileSync(tmpState, JSON.stringify(stateContent, null, 2), { mode: 384 });
      fs20.renameSync(tmpState, config.stateFile);
    } catch (err) {
      console.error(`[browse] BROWSE_TUNNEL_LOCAL_ONLY=1 listener bind failed: ${err.message}`);
    }
  }
}
function __resetShuttingDown() {
  isShuttingDown = false;
}
var config, activeShutdown = null, BROWSE_PORT, IDLE_TIMEOUT_MS, LOCAL_LISTEN_PORT = 0, tunnelActive = false, tunnelUrl = null, tunnelListener = null, tunnelServer = null, TUNNEL_PATHS, GSTACK_EXTENSION_ID = "dgbkdbjebeiblbajiilljmhjdpmiglep", TUNNEL_COMMANDS, CONSOLE_LOG_PATH, NETWORK_LOG_PATH, DIALOG_LOG_PATH, lastConsoleFlushed = 0, lastNetworkFlushed = 0, lastDialogFlushed = 0, flushInProgress = false, flushInterval, lastActivity, idleCheckInterval, __testInternals__, BROWSE_PARENT_PID, IS_HEADED_WATCHDOG, headedParentShutdownSuppressed = false, parentGone = false, rawWatchdogIntervalMs, PARENT_WATCHDOG_INTERVAL_MS, inspectorData = null, inspectorTimestamp = 0, inspectorSubscribers, browserManager, activeBrowserManager, isShuttingDown = false, sessionPersistInterval = null;
var init_server = __esm(() => {
  init_browser_manager();
  init_read_commands();
  init_write_commands();
  init_meta_commands();
  init_cookie_picker_routes();
  init_commands();
  init_content_security();
  init_security_sidecar_client();
  init_file_permissions();
  init_snapshot();
  init_token_registry();
  init_path_security();
  init_config();
  init_session_persist();
  init_activity();
  init_sse_helpers();
  init_audit();
  init_cdp_inspector();
  init_error_handling2();
  init_port_allocator();
  init_terminal_agent_control();
  init_error_handling2();
  init_sanitize();
  init_socks_bridge();
  init_proxy_config();
  init_egress_receipt();
  init_xvfb();
  init_tunnel_denial_log();
  init_sse_session_cookie();
  init_pty_session_cookie();
  init_pty_session_lease();
  init_buffers();
  init_commands();
  config = resolveConfig();
  ensureStateDir(config);
  initAuditLog(config.auditLog);
  BROWSE_PORT = parseInt(process.env.BROWSE_PORT || "0", 10);
  IDLE_TIMEOUT_MS = parseInt(process.env.BROWSE_IDLE_TIMEOUT || "1800000", 10);
  TUNNEL_PATHS = new Set([
    "/connect",
    "/command"
  ]);
  TUNNEL_COMMANDS = new Set([
    "goto",
    "click",
    "text",
    "screenshot",
    "html",
    "links",
    "forms",
    "accessibility",
    "attrs",
    "media",
    "data",
    "scroll",
    "press",
    "type",
    "select",
    "wait",
    "eval",
    "newtab",
    "tabs",
    "back",
    "forward",
    "reload",
    "snapshot",
    "fill",
    "url",
    "closetab"
  ]);
  CONSOLE_LOG_PATH = config.consoleLog;
  NETWORK_LOG_PATH = config.networkLog;
  DIALOG_LOG_PATH = config.dialogLog;
  flushInterval = setInterval(flushBuffers, 1000);
  lastActivity = Date.now();
  idleCheckInterval = setInterval(idleCheckTick, 60000);
  __testInternals__ = {
    idleCheckTick,
    parentWatchdogTick,
    suppressHeadedParentShutdown,
    resetParentWatchdogState: () => {
      headedParentShutdownSuppressed = false;
      parentGone = false;
    },
    setTunnelActive: (v) => {
      tunnelActive = v;
    },
    setLastActivity: (t) => {
      lastActivity = t;
    },
    formatExplicitPortUnavailableError,
    formatRandomPortUnavailableError,
    resetShutdownState: () => {
      isShuttingDown = false;
    }
  };
  BROWSE_PARENT_PID = parseInt(process.env.BROWSE_PARENT_PID || "0", 10);
  IS_HEADED_WATCHDOG = process.env.BROWSE_HEADED === "1";
  rawWatchdogIntervalMs = parseInt(process.env.BROWSE_PARENT_WATCHDOG_INTERVAL_MS || "", 10);
  PARENT_WATCHDOG_INTERVAL_MS = Number.isFinite(rawWatchdogIntervalMs) && rawWatchdogIntervalMs > 0 ? rawWatchdogIntervalMs : 15000;
  if (BROWSE_PARENT_PID > 0 && !IS_HEADED_WATCHDOG) {
    setInterval(parentWatchdogTick, PARENT_WATCHDOG_INTERVAL_MS);
  } else if (IS_HEADED_WATCHDOG) {
    console.log("[browse] Parent-process watchdog disabled (headed mode)");
  } else if (BROWSE_PARENT_PID === 0) {
    console.log("[browse] Parent-process watchdog disabled (BROWSE_PARENT_PID=0)");
  }
  inspectorSubscribers = new Set;
  browserManager = new BrowserManager;
  browserManager.onHeadedPromotion = suppressHeadedParentShutdown;
  activeBrowserManager = browserManager;
  browserManager.onDisconnect = (code) => activeShutdown?.(code ?? 2);
  if (__require.main == __require.module) {
    markDaemonProcess();
    process.on("SIGINT", () => activeShutdown?.());
    process.on("SIGHUP", () => activeShutdown?.());
    process.on("SIGTERM", () => {
      if (hasActivePicker()) {
        console.log("[browse] Received SIGTERM but cookie picker is active, ignoring to avoid stranding the picker UI");
        return;
      }
      const headed = activeBrowserManager.getConnectionMode() === "headed";
      if (headed || tunnelActive) {
        console.log(`[browse] Received SIGTERM in ${headed ? "headed" : "tunnel"} mode, shutting down`);
        activeShutdown?.();
      } else {
        console.log("[browse] Received SIGTERM (ignoring — use /stop or Ctrl+C for intentional shutdown)");
      }
    });
    if (process.platform === "win32") {
      process.on("exit", () => {
        safeUnlinkQuiet(config.stateFile);
      });
    }
  }
  if (__require.main == __require.module) {
    process.on("uncaughtException", (err) => {
      console.error("[browse] FATAL uncaught exception:", err.message);
      emergencyCleanup();
      process.exit(1);
    });
    process.on("unhandledRejection", (err) => {
      console.error("[browse] FATAL unhandled rejection:", err?.message || err);
      emergencyCleanup();
      process.exit(1);
    });
  }
  if (__require.main == __require.module) {
    start().catch((err) => {
      console.error(`[browse] Failed to start: ${err.message}`);
      try {
        const errorLogPath = path20.join(config.stateDir, "browse-startup-error.log");
        mkdirSecure(config.stateDir);
        writeSecureFile(errorLogPath, `${new Date().toISOString()} ${err.message}
${err.stack || ""}
`);
      } catch {}
      process.exit(1);
    });
  }
});
init_server();

export {
  GSTACK_EXTENSION_ID,
  META_COMMANDS,
  READ_COMMANDS,
  TUNNEL_COMMANDS,
  WRITE_COMMANDS,
  __resetShuttingDown,
  __testInternals__,
  addConsoleEntry,
  addDialogEntry,
  addNetworkEntry,
  buildCommandResponse,
  buildFetchHandler,
  canDispatchOverTunnel,
  consoleBuffer,
  dialogBuffer,
  getInspectorSubscriberCount,
  networkBuffer,
  resolveConfigFromEnv,
  start
};
