import type { ModuleManifest, PipelineEdge, PipelineNode } from "./workspace";

export interface PortInfo {
  nodeId: string;
  portName: string;
  schema: string;
  kind?: string;
}

export function getOutputPorts(node: PipelineNode, modules: ModuleManifest[]): PortInfo[] {
  const mod = modules.find((m) => m.id === node.moduleId);
  if (!mod?.outputs) return [];
  return mod.outputs.map((o) => ({
    nodeId: node.id,
    portName: o.name,
    schema: o.schema,
    kind: o.output_kind,
  }));
}

export function getInputPorts(node: PipelineNode, modules: ModuleManifest[]): PortInfo[] {
  const mod = modules.find((m) => m.id === node.moduleId);
  if (!mod?.inputs) return [];
  return mod.inputs.map((i) => ({
    nodeId: node.id,
    portName: i.name,
    schema: i.schema,
  }));
}

export function validateEdge(
  source: PipelineNode,
  sourcePort: string,
  target: PipelineNode,
  targetPort: string,
  modules: ModuleManifest[],
  existingEdges: PipelineEdge[]
): { valid: boolean; reason?: string } {
  if (source.id === target.id) {
    return { valid: false, reason: "Cannot connect a node to itself" };
  }

  const sourceMod = modules.find((m) => m.id === source.moduleId);
  const targetMod = modules.find((m) => m.id === target.moduleId);
  if (!sourceMod || !targetMod) {
    return { valid: false, reason: "Module not found" };
  }

  const sourceOutput = sourceMod.outputs?.find((o) => o.name === sourcePort);
  const targetInput = targetMod.inputs?.find((i) => i.name === targetPort);
  if (!sourceOutput) return { valid: false, reason: `Output port "${sourcePort}" not found on ${sourceMod.name}` };
  if (!targetInput) return { valid: false, reason: `Input port "${targetPort}" not found on ${targetMod.name}` };

  const alreadyConnected = existingEdges.some(
    (e) => e.target === target.id && e.targetPort === targetPort
  );
  if (alreadyConnected) {
    return { valid: false, reason: `Input "${targetPort}" already has a connection` };
  }

  if (sourceOutput.schema !== targetInput.schema) {
    return { valid: false, reason: `Schema mismatch: "${sourceOutput.schema}" → "${targetInput.schema}"` };
  }

  return { valid: true };
}
