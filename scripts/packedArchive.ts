import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";

export type PackedArchive = ReadonlyMap<string, Buffer>;

function tarString(bytes: Buffer, start: number, length: number): string {
  const end = bytes.indexOf(0, start);
  return bytes.toString("utf8", start, end >= start && end < start + length ? end : start + length);
}

function tarSize(bytes: Buffer, offset: number): number {
  const source = tarString(bytes, offset + 124, 12).trim();
  if (!/^[0-7]*$/.test(source)) throw new Error(`Unsupported tar size field: ${source}`);
  return source === "" ? 0 : Number.parseInt(source, 8);
}

function paxPath(bytes: Buffer): string | undefined {
  const source = bytes.toString("utf8");
  for (const record of source.split("\n")) {
    const path = record.match(/^\d+ path=(.*)$/)?.[1];
    if (path !== undefined) return path;
  }
  return undefined;
}

export async function readPackedArchive(tarball: string): Promise<Map<string, Buffer>> {
  const tar = gunzipSync(await readFile(tarball));
  const entries = new Map<string, Buffer>();
  let offset = 0;
  let extendedPath: string | undefined;

  while (offset + 512 <= tar.length) {
    if (tar.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
    const name = tarString(tar, offset, 100);
    const prefix = tarString(tar, offset + 345, 155);
    const size = tarSize(tar, offset);
    const type = tarString(tar, offset + 156, 1) || "0";
    const contentsStart = offset + 512;
    const contents = tar.subarray(contentsStart, contentsStart + size);
    const resolvedName = extendedPath ?? (prefix === "" ? name : `${prefix}/${name}`);

    if (type === "x") {
      extendedPath = paxPath(contents);
    } else if (type === "0") {
      entries.set(resolvedName, Buffer.from(contents));
      extendedPath = undefined;
    } else if (type !== "5") {
      throw new Error(`${basename(tarball)} contains unsupported tar entry type ${type}.`);
    }
    offset = contentsStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export function packedText(entries: PackedArchive, path: string): string {
  const contents = entries.get(path);
  if (!contents) throw new Error(`Packed file does not exist: ${path}`);
  return contents.toString("utf8");
}
