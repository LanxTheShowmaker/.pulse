import { logger } from "../core/logger.js";

// ─── Knowledge Base ───────────────────────────────────────────────
// Each category has weighted keywords, phrases, and patterns.
// Score is cumulative — higher = stronger match.

const CATEGORIES = {
    bug: {
        keywords: ["bug", "error", "crash", "broken", "not working", "glitch", "issue", "problem", "fail", "stuck", "freeze", "lag", "disconnect", "404", "500", "exception", "undefined", "null"],
        phrases: ["doesn't work", "can't connect", "won't load", "keeps crashing", "stopped working", "gives an error", "says invalid", "keeps failing", "black screen", "white screen"],
        patterns: [/not\s+(working|loading|connecting|responding)/i, /can'?t\s+(connect|login|join|access)/i, /keeps?\s+(crashing|freezing|disconnecting|failing)/i],
        weight: 1.0,
    },
    billing: {
        keywords: ["charge", "payment", "refund", "money", "subscription", "premium", "buy", "purchase", "invoice", "billing", "card", "paypal", "cancel", "renew", "price", "cost", "fee"],
        phrases: ["charged twice", "double charge", "didn't receive", "want a refund", "cancel my", "overcharged", "payment failed", "can't pay", "wrong amount", "money taken"],
        patterns: [/charg(e|ed|ing)\s+(twice|double|extra)/i, /refund\s+(my|the|for)/i, /cancel\s+(my|the)\s+(subscription|premium|membership)/i, /paid\s+(but|and|yet)\s+(not|didn't|hasn't)/i],
        weight: 1.0,
    },
    account: {
        keywords: ["account", "login", "password", "email", "verify", "2fa", "mfa", "banned", "suspended", "locked", "access", "recover", "reset", "username", "token", "auth"],
        phrases: ["can't login", "forgot password", "locked out", "lost access", "account banned", "verify email", "change email", "reset password", "two factor", "authenticator"],
        patterns: [/can'?t\s+(login|sign\s?in|access)/i, /lost\s+(access|my\s+account)/i, /forgot\s+(my\s+)?password/i, /account\s+(banned|locked|suspended)/i, /reset\s+(my\s+)?password/i],
        weight: 1.0,
    },
    general: {
        keywords: ["help", "question", "how", "what", "where", "when", "can I", "possible", "feature", "request", "suggest", "idea", "info", "details", "explain"],
        phrases: ["how do I", "how to", "can someone", "is it possible", "does it support", "what is", "where can I", "when will", "I have a question", "need help with"],
        patterns: [/^(how|what|where|when|can|does|is)\s/i, /how\s+(do|can|to)/i, /is\s+there\s+a/i, /can\s+I\s+(get|have|use|do)/i],
        weight: 0.8,
    },
    abuse: {
        keywords: ["harass", "abuse", "threat", "nsfw", "inappropriate", "offensive", "hate", "racist", "spam", "scam", "phishing", "exploit", "hack", "cheat", "grief"],
        phrases: ["someone is", "being harassed", "inappropriate content", "sending threats", "hate speech", "death threats", "doxxing", "sharing links", "nsfw in", "griefing me"],
        patterns: [/someone\s+(is|was)\s+(harassing|threatening|spamming)/i, /(harass|threat|abuse|grief)(ing|ed|ment)/i, /nsfw\s+in\s+#/i],
        weight: 1.2,
    },
    feedback: {
        keywords: ["love", "great", "awesome", "amazing", "terrible", "hate", "worst", "suggestion", "improve", "feedback", "review", "rate", "opinion", "thoughts"],
        phrases: ["just wanted to say", "great job", "love this", "this is amazing", "could be better", "needs improvement", "you should add", "I think", "in my opinion"],
        patterns: [/^(just\s+)?(wanted|thought)\s+to\s+(say|share|tell)/i, /(great|awesome|amazing|terrible|worst)\s+(bot|server|service|feature)/i],
        weight: 0.6,
    },
};

// ─── Sentiment Lexicon ────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
    "good", "great", "awesome", "amazing", "love", "excellent", "perfect", "fantastic", "wonderful", "best",
    "happy", "thanks", "thank", "helpful", "nice", "cool", "beautiful", "fast", "easy", "smooth",
    "recommend", "appreciate", "glad", "pleased", "satisfied", "enjoy", "fun", "solid", "reliable",
]);

const NEGATIVE_WORDS = new Set([
    "bad", "terrible", "awful", "hate", "worst", "horrible", "ugly", "slow", "broken", "useless",
    "angry", "frustrated", "annoyed", "disappointed", "sad", "unhappy", "poor", "fail", "failure",
    "scam", "ripoff", "waste", "trash", "garbage", "dump", "pathetic", "disgusting", "furious",
]);

const INTENSIFIERS = new Set([
    "very", "extremely", "incredibly", "absolutely", "totally", "completely", "really", "so", "super",
    "utterly", "deeply", "highly", "seriously", "legit", "literally",
]);

const NEGATORS = new Set([
    "not", "no", "never", "neither", "nobody", "nothing", "nowhere", "nor", "cannot", "can't",
    "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "barely", "hardly",
]);

// ─── Urgency Patterns ─────────────────────────────────────────────

const URGENCY = {
    critical: {
        keywords: ["urgent", "emergency", "asap", "immediately", "critical", "danger", "emergency", "help me now", "life", "death"],
        phrases: ["need help immediately", "this is urgent", "emergency situation", "someone is in danger", "life threatening"],
        patterns: [/asap/i, /right\s+now/i, /immediately/i, /emergency/i, /urgent/i],
    },
    high: {
        keywords: ["important", "serious", "major", "critical", "severe", "banned", "hacked", "stolen", "lost", "money"],
        phrases: ["lost my account", "money stolen", "banned unfairly", "hacked account", "need this fixed"],
        patterns: [/lost\s+my\s+(account|money|data)/i, /(hacked|stolen|banned)/i, /money\s+(lost|stolen|gone)/i],
    },
    medium: {
        keywords: ["problem", "issue", "error", "broken", "not working", "can't"],
        phrases: ["not working", "having trouble", "need assistance", "can't figure out"],
        patterns: [/not\s+working/i, /having\s+(trouble|issues|problems)/i, /can'?t\s+(figure|fix|solve)/i],
    },
    low: {
        keywords: ["question", "wondering", "curious", "suggestion", "idea", "feedback", "thoughts"],
        phrases: ["just curious", "wondering if", "any plans for", "would be nice"],
        patterns: [/just\s+(curious|wondering)/i, /would\s+be\s+nice/i, /any\s+plans/i],
    },
};

// ─── Response Templates ───────────────────────────────────────────

const RESPONSES = {
    bug: {
        high: "We've identified this as a technical issue. A developer will look into this. In the meantime, could you share your device/browser info and any error messages?",
        medium: "Thanks for reporting this. Could you provide more details: steps to reproduce, device info, and any screenshots?",
        low: "Thanks for letting us know. We'll investigate this. Any extra details would help!",
    },
    billing: {
        high: "We see this is billing-related. We'll prioritize this. Please have your payment email or transaction ID ready.",
        medium: "Thanks for reaching out about billing. Could you share your transaction ID or the email used for payment?",
        low: "Got it, we'll look into your billing question. Any receipt or order number would speed things up.",
    },
    account: {
        high: "Account issues are priority. We'll help you regain access. Please don't share your password — we'll never ask for it.",
        medium: "Let's get your account sorted. Could you tell us more about the issue?",
        low: "Sure, we can help with that. What specifically do you need?",
    },
    general: {
        high: "We're on it. Let us know more details so we can help faster.",
        medium: "Great question! Let us look into that for you.",
        low: "Happy to help! Here's what we know...",
    },
    abuse: {
        high: "This is being treated seriously. We'll investigate immediately. Please save any evidence you have.",
        medium: "We take this seriously. Please provide any screenshots or details about what happened.",
        low: "Thanks for reporting. We'll review this.",
    },
    feedback: {
        high: "Thanks for the passionate feedback! We really value your input.",
        medium: "Thanks for sharing your thoughts! We'll pass this along.",
        low: "Appreciate the feedback!",
    },
};

// ─── Core Engine ──────────────────────────────────────────────────

export class TriageEngine {
    constructor() {
        this.stats = new Map(); // per-guild stats
    }

    analyze(text, context = {}) {
        if (!text || typeof text !== "string") {
            return { category: "general", sentiment: 0, urgency: "low", confidence: 0, suggestions: [] };
        }

        const normalized = text.toLowerCase().trim();
        const words = normalized.split(/\s+/);

        // 1. Category detection
        const categoryResult = this.detectCategory(normalized, words);

        // 2. Sentiment analysis
        const sentiment = this.analyzeSentiment(words);

        // 3. Urgency detection
        const urgency = this.detectUrgency(normalized, words);

        // 4. Generate response suggestions
        const suggestions = this.generateSuggestions(categoryResult.category, urgency, sentiment, context);

        // 5. Confidence score
        const confidence = Math.min(categoryResult.score / 3, 1);

        return {
            category: categoryResult.category,
            subcategories: categoryResult.subcategories,
            sentiment,
            urgency,
            confidence,
            suggestions,
            keywords: categoryResult.matchedKeywords,
        };
    }

    detectCategory(text, words) {
        const scores = {};

        for (const [cat, config] of Object.entries(CATEGORIES)) {
            let score = 0;
            const matched = [];

            // Keyword matching
            for (const kw of config.keywords) {
                if (text.includes(kw)) {
                    score += 1;
                    matched.push(kw);
                }
            }

            // Phrase matching (worth more)
            for (const phrase of config.phrases) {
                if (text.includes(phrase)) {
                    score += 2;
                    matched.push(phrase);
                }
            }

            // Regex pattern matching (worth most)
            for (const pattern of config.patterns) {
                if (pattern.test(text)) {
                    score += 3;
                    matched.push(pattern.source);
                }
            }

            scores[cat] = { score: score * config.weight, matched };
        }

        // Find top category
        let topCategory = "general";
        let topScore = 0;
        let secondCategory = "general";
        let secondScore = 0;

        for (const [cat, result] of Object.entries(scores)) {
            if (result.score > topScore) {
                secondCategory = topCategory;
                secondScore = topScore;
                topCategory = cat;
                topScore = result.score;
            } else if (result.score > secondScore) {
                secondCategory = cat;
                secondScore = result.score;
            }
        }

        const subcategories = secondScore > 0 ? [topCategory, secondCategory] : [topCategory];

        return {
            category: topCategory,
            subcategories,
            score: topScore,
            matchedKeywords: scores[topCategory].matched,
        };
    }

    analyzeSentiment(words) {
        let score = 0;
        let negated = false;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            if (NEGATORS.has(word)) {
                negated = true;
                continue;
            }

            if (INTENSIFIERS.has(word)) {
                // Intensifier applies 1.5x to next word
                if (i + 1 < words.length) {
                    if (POSITIVE_WORDS.has(words[i + 1])) score += 1.5;
                    if (NEGATIVE_WORDS.has(words[i + 1])) score -= 1.5;
                }
                continue;
            }

            if (POSITIVE_WORDS.has(word)) {
                score += negated ? -1 : 1;
                negated = false;
            } else if (NEGATIVE_WORDS.has(word)) {
                score += negated ? 1 : -1;
                negated = false;
            } else {
                negated = false;
            }
        }

        // Clamp to -1 to 1
        return Math.max(-1, Math.min(1, score / Math.max(words.length / 3, 1)));
    }

    detectUrgency(text, words) {
        for (const [level, config] of Object.entries(URGENCY)) {
            // Keywords
            for (const kw of config.keywords) {
                if (text.includes(kw)) return level;
            }
            // Phrases
            for (const phrase of config.phrases) {
                if (text.includes(phrase)) return level;
            }
            // Patterns
            for (const pattern of config.patterns) {
                if (pattern.test(text)) return level;
            }
        }
        return "low";
    }

    generateSuggestions(category, urgency, sentiment, context) {
        const suggestions = [];

        // Response template
        const tier = urgency === "critical" || urgency === "high" ? "high" : urgency === "medium" ? "medium" : "low";
        const template = RESPONSES[category]?.[tier] || RESPONSES.general[tier];
        if (template) suggestions.push({ type: "response", text: template });

        // If negative sentiment, suggest empathetic opener
        if (sentiment < -0.3) {
            suggestions.push({ type: "tone", text: "User seems frustrated — start with empathy and acknowledge their issue." });
        }

        // If positive sentiment, match energy
        if (sentiment > 0.5) {
            suggestions.push({ type: "tone", text: "User is positive — keep the energy up, be friendly." });
        }

        // Urgency-based suggestions
        if (urgency === "critical" || urgency === "high") {
            suggestions.push({ type: "action", text: "Mark as high priority and escalate if needed." });
        }

        // Category-specific suggestions
        if (category === "bug") {
            suggestions.push({ type: "info", text: "Ask for: device, browser, OS, steps to reproduce, screenshots." });
        }
        if (category === "billing") {
            suggestions.push({ type: "info", text: "Ask for: transaction ID, email used, date of purchase." });
        }
        if (category === "account") {
            suggestions.push({ type: "info", text: "Ask for: account email, when issue started. Never ask for password." });
        }

        return suggestions;
    }

    // ─── Stats ────────────────────────────────────────────────────

    recordGuildStats(guildId, category, urgency) {
        const key = guildId;
        if (!this.stats.has(key)) {
            this.stats.set(key, { categories: {}, urgencies: {}, total: 0 });
        }
        const s = this.stats.get(key);
        s.categories[category] = (s.categories[category] || 0) + 1;
        s.urgencies[urgency] = (s.urgencies[urgency] || 0) + 1;
        s.total++;
    }

    getGuildStats(guildId) {
        return this.stats.get(guildId) || { categories: {}, urgencies: {}, total: 0 };
    }
}

export const triage = new TriageEngine();
