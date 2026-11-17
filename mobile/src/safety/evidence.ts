/** Preserve the native container: iOS records QuickTime MOV; Android records MP4. */
export function evidenceFormat(uri: string) {
  const path = uri.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith(".mov"))
    return {
      extension: "mov",
      mimeType: "video/quicktime",
      UTI: "com.apple.quicktime-movie",
    };
  if (path.endsWith(".mp4"))
    return { extension: "mp4", mimeType: "video/mp4", UTI: "public.mpeg-4" };
  throw new Error(
    "Unsupported recording format. The original recording has not been renamed.",
  );
}
