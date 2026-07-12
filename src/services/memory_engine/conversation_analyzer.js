/**
 * Conversation Analyzer Service
 * Extracts growth signals, entity topics (threads), goals, preferences,
 * and key relationship facts from user/assistant chat messages.
 */

import { queryGemini } from '../groq.js';
import { GROWTH_SIGNALS } from '../growth_signals.js';

export async function analyzeConversationTurn(db, userMessage, aiResponse, queryGeminiFn = queryGemini) {
  const profile = db.profile || {};
  const currentChapter = profile.current_chapter || "Stable Routine";
  
  const prompt = `
You are AUM's Behavioral and Cognitive Analytics Engine.
Analyze the following conversation turn between the user and their AI companion, Aarav.

Allowed Growth Signals (choose ONLY if explicitly shown in the message):
- showed_courage: Difficult conversations, facing fears, trying new hard things.
- asked_for_help: Reaching out to others for assistance, vulnerability.
- quitting_toxic_habit: Resisting/stopping unhealthy habits.
- public_speaking: Speaking in front of others or publishing.
- set_boundaries: Saying no to work/people, protecting space.
- handled_conflict: Dealing with interpersonal friction calmly.
- didnt_spiral: Not failing catastrophically after a setback.
- took_rest: Resting instead of burning out, protecting sleep/buffers.
- managed_emotions / emotional_regulation: Regulating mood or stress.
- learned_skill / read_book / understood_concept: Gaining knowledge or skills.
- helped_someone / mentored_colleague / cooked_for_family / practiced_gratitude / showed_empathy: Prosocial contribution or connection.
- self_reflection / self_awareness / planned_ahead / created_something / took_initiative: Inner awareness, proactiveness.
- curiosity_exploration: Active exploration of new areas.

Negative Signals:
- avoidance: Procrastinating, escaping tasks, hiding from friction.
- catastrophizing: Imagining worst case scenarios unchecked.
- rumination: Constantly chewing over past mistakes or stress.
- emotional_eating: Eating due to stress or exhaustion.
- doomscrolling: Bingeing social media, late night scrolling.
- isolation: Shutting down, avoiding relationships or family.
- self_criticism: Harsh negative self-talk.

Thread Entity Detection:
Extract 1-2 major ongoing challenges, goals, or life contexts mentioned (e.g. "Work conflict", "Sleep routines", "Fat Loss").
Determine if the user's message indicates they have resolved or finished a topic.

Fact & Layer Extraction:
Extract any explicit facts or updates about:
1. Identity (e.g., hometown, marital status, kids, job)
2. Goals (e.g., weight loss targets, career goals)
3. Projects (e.g., side project name, status)
4. Preferences (e.g., short replies, morning workouts, vegetarian)
5. Relationships (e.g., friends, colleagues, family)
6. Relationship History: Specific interpersonal incidents, conversations, emotional details, fights, or stories shared about relationship entities (e.g. Kriti, Vishi, teammate).
7. Life Experiences: Specific activities, events, or moments the user went through (e.g. went for a run, went to the park, watched a movie, witnessed first rainfall, child took first steps). Classify each into one of these 12 categories: Exercise, Learning, Recovery, Entertainment, Travel, Nature, Food, Relationships, Work, Parenting, Spiritual, Creation, Adventure.

Current Turn:
User: "${userMessage}"
Aarav: "${aiResponse}"

Respond strictly with a JSON object formatted as:
{
  "signals": ["signal_id_1"],
  "reason": "Detailed, concise reason explaining the growth signal extraction.",
  "confidence": 0.0 to 1.0,
  "extracted_entities": ["Topic Name"],
  "resolve_intent": ["Topic Name to Close"],
  "invisible_momentum_triggered": true/false,
  "invisible_momentum_message": "I noticed something important today...",
  "extracted_facts": {
    "identity": {},
    "goals": [],
    "projects": [],
    "preferences": [],
    "relationships": [],
    "relationship_history": [
      {
        "name": "Kriti",
        "type": "personal", // personal, work, social
        "emotion": "happy", // emotion shown in conversation
        "importance": 7, // 1 to 10 scale representing importance
        "summary": "Had a nice dinner date at Olive, discussed weekend plans.",
        "thread": "Family Quality Time"
      }
    ],
    "life_experiences": [
      {
        "type": "Exercise", // Must be one of the 12 categories listed above
        "activity": "5K Run",
        "location": "Aravali Biodiversity Park", // Keep empty string if not mentioned
        "people": [], // List of names of people present, if mentioned
        "emotion_after": "happy", // happy, stressed, tired, content, etc.
        "importance": 5, // 1 to 10 scale representing importance
        "summary": "Completed a 5k run in the morning feeling high energy."
      }
    ]
  }
}
`;

  try {
    const analysis = await queryGeminiFn(prompt, true);
    return analysis;
  } catch (error) {
    console.error("Memory engine conversation analysis failed:", error);
    return {
      signals: [],
      reason: "Analysis failed",
      confidence: 0,
      extracted_entities: [],
      resolve_intent: [],
      invisible_momentum_triggered: false,
      extracted_facts: {
        identity: {},
        goals: [],
        projects: [],
        preferences: [],
        relationships: [],
        relationship_history: [],
        life_experiences: []
      }
    };
  }
}
