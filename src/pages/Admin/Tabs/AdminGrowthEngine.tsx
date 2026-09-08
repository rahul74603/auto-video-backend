import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';

const GROWTH_MODULES = [
  { name: 'AI Visual Engine', file: 'ai_visual_engine.js', desc: 'Auto-generates visuals for videos' },
  { name: 'Analytics Collector', file: 'analytics/collector.js', desc: 'Collects metrics from platforms' },
  { name: 'Analytics Learner', file: 'analytics/learner.js', desc: 'Discovers patterns from data' },
  { name: 'Analytics Scorer', file: 'analytics/scorer.js', desc: 'Scores content performance' },
  { name: 'Breaking Mode', file: 'breaking_mode.js', desc: 'Handles breaking news content' },
  { name: 'Comment Intelligence', file: 'comment_intelligence.js', desc: 'Analyzes viewer comments' },
  { name: 'Content Angle Engine', file: 'content_angle_engine.js', desc: 'Finds best content angles' },
  { name: 'Content Fingerprint', file: 'content_fingerprint.js', desc: 'Detects duplicate content' },
  { name: 'Content Mutation', file: 'content_mutation.js', desc: 'Variations of content' },
  { name: 'Cost Control Engine', file: 'cost_control_engine.js', desc: 'Controls video generation costs' },
  { name: 'CTA Engine', file: 'cta_engine.js', desc: 'Optimizes call-to-action' },
  { name: 'Deadline Engine', file: 'deadline_engine.js', desc: 'Tracks job deadlines' },
  { name: 'FAQ Engine', file: 'faq_engine.js', desc: 'Generates FAQs from content' },
  { name: 'Hook Engine', file: 'hook_engine.js', desc: 'Creates engaging hooks' },
  { name: 'Layout Engine', file: 'layout_engine.js', desc: 'Video layout optimization' },
  { name: 'Motion Engine', file: 'motion_engine.js', desc: 'Motion graphics engine' },
  { name: 'Music Engine', file: 'music_engine.js', desc: 'Background music selection' },
  { name: 'Opportunity Engine', file: 'opportunity_engine.js', desc: 'Finds content opportunities' },
  { name: 'Orchestrator', file: 'orchestrator.js', desc: 'Main growth engine coordinator' },
  { name: 'Quality Gate', file: 'quality_gate.js', desc: 'Quality control checks' },
  { name: 'Reach Predictor', file: 'reach_predictor.js', desc: 'Predicts content reach' },
  { name: 'Recommendation Engine', file: 'recommendation_engine.js', desc: 'Content recommendations' },
  { name: 'Retention Engine', file: 'retention_engine.js', desc: 'Viewer retention optimization' },
  { name: 'Script Engine', file: 'script_engine.js', desc: 'Video script generation' },
  { name: 'Trend Detector', file: 'trend_detector.js', desc: 'Detects trending topics' },
];

export default function AdminGrowthEngine() {
  const [insights, setInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    try {
      const snapshot = await getDocs(collection(db, 'growth_insights'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInsights(data);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">🚀 Growth Engine</h1>
        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">
          {GROWTH_MODULES.length} Modules Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROWTH_MODULES.map((module, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="font-black text-slate-900 mb-2">{module.name}</h3>
            <p className="text-sm text-slate-600 mb-3">{module.desc}</p>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded">{module.file}</code>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-black text-slate-900 mb-4">📊 Growth Insights</h2>
        {loading ? (
          <p className="text-slate-500">Loading insights...</p>
        ) : insights.length === 0 ? (
          <p className="text-slate-500">No insights yet. Run the growth learner to generate insights.</p>
        ) : (
          <div className="space-y-3">
            {insights.slice(0, 10).map((insight: any) => (
              <div key={insight.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="font-bold text-slate-900">{insight.type || 'Insight'}</p>
                <p className="text-sm text-slate-600 mt-1">{insight.description || JSON.stringify(insight)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
