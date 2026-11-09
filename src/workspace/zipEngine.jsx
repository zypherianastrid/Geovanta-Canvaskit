/**
 * @file src/workspace/zipEngine.jsx
 * @description Mesin pengemas & pembongkar arsip proyek .geovanta berbasis ZIP/CRC32 murni (ZipEngine)
 */
/* ----------------------------------------------------------------------------
   4. ZipEngine — Standards-compliant ZIP Reader & Writer for .geovanta Backup
   ---------------------------------------------------------------------------- */
const ZipEngine = (() => {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  const crc32 = u8 => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) {
      crc = crc >>> 8 ^ CRC_TABLE[(crc ^ u8[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder('utf-8');

  // Creates a valid standard ZIP archive (STORE method 0 for universal speed & zero dependency)
  // entries: Array<{ name: string, data: Uint8Array }>
  const createZipBlob = entries => {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() & 0x1F) << 11 | (now.getMinutes() & 0x3F) << 5 | now.getSeconds() >> 1 & 0x1F;
    const dosDate = (Math.max(1980, now.getFullYear()) - 1980 & 0x7F) << 9 | (now.getMonth() + 1 & 0x0F) << 5 | now.getDate() & 0x1F;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const nameBytes = textEncoder.encode(entry.name);
      const dataBytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data || 0);
      const crc = crc32(dataBytes);
      const size = dataBytes.byteLength;

      // Local file header (30 bytes + file name)
      const lfh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lfh.buffer);
      ldv.setUint32(0, 0x04034b50, true); // Local file header signature
      ldv.setUint16(4, 20, true); // Version needed to extract (2.0)
      ldv.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8)
      ldv.setUint16(8, 0, true); // Compression method: 0 (STORE)
      ldv.setUint16(10, dosTime, true);
      ldv.setUint16(12, dosDate, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, size, true);
      ldv.setUint32(22, size, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true); // Extra field length
      lfh.set(nameBytes, 30);
      localParts.push(lfh, dataBytes);

      // Central directory file header (46 bytes + file name)
      const cdh = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cdh.buffer);
      cdv.setUint32(0, 0x02014b50, true); // Central directory signature
      cdv.setUint16(4, 20, true); // Version made by
      cdv.setUint16(6, 20, true); // Version needed
      cdv.setUint16(8, 0x0800, true); // UTF-8 flag
      cdv.setUint16(10, 0, true); // Compression method: 0 (STORE)
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true); // Extra length
      cdv.setUint16(32, 0, true); // Comment length
      cdv.setUint16(34, 0, true); // Disk number
      cdv.setUint16(36, 0, true); // Internal attrs
      cdv.setUint32(38, 0, true); // External attrs
      cdv.setUint32(42, offset, true); // Relative offset of local header
      cdh.set(nameBytes, 46);
      centralParts.push(cdh);
      offset += lfh.byteLength + size;
    }
    const centralSize = centralParts.reduce((s, p) => s + p.byteLength, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); // End of central directory signature
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true);
    edv.setUint16(20, 0, true);
    return new Blob([...localParts, ...centralParts, eocd], {
      type: 'application/zip'
    });
  };

  /* GV-A02: Hard security limits for ZIP decompression (ZIP Bomb & Path Traversal Defense) */
  const ZIP_LIMITS = {
    MAX_ENTRIES: 2000,
    MAX_ENTRY_BYTES: 64 * 1024 * 1024,
    // 64 MB per file
    MAX_TOTAL_UNCOMPRESSED_BYTES: 250 * 1024 * 1024,
    // 250 MB total uncompressed
    MAX_COMPRESSION_RATIO: 200,
    // max 200:1 expansion ratio
    MAX_PATH_LENGTH: 256
  };
  const isSafeZipEntryPath = name => {
    if (!name || typeof name !== 'string' || name.length > ZIP_LIMITS.MAX_PATH_LENGTH) return false;
    if (name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
    const segs = name.split('/');
    for (let i = 0; i < segs.length; i++) {
      if (segs[i] === '..' || segs[i] === '.') return false;
    }
    return true;
  };
  const inflateRawBytes = async (compressedU8, maxAllowedBytes = ZIP_LIMITS.MAX_ENTRY_BYTES, maxRatio = ZIP_LIMITS.MAX_COMPRESSION_RATIO) => {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressedU8).catch(() => {});
      writer.close().catch(() => {});
      const reader = ds.readable.getReader();
      const chunks = [];
      let totalOut = 0;
      const compLen = Math.max(1, compressedU8.byteLength);
      try {
        for (;;) {
          const {
            done,
            value
          } = await reader.read();
          if (done) break;
          if (value && value.byteLength) {
            totalOut += value.byteLength;
            if (totalOut > maxAllowedBytes) {
              try {
                await reader.cancel('Entry exceeds MAX_ENTRY_BYTES');
              } catch (e) {}
              throw new Error(`File terkompresi melebihi batas keamanan (${Math.round(maxAllowedBytes / (1024 * 1024))} MB)`);
            }
            if (totalOut > 65536 && totalOut / compLen > maxRatio) {
              try {
                await reader.cancel('Compression ratio exceeded');
              } catch (e) {}
              throw new Error(`Rasio dekompresi mencurigakan (ZIP bomb terdeteksi > ${maxRatio}:1)`);
            }
            chunks.push(value);
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {}
      }
      const out = new Uint8Array(totalOut);
      let off = 0;
      for (let i = 0; i < chunks.length; i++) {
        out.set(chunks[i], off);
        off += chunks[i].byteLength;
      }
      return out;
    }
    throw new Error('Kompresi DEFLATE tidak didukung pada lingkungan ini');
  };

  // Reads a ZIP archive ArrayBuffer and returns Map<filename, Uint8Array> with strict GV-A02 validation
  const readZipBuffer = async (arrayBuffer, customLimits = null) => {
    const lim = {
      ...ZIP_LIMITS,
      ...(customLimits || {})
    };
    const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    if (u8.byteLength < 22) throw new Error('File arsip .geovanta tidak valid atau rusak (terlalu kecil)');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    // Locate End of Central Directory (EOCD) signature 0x06054b50
    let eocdPos = -1;
    const minPos = Math.max(0, u8.byteLength - 65557);
    for (let p = u8.byteLength - 22; p >= minPos; p--) {
      if (dv.getUint32(p, true) === 0x06054b50) {
        eocdPos = p;
        break;
      }
    }
    if (eocdPos < 0) throw new Error('Struktur ZIP .geovanta tidak ditemukan (EOCD hilang)');
    const totalEntries = dv.getUint16(eocdPos + 10, true);
    const cdSize = dv.getUint32(eocdPos + 12, true);
    const cdOffset = dv.getUint32(eocdPos + 16, true);
    if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error('Arsip ZIP64 tidak didukung oleh spesifikasi keamanan .geovanta');
    }
    if (totalEntries > lim.MAX_ENTRIES) {
      throw new Error(`Jumlah entri arsip (${totalEntries}) melebihi batas keamanan (${lim.MAX_ENTRIES})`);
    }
    if (cdOffset + cdSize > u8.byteLength) {
      throw new Error('Direktori arsip .geovanta rusak atau terpotong');
    }
    const files = new Map();
    const byteRanges = [];
    let totalUncompressed = 0;
    let ptr = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (ptr + 46 > u8.byteLength || dv.getUint32(ptr, true) !== 0x02014b50) {
        throw new Error('Header direktori ZIP .geovanta tidak valid');
      }
      const method = dv.getUint16(ptr + 10, true);
      const expectedCrc = dv.getUint32(ptr + 16, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const uncompSize = dv.getUint32(ptr + 24, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commentLen = dv.getUint16(ptr + 32, true);
      const localHeaderOffset = dv.getUint32(ptr + 42, true);
      if (ptr + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) {
        throw new Error('Entri Central Directory melampaui batas tabel direktori ZIP');
      }
      const name = textDecoder.decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      if (!isSafeZipEntryPath(name)) {
        throw new Error(`Nama path entri ZIP tidak aman atau tidak valid: ${name}`);
      }
      if (files.has(name)) {
        throw new Error(`Entri duplikat terdeteksi di dalam arsip ZIP: ${name}`);
      }
      if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
        throw new Error(`Entri ZIP64 tidak didukung: ${name}`);
      }
      if (uncompSize > lim.MAX_ENTRY_BYTES) {
        throw new Error(`Ukuran entri ${name} melebihi batas maksimum per berkas`);
      }
      if (totalUncompressed + uncompSize > lim.MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error('Total ukuran dekompresi arsip melebihi batas keamanan memori');
      }
      if (compSize > 0 && uncompSize > 65536 && uncompSize / compSize > lim.MAX_COMPRESSION_RATIO) {
        throw new Error(`Rasio kompresi tidak wajar pada ${name}`);
      }
      if (localHeaderOffset + 30 > u8.byteLength || dv.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error(`Header lokal ZIP rusak untuk ${name}`);
      }
      const lMethod = dv.getUint16(localHeaderOffset + 8, true);
      const lNameLen = dv.getUint16(localHeaderOffset + 26, true);
      const lExtraLen = dv.getUint16(localHeaderOffset + 28, true);
      if (lMethod !== method) {
        throw new Error(`Metode kompresi header lokal tidak cocok dengan central directory pada ${name}`);
      }
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > cdOffset || dataEnd > u8.byteLength) {
        throw new Error(`Data file dalam arsip terpotong atau menabrak central directory: ${name}`);
      }
      for (let r = 0; r < byteRanges.length; r++) {
        const br = byteRanges[r];
        if (localHeaderOffset < br[1] && dataEnd > br[0]) {
          throw new Error(`Rentang data entri ZIP saling tumpang tindih (overlapping local headers): ${name}`);
        }
      }
      byteRanges.push([localHeaderOffset, dataEnd]);
      const rawSlice = u8.subarray(dataStart, dataEnd);
      const remBudget = lim.MAX_TOTAL_UNCOMPRESSED_BYTES - totalUncompressed;
      const entryCap = Math.min(lim.MAX_ENTRY_BYTES, remBudget, uncompSize + 1024);
      let fileData;
      if (method === 0) {
        if (compSize !== uncompSize) throw new Error(`Ukuran STORED tidak konsisten pada ${name}`);
        fileData = new Uint8Array(rawSlice);
      } else if (method === 8) {
        fileData = await inflateRawBytes(rawSlice, entryCap, lim.MAX_COMPRESSION_RATIO);
      } else {
        throw new Error(`Metode kompresi ZIP tidak didukung (${method}) pada ${name}`);
      }
      if (fileData.byteLength !== uncompSize) {
        throw new Error(`Ukuran file tidak cocok dengan deklarasi header pada ${name}`);
      }
      totalUncompressed += fileData.byteLength;
      if (totalUncompressed > lim.MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error('Total ukuran dekompresi arsip melebihi batas keamanan memori');
      }
      const actualCrc = crc32(fileData);
      if (actualCrc !== expectedCrc) {
        throw new Error(`Checksum CRC32 gagal pada ${name}`);
      }
      files.set(name, fileData);
    }
    return files;
  };
  return {
    ZIP_LIMITS,
    isSafeZipEntryPath,
    inflateRawBytes,
    crc32,
    createZipBlob,
    readZipBuffer,
    encodeText: s => textEncoder.encode(String(s || '')),
    decodeText: u8 => textDecoder.decode(u8)
  };
})();

/* ----------------------------------------------------------------------------
   5. ProjectRepository — Full Project CRUD, Trash, Duplicate, Snapshots & Backup
   ---------------------------------------------------------------------------- */

export { ZipEngine };
export default ZipEngine;
