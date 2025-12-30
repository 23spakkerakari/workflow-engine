export type BlockType =
  | "read_csv"
  | "lead_enrichment"
  | "filter"
  | "find_email"
  | "export_csv";

export interface BlockNode {
  id: string;
  type: BlockType;
  parameters: Record<string, any>;
  x: number;
  y: number;
}

export interface BlockEdge {
  id: string;
  from: string; // source node id
  to: string;   // target node id
}

export interface WorkflowDefinition {
  name: string;
  blocks: {
    type: BlockType;
    parameters: Record<string, any>;
  }[];
}

export interface Job {
  id: string;
  workflow_id: string;
  progress: number;
  error_message?: string | null;
  output_file?: string | null;
}