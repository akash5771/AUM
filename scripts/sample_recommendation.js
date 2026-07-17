// scripts/sample_recommendation.js
const path = require('path');
const { getRecommendedInterventions } = require('../src/services/recommendations');

// Build a minimal mock DB matching what recommendations expect
const mockDb = {
  profile: {
    name: 'Akash',
    city: 'Gurgaon',
    core_values: ['Family', 'Health'],
    financial_stance: 'balanced',
    momentum_score: 60,
    momentum_stage: 'Stage 2: Consistency',
    readiness_score: 7,
    completion_rate: 80,
    active_goal: { subGoal: 'Sleep Better' },
    life_timeline: []
  },
  context: {
    sleep: { hours: 7, quality: 'good' },
    mood: { rating: 6 },
    energies: { mental: 6, physical: 6, social: 5, creative: 5 },
    environmental: { weather: 'Clear', world: { aqi: 80 } },
    temporal: { timestamp: new Date().toISOString() }
  },
  actions: [],
  backups: [],
  history: []
};

(async () => {
  const result = getRecommendedInterventions(mockDb.profile, mockDb.context, [], mockDb);
  console.log('--- Sample Recommendation Output ---');
  console.log('Readiness Score:', result.readiness_score);
  console.log('Momentum Stage:', result.momentum_stage);
  console.log('Confidence Score:', result.confidence_score);
  console.log('Recommended Actions (', result.actions.length, '):');
  result.actions.forEach((a, i) => {
    console.log(`${i + 1}. ${a.text} [${a.category}] (Why: ${a.whyToday})`);
  });
  console.log('Backups:', result.backups.map(b => b.text));
})();
