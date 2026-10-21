import { describe, expect, it } from "vitest";
import { readTags } from "./tags";

// 태그를 직접 바이트로 만들어 읽어 본다.

const PNG = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4];
const bytes = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => be32(n).reverse();
const syncsafe = (n: number) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));
const utf16le = (s: string) => [0xff, 0xfe, ...Array.from(s).flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8])];

async function pictureBytes(b: Blob | undefined): Promise<number[]> {
  return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : [];
}

function id3(version: 3 | 4, frames: [string, number[]][]): Blob {
  const body = frames.flatMap(([id, data]) => [...bytes(id), ...(version === 4 ? syncsafe(data.length) : be32(data.length)), 0, 0, ...data]);
  const padded = [...body, 0, 0, 0, 0];
  return new Blob([new Uint8Array([...bytes("ID3"), version, 0, 0, ...syncsafe(padded.length), ...padded, 0xff, 0xfb, 0x90, 0x00])]);
}

describe("readTags", () => {
  it("reads ID3v2.3 title, artist (UTF-16) and the cover", async () => {
    const tags = await readTags(
      id3(3, [
        ["TIT2", [1, ...utf16le("언제나 몇 번이라도"), 0, 0]],
        ["TPE1", [0, ...bytes("Kimura Yumi")]],
        ["APIC", [0, ...bytes("image/png"), 0, 3, ...bytes("cover"), 0, ...PNG]],
      ]),
    );
    expect(tags.title).toBe("언제나 몇 번이라도");
    expect(tags.artist).toBe("Kimura Yumi");
    expect(tags.picture?.type).toBe("image/png");
    expect(await pictureBytes(tags.picture)).toEqual(PNG);
  });

  it("reads ID3v2.4 UTF-8 with an empty UTF-16 cover description", async () => {
    const tags = await readTags(
      id3(4, [
        ["TIT2", [3, ...utf8("밤양갱")]],
        ["APIC", [1, ...bytes("image/jpeg"), 0, 3, 0xff, 0xfe, 0, 0, ...PNG]],
      ]),
    );
    expect(tags.title).toBe("밤양갱");
    expect(tags.artist).toBeUndefined();
    expect(await pictureBytes(tags.picture)).toEqual(PNG);
  });

  it("reads FLAC vorbis comments and picture", async () => {
    const vendor = utf8("ref");
    const comments = ["TITLE=Spring Day", "artist=BTS"].map(utf8);
    const vc = [...le32(vendor.length), ...vendor, ...le32(comments.length), ...comments.flatMap((c) => [...le32(c.length), ...c])];
    const mime = bytes("image/png");
    const pic = [...be32(3), ...be32(mime.length), ...mime, ...be32(0), ...be32(1), ...be32(1), ...be32(24), ...be32(0), ...be32(PNG.length), ...PNG];
    const block = (type: number, last: boolean, data: number[]) => [(last ? 0x80 : 0) | type, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255, ...data];
    const flac = new Blob([new Uint8Array([...bytes("fLaC"), ...block(0, false, new Array(34).fill(0)), ...block(4, false, vc), ...block(6, true, pic)])]);
    const tags = await readTags(flac);
    expect(tags).toMatchObject({ title: "Spring Day", artist: "BTS" });
    expect(await pictureBytes(tags.picture)).toEqual(PNG);
  });

  it("reads m4a iTunes tags after the audio data", async () => {
    const box = (name: string, data: number[]) => [...be32(data.length + 8), ...Array.from(name, (c) => c.charCodeAt(0)), ...data];
    const data = (type: number, value: number[]) => box("data", [...be32(type), 0, 0, 0, 0, ...value]);
    const ilst = box("ilst", [...box("©nam", data(1, utf8("Hype Boy"))), ...box("©ART", data(1, utf8("NewJeans"))), ...box("covr", data(14, PNG))]);
    const moov = box("moov", box("udta", box("meta", [0, 0, 0, 0, ...ilst])));
    const file = [...box("ftyp", bytes("M4A ")), ...box("mdat", new Array(64).fill(7)), ...moov];
    const tags = await readTags(new Blob([new Uint8Array(file)]));
    expect(tags).toMatchObject({ title: "Hype Boy", artist: "NewJeans" });
    expect(tags.picture?.type).toBe("image/png");
    expect(await pictureBytes(tags.picture)).toEqual(PNG);
  });

  it("returns nothing for files without tags", async () => {
    expect(await readTags(new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0, 1, 2, 3, 4, 5, 6, 7, 8])]))).toEqual({});
    expect(await readTags(new Blob([new Uint8Array([...bytes("ID3"), 3, 0, 0, 0, 0, 0, 1, 0xff])]))).toEqual({});
  });
});
