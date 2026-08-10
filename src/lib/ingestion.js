import { supabase, isSupabaseConfigured } from './supabase';

const DEMO_INGEST_KEY = 'axon_demo_ingest_state';

const MOCK_DATA = {
  linear: {
    nodes: [
      { id: 'l1', title: 'Bug: Checkout flow crashing on iOS', type: 'goal', content: 'Users report that clicking the complete order button in Safari on iOS 17 causes the page to freeze. Need to investigate the Stripe element rendering.' },
      { id: 'l2', title: 'Task: Implement WebGL Fallback', type: 'goal', content: 'Some older devices struggle with the Three.js scene. Add a graceful fallback to a 2D canvas if WebGL2 is not supported.' }
    ]
  },
  github: {
    nodes: [
      { id: 'g1', title: 'Pattern: Error Handling (Go/Rust style)', type: 'technical', content: 'We prefer returning explicit [error, data] tuples rather than throwing exceptions. This makes control flow predictable and avoids hidden try-catch blocks.' },
      { id: 'g2', title: 'Refactor: Auth Context Provider', type: 'technical', content: 'Moved the Supabase session management out of App.jsx into a dedicated AuthContext.jsx to prevent unnecessary re-renders of the 3D scene.' }
    ]
  },
  anthropic: {
    nodes: [
      { id: 'a1', title: 'Architecture decision: Event-driven vs REST', type: 'conversation', content: 'Discussed with Claude about the backend architecture. Decided to go with a real-time event-driven approach (WebSockets/Supabase Realtime) rather than standard REST polling to keep the UI snappy.' },
      { id: 'a2', title: 'Brainstorm: 3D Visualization concepts', type: 'conversation', content: 'Explored different ways to visualize high-dimensional memory embeddings in 3D space. Settled on a forced-directed graph layout with spring physics.' }
    ]
  },
  openai: {
    nodes: [
      { id: 'o1', title: 'Drafting Marketing Copy', type: 'conversation', content: 'Generated initial copy for the landing page: "Picture opening Cursor on a Monday...". Tuned the voice to be punchy and developer-focused.' }
    ]
  },
  notion: {
    nodes: [
      { id: 'n1', title: 'Product Spec: AXON V1', type: 'document', content: 'V1 will focus on local-first simulation with optional Supabase sync. Key features: 3D Memory Graph, AI Adapters, and Data Sources.' }
    ]
  },
  slack: {
    nodes: [
      { id: 's1', title: 'Discussion: Pricing strategy', type: 'conversation', content: 'In #general, the team agreed to launch with a $15/mo Pro tier via Stripe, locking in early adopters with a lifetime discount.' }
    ]
  },
  gmail: {
    nodes: [
      { id: 'gm1', title: 'Investor Update - Q3', type: 'document', content: 'Sent to stakeholders: AXON engagement is up 40% week over week. Users are loving the 3D memory graph visualization.' }
    ]
  }
};

const MOCK_EDGES = [
  // Link Claude's architecture decision to GitHub's Auth refactor
  { source: 'a1', target: 'g2', relationship: 'implemented_in' },
  // Link Claude's architecture decision to Linear's WebGL fallback task
  { source: 'a1', target: 'l2', relationship: 'impacts' },
  // Link GitHub's error handling to Linear's iOS crash bug
  { source: 'g1', target: 'l1', relationship: 'relevant_to' },
  // Link Notion spec to OpenAI marketing copy
  { source: 'n1', target: 'o1', relationship: 'referenced_by' },
  // Link Notion spec to Claude 3D visualization
  { source: 'n1', target: 'a2', relationship: 'defines' }
];

export async function ingestSimulatedData(user, sourceId, isDemo) {
  const data = MOCK_DATA[sourceId];
  if (!data) return 0; // No mock data for this source

  // Load existing ingested state so we can create edges correctly
  const ingestState = JSON.parse(localStorage.getItem(DEMO_INGEST_KEY) || '{}');
  
  const createdNodes = {}; // map mock id -> real id
  let count = 0;

  for (const node of data.nodes) {
    if (ingestState[node.id]) continue; // Already ingested
    
    let realId;
    if (isSupabaseConfigured && !isDemo && user) {
      const { data: inserted, error } = await supabase.from('memory_nodes').insert({
        user_id: user.id,
        title: node.title,
        content: node.content,
        type: node.type,
        source_id: sourceId,
        metadata: { simulated: true, original_mock_id: node.id }
      }).select().single();
      
      if (!error && inserted) {
        realId = inserted.id;
        count++;
      }
    } else {
      // Local demo mode
      realId = 'mock_' + node.id;
      count++;
    }
    
    if (realId) {
      ingestState[node.id] = realId;
    }
  }

  // Check if we can create any edges
  if (isSupabaseConfigured && !isDemo && user) {
    for (const edge of MOCK_EDGES) {
      const sourceRealId = ingestState[edge.source];
      const targetRealId = ingestState[edge.target];
      
      if (sourceRealId && targetRealId) {
        // Check if edge already exists
        const { data: existing } = await supabase.from('memory_edges')
          .select('id')
          .eq('source_node_id', sourceRealId)
          .eq('target_node_id', targetRealId)
          .maybeSingle();
          
        if (!existing) {
          await supabase.from('memory_edges').insert({
            user_id: user.id,
            source_node_id: sourceRealId,
            target_node_id: targetRealId,
            relationship: edge.relationship
          });
        }
      }
    }
  }

  localStorage.setItem(DEMO_INGEST_KEY, JSON.stringify(ingestState));
  return count;
}
