import { Capacitor } from "@capacitor/core";

// 채보 파일을 기기 밖으로 내보낸다.
// 앱(안드로이드)에서는 공유 창을 열어 카카오톡, 드라이브 등으로 보내고,
// 브라우저에서는 파일로 내려받는다.

export type ExportResult = "shared" | "downloaded" | "cancelled";

export async function exportTextFile(fileName: string, text: string, title: string): Promise<ExportResult> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const written = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title, files: [written.uri], dialogTitle: title });
      return "shared";
    } catch (e) {
      // 사용자가 공유 창을 닫으면 거부로 끝난다
      if (String(e).toLowerCase().includes("cancel")) return "cancelled";
      throw e;
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
