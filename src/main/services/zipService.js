const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Pure Node.js ZIP/VSIX extractor
 * Zero external dependencies, safe against zip-slip directory traversal
 */
class ZipService {
  /**
   * Extract a zip buffer or file to a destination directory
   */
  static extractZip(zipSource, destDir) {
    let buffer;
    if (typeof zipSource === 'string') {
      buffer = fs.readFileSync(zipSource);
    } else if (Buffer.isBuffer(zipSource)) {
      buffer = zipSource;
    } else {
      throw new Error('Invalid zip source: must be a file path or Buffer');
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const files = this.parseZip(buffer);
    const resolvedDest = path.resolve(destDir);

    for (const file of files) {
      // Normalize and guard against zip-slip vulnerability
      const targetPath = path.resolve(destDir, file.name);
      if (!targetPath.startsWith(resolvedDest)) {
        console.warn(`[ZipService] Skipping dangerous zip-slip entry: ${file.name}`);
        continue;
      }

      if (file.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, file.data);
      }
    }

    return files.map(f => f.name);
  }

  /**
   * Parse files from ZIP buffer by walking Central Directory or Local File Headers
   */
  static parseZip(buffer) {
    const entries = [];
    let offset = 0;

    // Walk local file headers: signature 0x04034b50 ('PK\x03\x04')
    while (offset + 30 <= buffer.length) {
      const sig = buffer.readUInt32LE(offset);
      if (sig !== 0x04034b50) {
        // Not a local file header, might have reached central directory
        break;
      }

      const flags = buffer.readUInt16LE(offset + 6);
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      let compressedSize = buffer.readUInt32LE(offset + 18);
      let uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);

      const fileNameStart = offset + 30;
      const fileNameEnd = fileNameStart + fileNameLength;
      const fileName = buffer.toString('utf8', fileNameStart, fileNameEnd).replace(/\\/g, '/');

      const dataStart = fileNameEnd + extraFieldLength;
      const isDirectory = fileName.endsWith('/') || fileName.endsWith('\\');

      // Check if data descriptor is used (bit 3 of flags)
      const hasDataDescriptor = (flags & 0x08) !== 0;

      let fileData = Buffer.alloc(0);

      if (!isDirectory) {
        if (!hasDataDescriptor) {
          const compressedData = buffer.slice(dataStart, dataStart + compressedSize);
          if (compressionMethod === 0) {
            // Stored (no compression)
            fileData = compressedData;
          } else if (compressionMethod === 8) {
            // Deflated
            try {
              fileData = zlib.inflateRawSync(compressedData);
            } catch (err) {
              console.warn(`[ZipService] Failed to inflate ${fileName}:`, err.message);
            }
          }
          offset = dataStart + compressedSize;
        } else {
          // Find next PK signature to locate end of data
          let nextHeader = dataStart;
          while (nextHeader + 4 <= buffer.length) {
            const nextSig = buffer.readUInt32LE(nextHeader);
            if (nextSig === 0x04034b50 || nextSig === 0x02014b50 || nextSig === 0x08074b50) {
              break;
            }
            nextHeader++;
          }

          let compChunk = buffer.slice(dataStart, nextHeader);
          if (compressionMethod === 8) {
            try {
              fileData = zlib.inflateRawSync(compChunk);
            } catch (e) {
              fileData = compChunk;
            }
          } else {
            fileData = compChunk;
          }

          // If followed by data descriptor (PK\x07\x08)
          if (nextHeader + 4 <= buffer.length && buffer.readUInt32LE(nextHeader) === 0x08074b50) {
            nextHeader += 16;
          }
          offset = nextHeader;
          entries.push({ name: fileName, isDirectory: false, data: fileData });
          continue;
        }
      } else {
        offset = dataStart;
      }

      entries.push({
        name: fileName,
        isDirectory,
        data: fileData
      });
    }

    return entries;
  }
}

module.exports = ZipService;
