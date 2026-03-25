/**
 * Persona type definitions for CPO agent personas.
 * Each persona encodes a product thesis, decision-making heuristics,
 * and strategic priorities that can drive agent behavior.
 */

export interface ProductThesis {
  /** One-line north star */
  vision: string;
  /** Core beliefs that guide every product decision */
  beliefs: string[];
  /** What this CPO would never compromise on */
  nonNegotiables: string[];
}

export interface DecisionHeuristic {
  /** Name of the heuristic */
  name: string;
  /** When to apply it */
  when: string;
  /** The rule itself */
  rule: string;
}

export interface StrategicPriority {
  area: string;
  stance: string;
}

export interface CPOPersona {
  id: string;
  name: string;
  title: string;
  org: string;
  /** Short bio framing the persona's perspective */
  bio: string;
  thesis: ProductThesis;
  heuristics: DecisionHeuristic[];
  priorities: StrategicPriority[];
  /** How this persona would evaluate a feature proposal */
  evaluationPrompt: string;
  /** Phrases this persona would naturally use */
  voice: string[];
}
