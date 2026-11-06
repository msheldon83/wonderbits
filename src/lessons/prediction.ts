/** Compare where the child put the flag with where the robot ends up. Pure. */
import type { Cell } from '../sim/types';
import type { Prediction } from './types';

export function predictionCorrect(prediction: Prediction, final: Cell): boolean {
  return prediction.cell.x === final.x && prediction.cell.y === final.y;
}
