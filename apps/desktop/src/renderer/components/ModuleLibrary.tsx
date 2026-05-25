import React, { useCallback } from "react";
import { Box, GripVertical } from "lucide-react";
import { useWorkspace } from "../store/workspace";

export function ModuleLibrary() {
  const modules = useWorkspace((s) => s.modules);
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);

  const onDragStart = useCallback((event: React.DragEvent, moduleId: string) => {
    event.dataTransfer.setData("application/rwb-module", moduleId);
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const onDoubleClick = useCallback((moduleId: string) => {
    const existing = pipelineNodes.filter((n) => n.moduleId === moduleId);
    addPipelineNode({
      id: `${moduleId}-${Date.now().toString(36)}`,
      moduleId,
      params: {},
      position: { x: 80 + pipelineNodes.length * 240, y: 200 + existing.length * 60 },
    });
  }, [addPipelineNode, pipelineNodes]);

  return (
    <aside className="library">
      <h2><Box size={16} /> Modules</h2>
      <div className="moduleList">
        {modules.map((mod) => (
          <div
            className="module"
            key={mod.id}
            draggable
            onDragStart={(e) => onDragStart(e, mod.id)}
            onDoubleClick={() => onDoubleClick(mod.id)}
          >
            <div className="moduleHeader">
              <GripVertical size={12} className="dragHandle" />
              <strong>{mod.name}</strong>
            </div>
            <span>{mod.stage} · {mod.runtime} · v{mod.version}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
