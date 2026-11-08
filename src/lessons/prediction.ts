/** Compare what the child predicted with how the run really ends. Pure. */
import type { Cell, SimState } from '../sim/types';
import { memoryValue } from './memory';
import type { MemoryField, Prediction, PredictionSettings } from './types';

export function predictionCorrect(prediction: Prediction, final: Cell): boolean {
  return prediction.cell !== undefined && prediction.cell.x === final.x && prediction.cell.y === final.y;
}

/** Every asked part has an answer, so Run can play. */
export function predictionComplete(prediction: Prediction | null, settings: PredictionSettings): boolean {
  if (!prediction) return false;
  if (settings.askTile && !prediction.cell) return false;
  return (settings.askMemory ?? []).every((f) => prediction.memory?.[f] !== undefined);
}

export interface PredictionCheck {
  /** Null when the level does not ask for the tile. */
  tileRight: boolean | null;
  /** Asked memory fields the child got wrong, in the order asked. */
  wrongFields: MemoryField[];
  correct: boolean;
}

export function checkPrediction(prediction: Prediction, settings: PredictionSettings, final: SimState): PredictionCheck {
  const tileRight = settings.askTile ? predictionCorrect(prediction, final.robot) : null;
  const wrongFields = (settings.askMemory ?? []).filter((f) => prediction.memory?.[f] !== memoryValue(final, f));
  return { tileRight, wrongFields, correct: tileRight !== false && wrongFields.length === 0 };
}
