import { ArtifactStore } from "./store";
import { readJsonFile } from "../fs-utils";

export function diffArtifacts(projectDir: string, artifactA: string, artifactB: string): Record<string, unknown> {
  const store = new ArtifactStore(projectDir);
  try {
    const metaA = store.getMeta(artifactA);
    const metaB = store.getMeta(artifactB);
    const dataA = readJsonFile<unknown>(store.dataPath(artifactA));
    const dataB = readJsonFile<unknown>(store.dataPath(artifactB));
    return {
      artifact_a: artifactA,
      artifact_b: artifactB,
      same_artifact_id: artifactA === artifactB,
      same_content_hash: metaA.content_hash === metaB.content_hash,
      content_hash_a: metaA.content_hash,
      content_hash_b: metaB.content_hash,
      row_count_a: metaA.row_count ?? null,
      row_count_b: metaB.row_count ?? null,
      data_equal: JSON.stringify(dataA) === JSON.stringify(dataB)
    };
  } finally {
    store.close();
  }
}
