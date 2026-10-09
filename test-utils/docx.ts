/**
 * Reads the committed product specification (.docx is a zip archive) with Node built-ins only,
 * so tests can check app content against the source document instead of a hand-copied list.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";

export const PRODUCT_SPEC_PATH = path.resolve(__dirname, "..", "priyanka app .docx");

export function readZipEntry(zipPath: string, entryName: string): string {
  const buf = fs.readFileSync(zipPath);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    if (name === entryName) {
      const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(start, start + compressedSize);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${entryName} not found in ${zipPath}`);
}

/** Plain-text rows of every table in the specification, cell by cell. */
export function readSpecTables(): string[][][] {
  const doc = readZipEntry(PRODUCT_SPEC_PATH, "word/document.xml");
  const text = (xml: string) => xml.replace(/<[^>]+>/g, "").trim();
  return (doc.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((tbl) =>
    (tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((row) => (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(text))
  );
}
