import * as FileSystem from "expo-file-system";
import { randomUUID } from "expo-crypto";

export async function persistRecording(sourceUri: string): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("Local recording storage is unavailable");
  const directory = `${root}recordings/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${randomUUID()}.m4a`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}
