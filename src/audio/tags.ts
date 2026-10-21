// 음원 파일 안에 들어 있는 곡 정보(제목, 가수)와 앨범 아트를 읽는다.
// mp3(ID3v2.2~2.4), flac(Vorbis comment, PICTURE), m4a/mp4(iTunes 태그)를 다룬다.
// 파일 전체를 읽지 않고 태그가 있는 부분만 잘라 읽는다.

export interface AudioTags {
  title?: string;
  artist?: string;
  /** 앨범 아트 이미지 */
  picture?: Blob;
}

/** 태그를 읽지 못하면 빈 객체 (곡 추가를 막지 않는다) */
export async function readTags(blob: Blob): Promise<AudioTags> {
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (ascii(head, 0, 3) === "ID3") return await readId3(blob);
    if (ascii(head, 0, 4) === "fLaC") return await readFlac(blob);
    if (ascii(head, 4, 4) === "ftyp") return await readMp4(blob);
  } catch {
    // 깨진 태그는 무시한다
  }
  return {};
}

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = "";
  for (let i = at; i < at + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const syncsafe = (b: Uint8Array, at: number) => ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);

function clean(s: string | undefined): string | undefined {
  // eslint-disable-next-line no-control-regex
  const t = s?.replace(/\u0000/g, "").trim();
  return t ? t : undefined;
}

// ---------- ID3v2 (mp3) ----------

/** 텍스트 인코딩: 0 ISO-8859-1, 1 UTF-16(BOM), 2 UTF-16BE, 3 UTF-8 */
function decodeText(enc: number, b: Uint8Array): string {
  if (enc === 0) return Array.from(b, (c) => String.fromCharCode(c)).join("");
  if (enc === 3) return new TextDecoder("utf-8").decode(b);
  let le = enc === 1;
  let from = 0;
  if (b[0] === 0xff && b[1] === 0xfe) {
    le = true;
    from = 2;
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    le = false;
    from = 2;
  }
  return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(b.subarray(from, from + ((b.length - from) & ~1)));
}

/** 인코딩에 맞는 글자 끝(0) 위치. 끝이 없으면 -1 */
function textEnd(enc: number, b: Uint8Array, from: number): number {
  if (enc === 0 || enc === 3) {
    const i = b.indexOf(0, from);
    return i;
  }
  for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
  return -1;
}

async function readId3(blob: Blob): Promise<AudioTags> {
  const header = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  const version = header[3];
  const flags = header[5];
  const size = syncsafe(header, 6);
  let tag = new Uint8Array(await blob.slice(10, 10 + size).arrayBuffer());
  // 태그 전체에 비동기화(FF 00 → FF)가 걸려 있으면 푼다 (v2.2, v2.3)
  if (flags & 0x80 && version < 4) {
    const out: number[] = [];
    for (let i = 0; i < tag.length; i++) {
      out.push(tag[i]);
      if (tag[i] === 0xff && tag[i + 1] === 0) i++;
    }
    tag = Uint8Array.from(out);
  }
  let pos = 0;
  if (flags & 0x40) pos = version === 4 ? syncsafe(tag, 0) : u32(tag, 0) + 4; // 확장 헤더 건너뛰기

  const out: AudioTags = {};
  const idLen = version === 2 ? 3 : 4;
  const headLen = version === 2 ? 6 : 10;
  while (pos + headLen <= tag.length) {
    const id = ascii(tag, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // 여백(0)에 닿았다
    const len =
      version === 2 ? (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5] : version === 4 ? syncsafe(tag, pos + 4) : u32(tag, pos + 4);
    const body = tag.subarray(pos + headLen, pos + headLen + len);
    pos += headLen + len;
    if (body.length === 0) continue;
    const enc = body[0];
    if (id === "TIT2" || id === "TT2") out.title ??= clean(decodeText(enc, body.subarray(1)));
    else if (id === "TPE1" || id === "TP1") out.artist ??= clean(decodeText(enc, body.subarray(1)));
    else if ((id === "APIC" || id === "PIC") && !out.picture) {
      let p = 1;
      let mime: string;
      if (id === "PIC") {
        const fmt = ascii(body, 1, 3).toLowerCase();
        mime = fmt === "png" ? "image/png" : "image/jpeg";
        p = 4;
      } else {
        const end = body.indexOf(0, 1);
        if (end < 0) continue;
        mime = ascii(body, 1, end - 1) || "image/jpeg";
        p = end + 1;
      }
      p += 1; // 그림 종류 (앞표지 등)
      const descEnd = textEnd(enc, body, p);
      if (descEnd < 0) continue;
      p = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
      if (!mime.includes("/")) mime = `image/${mime.toLowerCase() === "png" ? "png" : "jpeg"}`;
      out.picture = new Blob([body.slice(p)], { type: mime });
    }
  }
  return out;
}

// ---------- FLAC ----------

async function readFlac(blob: Blob): Promise<AudioTags> {
  const out: AudioTags = {};
  let pos = 4;
  for (;;) {
    const h = new Uint8Array(await blob.slice(pos, pos + 4).arrayBuffer());
    if (h.length < 4) break;
    const last = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 4 || type === 6) {
      const b = new Uint8Array(await blob.slice(pos + 4, pos + 4 + len).arrayBuffer());
      if (type === 4) readVorbisComment(b, out);
      else if (!out.picture) out.picture = readFlacPicture(b);
    }
    pos += 4 + len;
    if (last) break;
  }
  return out;
}

function readVorbisComment(b: Uint8Array, out: AudioTags): void {
  const le32 = (at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
  const dec = new TextDecoder("utf-8");
  let p = 4 + le32(0); // 만든 프로그램 이름 건너뛰기
  const count = le32(p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = le32(p);
    const text = dec.decode(b.subarray(p + 4, p + 4 + len));
    p += 4 + len;
    const eq = text.indexOf("=");
    const key = text.slice(0, eq).toUpperCase();
    const value = clean(text.slice(eq + 1));
    if (key === "TITLE") out.title ??= value;
    else if (key === "ARTIST") out.artist ??= value;
  }
}

function readFlacPicture(b: Uint8Array): Blob {
  let p = 4;
  const mimeLen = u32(b, p);
  const mime = ascii(b, p + 4, mimeLen) || "image/jpeg";
  p += 4 + mimeLen;
  p += 4 + u32(b, p); // 설명
  p += 16; // 가로, 세로, 색 깊이, 색 수
  const len = u32(b, p);
  return new Blob([b.slice(p + 4, p + 4 + len)], { type: mime });
}

// ---------- MP4 / M4A ----------

/** 상자(atom) 목록: [이름, 내용 시작, 내용 끝] */
function boxes(b: Uint8Array, from: number, to: number): [string, number, number][] {
  const out: [string, number, number][] = [];
  let p = from;
  while (p + 8 <= to) {
    const size = u32(b, p);
    if (size < 8) break;
    out.push([ascii(b, p + 4, 4), p + 8, Math.min(to, p + size)]);
    p += size;
  }
  return out;
}

async function readMp4(blob: Blob): Promise<AudioTags> {
  // 맨 위 상자들 중 moov만 읽는다 (음원 데이터 mdat은 건너뛴다)
  let pos = 0;
  while (pos + 8 <= blob.size) {
    const h = new Uint8Array(await blob.slice(pos, pos + 16).arrayBuffer());
    let size = u32(h, 0);
    let headLen = 8;
    if (size === 1) {
      size = u32(h, 8) * 2 ** 32 + u32(h, 12);
      headLen = 16;
    } else if (size === 0) size = blob.size - pos;
    if (size < headLen) break;
    if (ascii(h, 4, 4) === "moov") {
      const moov = new Uint8Array(await blob.slice(pos + headLen, pos + size).arrayBuffer());
      return readIlst(moov);
    }
    pos += size;
  }
  return {};
}

function readIlst(moov: Uint8Array): AudioTags {
  const out: AudioTags = {};
  const find = (name: string, from: number, to: number) => boxes(moov, from, to).find(([n]) => n === name);
  const udta = find("udta", 0, moov.length);
  if (!udta) return out;
  const meta = find("meta", udta[1], udta[2]);
  if (!meta) return out;
  const ilst = find("ilst", meta[1] + 4, meta[2]); // meta는 내용 앞에 버전/플래그 4바이트가 있다
  if (!ilst) return out;
  for (const [name, from, to] of boxes(moov, ilst[1], ilst[2])) {
    const data = find("data", from, to);
    if (!data) continue;
    const type = u32(moov, data[1]) & 0xffffff;
    const value = moov.subarray(data[1] + 8, data[2]); // 종류 4바이트 + 언어 4바이트
    if (name === "©nam") out.title ??= clean(new TextDecoder("utf-8").decode(value));
    else if (name === "©ART") out.artist ??= clean(new TextDecoder("utf-8").decode(value));
    else if (name === "covr" && !out.picture) out.picture = new Blob([value.slice()], { type: type === 14 ? "image/png" : "image/jpeg" });
  }
  return out;
}
