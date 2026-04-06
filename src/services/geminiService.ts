import { GoogleGenAI, Type } from "@google/genai";
import { DecisionAnalysis, DecisionInputs, DecisionMode, Decision } from "../types";

// Lazy initialization to ensure process.env is available
let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing. Please set it in the Secrets panel.");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    recommendation: { type: Type.STRING, description: "The final recommended decision" },
    pros: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of pros" },
    cons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of cons" },
    riskLevel: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Risk level" },
    confidenceScore: { type: Type.NUMBER, description: "Confidence score from 0 to 100" },
    reasoning: { type: Type.STRING, description: "Detailed reasoning in markdown format" },
    actionPlan: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Step-by-step action plan" },
  },
  required: ["recommendation", "pros", "cons", "riskLevel", "confidenceScore", "reasoning", "actionPlan"],
};

export async function analyzeDecision(
  title: string,
  description: string,
  mode: DecisionMode,
  inputs: DecisionInputs
): Promise<DecisionAnalysis> {
  const ai = getAI();
  const modeInstructions = {
    analyst: "Be logical, data-driven, and objective. Focus on facts and probability.",
    money: "Focus entirely on financial gain, ROI, and economic efficiency.",
    life: "Prioritize happiness, mental health, lifestyle, and long-term fulfillment.",
    brutal: "Be brutally honest, harsh, and direct. Don't sugarcoat anything.",
  };

  const prompt = `
    Analyze the following decision request:
    Title: ${title}
    Description: ${description.trim() || "No additional context provided."}
    
    Additional Contextual Inputs:
    ${inputs.budget ? `- Budget: ${inputs.budget}` : "- Budget: Not specified"}
    ${inputs.timeline ? `- Timeline: ${inputs.timeline}` : "- Timeline: Not specified"}
    - Risk Tolerance: ${inputs.riskTolerance}%
    
    Mode: ${mode} (${modeInstructions[mode]})
    
    Provide a comprehensive analysis including a recommendation, pros/cons, risk level, confidence score, detailed reasoning, and an action plan.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    if (!response.text) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw new Error(error.message || "Failed to generate analysis. Check your API key and connection.");
  }
}

export async function compareOptions(
  optionA: string,
  optionB: string,
  context: string,
  mode: DecisionMode
): Promise<{ winner: string; comparison: string; reasoning: string }> {
  const ai = getAI();
  const prompt = `
    Compare two options for the following context:
    Context: ${context}
    Option A: ${optionA}
    Option B: ${optionB}
    
    Mode: ${mode}
    
    Determine the winner, provide a side-by-side comparison, and explain why the winner wins.
    Return JSON with fields: winner (string), comparison (string), reasoning (string).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            winner: { type: Type.STRING },
            comparison: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ["winner", "comparison", "reasoning"],
        },
      },
    });

    if (!response.text) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    return JSON.parse(response.text);
  } catch (error: any) {
    console.error("Gemini Comparison Error:", error);
    throw new Error(error.message || "Failed to compare options. Check your API key and connection.");
  }
}

export async function askFollowUp(
  question: string,
  decision: Decision,
  chatHistory: { role: 'user' | 'model'; parts: { text: string }[] }[]
): Promise<string> {
  const ai = getAI();
  const systemInstruction = `
    You are Decido AI, a decision intelligence assistant.
    The user is asking a follow-up question about a decision they just analyzed.
    
    Decision Context:
    Title: ${decision.title}
    Description: ${decision.description || "No description provided."}
    Mode: ${decision.mode}
    Recommendation: ${decision.analysis?.recommendation}
    Reasoning: ${decision.analysis?.reasoning}
    
    Answer the user's question concisely and helpfully based on this context.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: question }] }
      ],
      config: {
        systemInstruction,
      },
    });

    if (!response.text) {
      throw new Error("The AI returned an empty response.");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    throw new Error(error.message || "Failed to get a response. Please try again.");
  }
}
