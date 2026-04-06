export type DecisionMode = 'analyst' | 'money' | 'life' | 'brutal';

export interface DecisionInputs {
  budget?: string;
  timeline?: string;
  priorities?: string[];
  riskTolerance?: number;
}

export interface DecisionAnalysis {
  recommendation: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  confidenceScore: number;
  reasoning: string;
  actionPlan: string[];
}

export interface Decision {
  id?: string;
  uid: string;
  title: string;
  description?: string;
  mode: DecisionMode;
  inputs?: DecisionInputs;
  analysis?: DecisionAnalysis;
  createdAt: any; // Firestore Timestamp
  isHelpful?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  subscription: 'free' | 'pro';
  dailyUsageCount: number;
  lastUsageDate: string; // YYYY-MM-DD
  totalDecisionsCount?: number;
}
