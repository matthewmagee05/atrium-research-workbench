import React, { useCallback, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { useWorkspace, type ModuleManifest } from "../store/workspace";
import { moduleExtras, STAGE_META, FALLBACK_STAGE } from "../store/module-catalog";

export function ModuleLibrary() {
  const modules = useWorkspace((s) => s.modules);
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const pipelineNodes = useWorkspace((s) => s.pipelineNodes);
  const [query, setQuery] = useState("");
  const [openStages, setOpenStages] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const key of Object.keys(STAGE_META)) init[key] = true;
    init[FALLBACK_STAGE.id] = false;
    return init;
  });

  const grouped = useMemo(() => {
    const buckets = new Map<string, ModuleManifest[]>();
    const q = query.toLowerCase().trim();
    for (const mod of modules) {
      const matches = !q
        || mod.id.toLowerCase().includes(q)
        || (mod.name ?? "").toLowerCase().includes(q)
        || (mod.description ?? "").toLowerCase().includes(q)
        || (mod.stage ?? "").toLowerCase().includes(q);
      if (!matches) continue;
      const stageId = mod.stage ?? FALLBACK_STAGE.id;
      const list = buckets.get(stageId) ?? [];
      list.push(mod);
      buckets.set(stageId, list);
    }
    const orderedStages = [...Object.values(STAGE_META), FALLBACK_STAGE].sort((a, b) => a.order - b.order);
    return orderedStages
      .filter((stage) => buckets.has(stage.id))
      .map((stage) => ({ stage, modules: (buckets.get(stage.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [modules, query]);

  const onDragStart = useCallback((event: React.DragEvent, moduleId: string) => {
    event.dataTransfer.setData("application/rwb-module", moduleId);
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const addToCanvas = useCallback((moduleId: string) => {
    const existing = pipelineNodes.filter((n) => n.moduleId === moduleId);
    const extras = moduleExtras(moduleId);
    addPipelineNode({
      id: `${moduleId}-${Date.now().toString(36)}`,
      moduleId,
      params: { ...(extras.recommendedParams ?? {}) },
      position: { x: 80 + pipelineNodes.length * 240, y: 200 + existing.length * 60 },
    });
  }, [addPipelineNode, pipelineNodes]);

  const toggleStage = useCallback((stageId: string) => {
    setOpenStages((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  }, []);

  return (
    <aside className="library">
      <div className="librarySearch">
        <Search size={14} />
        <input
          type="search"
          placeholder="Search modules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="moduleList">
        {grouped.length === 0 && (
          <div className="libraryEmpty">No modules match "{query}"</div>
        )}
        {grouped.map(({ stage, modules: stageModules }) => {
          const StageIcon = stage.icon;
          const open = openStages[stage.id] ?? true;
          return (
            <div key={stage.id} className="stageGroup">
              <button className="stageHeader" onClick={() => toggleStage(stage.id)} style={{ borderLeftColor: stage.color }}>
                <StageIcon size={14} style={{ color: stage.color }} />
                <span className="stageLabel">{stage.label}</span>
                <span className="stageCount">{stageModules.length}</span>
                <span className={`stageChevron ${open ? "open" : ""}`}>›</span>
              </button>
              {open && (
                <>
                  <span className="stageDescription">{stage.description}</span>
                  {stageModules.map((mod) => {
                    const extras = moduleExtras(mod.id);
                    return (
                      <div
                        key={mod.id}
                        className="module"
                        draggable
                        onDragStart={(e) => onDragStart(e, mod.id)}
                        onDoubleClick={() => addToCanvas(mod.id)}
                        title={extras.whenToUse}
                      >
                        <div className="moduleHeader">
                          <strong>{mod.name}</strong>
                          <button
                            className="moduleAdd"
                            onClick={(e) => { e.stopPropagation(); addToCanvas(mod.id); }}
                            title="Add to canvas"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="moduleTagline">{extras.tagline}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
