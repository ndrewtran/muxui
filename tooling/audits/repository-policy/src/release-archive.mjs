// Byte-stable package archives. Every release package is repacked from its extracted tree with fixed header fields
// and a zero gzip mtime, so one tree always gives one tarball (Node's gzip header does store the build OS, so the
// bytes are stable per OS family).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

function writeString(buffer, value, offset, length) {
  buffer.write(String(value).slice(0, length), offset, length, 'utf8');
}

function octal(value, length) {
  const digits = Math.max(0, length - 1);
  return `${Number(value).toString(8).padStart(digits, '0')}\0`;
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  writeString(header, path, 0, 100);
  writeString(header, octal(0o644, 8), 100, 8);
  writeString(header, octal(0, 8), 108, 8);
  writeString(header, octal(0, 8), 116, 8);
  writeString(header, octal(size, 12), 124, 12);
  writeString(header, octal(0, 12), 136, 12);
  header.fill(0x20, 148, 156);
  writeString(header, '0', 156, 1);
  writeString(header, 'ustar\0', 257, 6);
  writeString(header, '00', 263, 2);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  writeString(header, `${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return header;
}

function packageFiles(packageRoot, prefix = 'package') {
  return readdirSync(packageRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolute = join(packageRoot, entry.name);
      const archivePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return packageFiles(absolute, archivePath);
      if (!entry.isFile()) throw new Error(`R1_EXIT_PACK_CONTENT_INVALID: ${archivePath}`);
      if (Buffer.byteLength(archivePath) > 100) throw new Error(`R1_EXIT_PACK_CONTENT_INVALID: ${archivePath} is longer than a ustar name`);
      return [{ absolute, archivePath }];
    });
}

/** The gzipped ustar archive of `packageRoot`'s files, rooted at `package/`, in name order. */
export function deterministicArchive(packageRoot) {
  const chunks = [];
  for (const { absolute, archivePath } of packageFiles(packageRoot)) {
    const bytes = readFileSync(absolute);
    chunks.push(tarHeader(archivePath, bytes.length), bytes);
    const remainder = bytes.length % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

/**
 * The regular files of a package archive as a Map of `package/...` path to bytes. It reads the plain ustar archives
 * this module writes and `npm pack` writes, so a verifier needs no `tar` binary and no extraction directory.
 */
export function readArchive(archive) {
  const tar = gunzipSync(archive);
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/su, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const name = field(0, 100);
    offset += 512;
    if (type === '0' || type === '') {
      if (files.has(name)) throw new Error(`P2_1_ARCHIVE_INVALID: duplicate entry ${name}`);
      files.set(name, Buffer.from(tar.subarray(offset, offset + size)));
    } else if (type !== '5') {
      throw new Error(`P2_1_ARCHIVE_INVALID: ${name} is neither a file nor a directory`);
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}
