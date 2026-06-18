import { describe, expect, it } from "vitest";
import { planImplementationAssignments, TAURI_REACT_REQUIRED_FILES, validateProjectCompleteness } from "../index";
import type { AgentConfig, PlanArtifact } from "../../types";

const artifact: PlanArtifact = {
  id: "a1",
  title: "Tauri React app",
  stack: ["Tauri", "React", "TypeScript"],
  steps: ["Create scaffold", "Build UI"],
  projectTree: "app/\n├─ src/\n├─ src-tauri/\n└─ package.json",
  status: "draft",
  edited: true,
};

const agent = (id: string): AgentConfig => ({
  id,
  name: "Разработчик",
  role: "coder",
  providerId: "p1",
  modelId: "m1",
  systemPrompt: "",
  tokenBudget: 1000,
  tools: [],
  status: "waiting",
});

describe("projectBuilder assignments", () => {
  it("uses stable agent ids for assignments with duplicate names and roles", () => {
    const assignments = planImplementationAssignments(artifact, [agent("coder-a"), agent("coder-b")]);

    expect(assignments.map((item) => item.owner)).toEqual(["Разработчик", "Разработчик"]);
    expect(assignments.map((item) => item.role)).toEqual(["coder", "coder"]);
    expect(new Set(assignments.map((item) => item.id)).size).toBe(2);
    expect(assignments.map((item) => item.id)).toEqual(["coder-a", "coder-b"]);
  });
});

describe("project completeness", () => {
  it("accepts a complete Tauri + React scaffold", () => {
    const report = validateProjectCompleteness(artifact, [...TAURI_REACT_REQUIRED_FILES, "README.md"]);

    expect(report.contract).toBe("tauri-react");
    expect(report.status).toBe("scaffold-ok");
    expect(report.missingFiles).toEqual([]);
  });

  it("marks a static landing fragment as partial for Tauri + React projects", () => {
    const report = validateProjectCompleteness(artifact, ["landing/index.html", "landing/style.css", "landing/script.js"]);

    expect(report.status).toBe("partial");
    expect(report.missingFiles).toContain("package.json");
    expect(report.warnings.join(" ")).toMatch(/landing fragment/i);
  });

  it("reports missing Tauri files for an incomplete fresh desktop scaffold", () => {
    // No package.json on disk yet → scaffolding from zero → full Tauri contract.
    const report = validateProjectCompleteness(artifact, ["index.html", "src/main.tsx", "src/App.tsx"]);

    expect(report.contract).toBe("tauri-react");
    expect(report.status).toBe("partial");
    expect(report.missingFiles).toContain("src-tauri/Cargo.toml");
  });

  it("uses the lighter front-end contract when refining an existing web project", () => {
    // Established front-end project (package.json, no Rust backend): refining it
    // must not require scaffolding a Tauri desktop skeleton.
    const report = validateProjectCompleteness(artifact, ["package.json", "index.html", "src/App.tsx", "src/styles.css"]);

    expect(report.contract).toBe("frontend");
    expect(report.status).toBe("scaffold-ok");
    expect(report.requiredFiles).not.toContain("src-tauri/Cargo.toml");
  });

  it("still requires the Tauri backend when src-tauri already exists", () => {
    const report = validateProjectCompleteness(artifact, ["package.json", "src-tauri/Cargo.toml"]);

    expect(report.contract).toBe("tauri-react");
    expect(report.status).toBe("partial");
    expect(report.missingFiles).toContain("src-tauri/src/main.rs");
  });

  it("stays partial while a required file is still a scaffold stub", () => {
    const report = validateProjectCompleteness(artifact, [...TAURI_REACT_REQUIRED_FILES], undefined, ["src/App.tsx"]);

    expect(report.status).toBe("partial");
    expect(report.missingFiles).toEqual([]);
    expect(report.stubFiles).toContain("src/App.tsx");
    expect(report.presentFiles).not.toContain("src/App.tsx");
    expect(report.warnings.join(" ")).toMatch(/stub/i);
  });

  it("becomes scaffold-ok once the stub file is implemented", () => {
    const report = validateProjectCompleteness(artifact, [...TAURI_REACT_REQUIRED_FILES], undefined, []);

    expect(report.status).toBe("scaffold-ok");
    expect(report.stubFiles).toEqual([]);
  });
});
