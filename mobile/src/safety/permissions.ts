type Permission = { granted: boolean; canAskAgain: boolean };
type EvidenceAccess = {
  preview: boolean;
  camera: () => Promise<Permission>;
  microphone: () => Promise<Permission>;
  save: (enabled: boolean) => Promise<void>;
};
/** Permission prompts are sequential and never activate a recorder. */
export async function enableEvidenceAccess(
  access: EvidenceAccess,
): Promise<{ label: string; needsSettings: boolean }> {
  if (access.preview)
    return {
      label: "Simulated · camera and microphone stay off",
      needsSettings: false,
    };
  await access.save(false);
  const camera = await access.camera();
  if (!camera.granted)
    return {
      label: "Camera declined · evidence off",
      needsSettings: !camera.canAskAgain,
    };
  const mic = await access.microphone();
  if (!mic.granted)
    return {
      label: "Microphone declined · evidence off",
      needsSettings: !mic.canAskAgain,
    };
  await access.save(true);
  return {
    label: "Enabled · starts only when you choose",
    needsSettings: false,
  };
}
