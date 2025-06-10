export interface NodeData {
	id: string;
	in: number;
	out: number;
}

export interface EdgeData {
	source: string;
	target: string;
}

export interface GraphNode {
	data: NodeData;
}

export interface GraphEdge {
	data: EdgeData;
}

export type GraphElement = GraphNode | GraphEdge;
