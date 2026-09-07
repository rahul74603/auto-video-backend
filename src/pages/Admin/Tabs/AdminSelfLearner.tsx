import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';

export default function AdminSelfLearner() {
  const [learningData, setLearningData] = useState<any>({
    patterns: [],
    recommendations: [],
    experiments: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLearningData();
  }, []);

  async function loadLearningData() {
    try {
      // Load patterns
      const patternsSnap = await getDocs(collection(db, 'growth_insights'));
      const patterns = patternsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load recommendations
      const recommendationsSnap = await getDocs(collection(db, 'growth_recommendations'));
      const recommendations = recommendationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Load experiments
      const experimentsSnap = await getDocs(collection(db, 'growth_experiments'));
      const experiments = experimentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setLearningData({ patterns, recommendations, experiments });
    } catch (error) {
      console.error('Error loading learning data:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">🧠 Self-Learning System</h1>
        <button
          onClick={loadLearningData}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors"
        >
           Refresh Data
        </button>
      </div>

      {/* Patterns Discovered */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 mb-4"> Patterns Discovered</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : learningData.patterns.length === 0 ? (
          <p className="text-slate-500">No patterns discovered yet. Run the learner to find patterns.</p>
        ) : (
          <div className="space-y-3">
            {learningData.patterns.slice(0, 10).map((pattern: any) => (
              <div key={pattern.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-bold text-blue-900">{pattern.type || 'Pattern'}</p>
                <p className="text-sm text-blue-700 mt-1">{pattern.description || JSON.stringify(pattern)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Recommendations */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 mb-4">💡 AI Recommendations</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : learningData.recommendations.length === 0 ? (
          <p className="text-slate-500">No recommendations yet. The system will generate recommendations based on patterns.</p>
        ) : (
          <div className="space-y-3">
            {learningData.recommendations.slice(0, 10).map((rec: any) => (
              <div key={rec.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-bold text-green-900">{rec.type || 'Recommendation'}</p>
                <p className="text-sm text-green-700 mt-1">{rec.description || JSON.stringify(rec)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Experiments */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 mb-4">🧪 A/B Experiments</h2>
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : learningData.experiments.length === 0 ? (
          <p className="text-slate-500">No experiments running. Create experiments to test different strategies.</p>
        ) : (
          <div className="space-y-3">
            {learningData.experiments.slice(0, 10).map((exp: any) => (
              <div key={exp.id} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="font-bold text-purple-900">{exp.name || 'Experiment'}</p>
                <p className="text-sm text-purple-700 mt-1">{exp.description || JSON.stringify(exp)}</p>
                <div className="mt-2 flex gap-2">
                  <span className="text-xs bg-purple-200 px-2 py-1 rounded">Status: {exp.status || 'active'}</span>
                  <span className="text-xs bg-purple-200 px-2 py-1 rounded">Variant: {exp.variant || 'A'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
