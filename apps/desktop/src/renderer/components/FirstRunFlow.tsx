import { useState } from "react";
import { Rocket, Layers } from "lucide-react";
import { useWorkspace } from "../store/workspace";
import { TEMPLATES, instantiateTemplate } from "../store/templates";
import { CredentialsWizard } from "./CredentialsWizard";

type Step = "template" | "credentials";

export function FirstRunFlow() {
  const [step, setStep] = useState<Step>("template");
  const addPipelineNode = useWorkspace((s) => s.addPipelineNode);
  const addPipelineEdge = useWorkspace((s) => s.addPipelineEdge);
  const setFirstRunComplete = useWorkspace((s) => s.setFirstRunComplete);

  function selectTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      const { nodes, edges } = instantiateTemplate(template);
      for (const node of nodes) addPipelineNode(node);
      for (const edge of edges) addPipelineEdge(edge);
    }
    setStep("credentials");
  }

  if (step === "credentials") {
    return <CredentialsWizard />;
  }

  return (
    <div className="wizardOverlay">
      <div className="wizardCard wide">
        <h2><Rocket size={20} /> Welcome to Atrium</h2>
        <p>Choose a pipeline template to get started, or begin with a blank canvas.</p>
        <div className="templateGrid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="templateCard" onClick={() => selectTemplate(t.id)}>
              <Layers size={24} />
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
        <div className="wizardActions">
          <button onClick={() => setFirstRunComplete(true)}>Skip setup</button>
        </div>
      </div>
    </div>
  );
}
