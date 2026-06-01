import ForceGraph2D from "react-force-graph-2d";
import nodesData from "../data/telescope_nsclc_nodes.json";
import edgesData from "../data/telescope_nsclc_edges.json";

export default function Telescope() {
  const graphData = {
    nodes: nodesData,
    links: edgesData
      .filter((e) => e.weight >= 3)
      .map((e) => ({ source: e.source, target: e.target, value: e.weight })),
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0A0A0F" }}>
      <ForceGraph2D
        graphData={graphData}
        width={window.innerWidth}
        height={window.innerHeight}
        linkColor={() => "#888"}
        linkWidth={(link) => Math.min(Math.sqrt(link.value || 1) * 0.3, 1.2)}
        linkOpacity={0.3}
      />
    </div>
  );
}
