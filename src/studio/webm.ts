type Element = {
  id: number;
  start: number;
  sizeStart: number;
  dataStart: number;
  end: number;
  unknown: boolean;
};

function readElement(bytes: Uint8Array, offset: number): Element | null {
  if (offset >= bytes.length || bytes[offset] === 0) return null;
  let idLength = 1;
  while (idLength <= 4 && !(bytes[offset] & (0x80 >> (idLength - 1))))
    idLength++;
  if (idLength > 4 || offset + idLength >= bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLength; i++) id = id * 256 + bytes[offset + i];
  const sizeStart = offset + idLength;
  let sizeLength = 1;
  while (sizeLength <= 8 && !(bytes[sizeStart] & (0x80 >> (sizeLength - 1))))
    sizeLength++;
  if (sizeLength > 8 || sizeStart + sizeLength > bytes.length) return null;
  let size = bytes[sizeStart] & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let i = 1; i < sizeLength; i++) {
    size = size * 256 + bytes[sizeStart + i];
    unknown = unknown && bytes[sizeStart + i] === 255;
  }
  const dataStart = sizeStart + sizeLength;
  return {
    id,
    start: offset,
    sizeStart,
    dataStart,
    end: unknown ? bytes.length : Math.min(bytes.length, dataStart + size),
    unknown,
  };
}

function sizeVint(size: number, minimumLength = 1) {
  let length = minimumLength;
  while (size >= Math.pow(2, length * 7) - 1) length++;
  const bytes = new Uint8Array(length);
  let remainder = size;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = remainder % 256;
    remainder = Math.floor(remainder / 256);
  }
  bytes[0] |= 1 << (8 - length);
  return bytes;
}

/** Chrome's streaming WebM has no duration. Add it so local players can seek. */
export async function withWebmDuration(
  blob: Blob,
  seconds: number,
): Promise<Blob> {
  if (!Number.isFinite(seconds) || seconds <= 0) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let segment: Element | null = null;
  for (let offset = 0; offset < bytes.length;) {
    const element = readElement(bytes, offset);
    if (!element) break;
    if (element.id === 0x18538067) {
      segment = element;
      break;
    }
    offset = element.end;
  }
  if (!segment) return blob;
  let info: Element | null = null;
  for (let offset = segment.dataStart; offset < segment.end;) {
    const element = readElement(bytes, offset);
    if (!element) break;
    if (element.id === 0x1549a966) {
      info = element;
      break;
    }
    if (element.end <= offset) break;
    offset = element.end;
  }
  if (!info || info.unknown) return blob;
  let timecodeScale = 1_000_000;
  let oldDuration: Element | null = null;
  for (let offset = info.dataStart; offset < info.end;) {
    const element = readElement(bytes, offset);
    if (!element || element.end <= offset) break;
    if (element.id === 0x2ad7b1) {
      let n = 0;
      for (let i = element.dataStart; i < element.end; i++)
        n = n * 256 + bytes[i];
      if (n > 0) timecodeScale = n;
    }
    if (element.id === 0x4489) oldDuration = element;
    offset = element.end;
  }
  const duration = new Uint8Array(11);
  duration.set([0x44, 0x89, 0x88]);
  new DataView(duration.buffer).setFloat64(
    3,
    (seconds * 1_000_000_000) / timecodeScale,
    false,
  );
  const before = oldDuration
    ? bytes.subarray(info.dataStart, oldDuration.start)
    : bytes.subarray(info.dataStart, info.end);
  const after = oldDuration
    ? bytes.subarray(oldDuration.end, info.end)
    : new Uint8Array();
  const infoSize = sizeVint(
    before.length + duration.length + after.length,
    info.dataStart - info.sizeStart,
  );
  const delta =
    info.sizeStart -
    info.start +
    infoSize.length +
    before.length +
    duration.length +
    after.length -
    (info.end - info.start);
  // MediaRecorder uses an unknown-size Segment. Preserve that streaming header;
  // accommodate a finite one as well without truncating its payload.
  const segmentSize = segment.unknown
    ? bytes.subarray(segment.sizeStart, segment.dataStart)
    : sizeVint(
        segment.end - segment.dataStart + delta,
        segment.dataStart - segment.sizeStart,
      );
  return new Blob(
    [
      bytes.subarray(0, segment.sizeStart),
      segmentSize,
      bytes.subarray(segment.dataStart, info.sizeStart),
      infoSize,
      before,
      duration,
      after,
      bytes.subarray(info.end),
    ],
    { type: blob.type },
  );
}
