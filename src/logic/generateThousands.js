// ─────────────────────────────────────────────────────────────────────────────
// generateThousands.js — 4-digit Generator (Vertical Column Sync)
// ─────────────────────────────────────────────────────────────────────────────
const getValidMoves = (currentVal, requiredSign) => {
  const moves = [];
  const lowerBeads = currentVal % 5;
  const heavenBeadActive = currentVal >= 5;
  for (let n = -9; n <= 9; n++) {
    if (n === 0) continue;
    if (requiredSign === 1 && n < 0) continue;
    if (requiredSign === -1 && n > 0) continue;
    const absN = Math.abs(n);
    const lowerN = absN % 5;
    const hasHeaven = absN >= 5;
    if (n > 0) {
      if (currentVal + n > 9) continue;
      if (hasHeaven && heavenBeadActive) continue;
      if (lowerBeads + lowerN > 4) continue;
      moves.push(n);
    } else {
      if (currentVal + n < 0) continue;
      if (hasHeaven && !heavenBeadActive) continue;
      if (lowerBeads - lowerN < 0) continue;
      moves.push(n);
    }
  }
  return moves;
};

const pickWeightedMove = (validMoves, lastMove) => {
  let candidatePool = [];
  validMoves.forEach(n => {
    candidatePool.push(n);
    if (Math.abs(n) >= 6) { candidatePool.push(n, n); }
  });
  let move = 0, found = false, attempts = 0;
  while (!found && attempts < 8) {
    attempts++;
    const candidate = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    if (candidate !== -lastMove || validMoves.length === 1) { move = candidate; found = true; }
  }
  if (!found) move = candidatePool[Math.floor(Math.random() * candidatePool.length)];
  return move;
};

export function generateThousands(numSets, rows, mode) {
  const sets = [];
  for (let s = 0; s < numSets; s++) {
    let retryCount = 0, setGenerated = false;
    while (!setGenerated && retryCount < 50) {
      retryCount++;
      let cThous = 0, cHund = 0, cTens = 0, cUnits = 0;
      const currentSet = [];
      let validSet = true;
      let lThous = 0, lHund = 0, lTens = 0, lUnits = 0;

      for (let r = 0; r < rows; r++) {
        const canPlus = getValidMoves(cThous, 1).length && getValidMoves(cHund, 1).length &&
                        getValidMoves(cTens, 1).length && getValidMoves(cUnits, 1).length;
        const canMinus = getValidMoves(cThous, -1).length && getValidMoves(cHund, -1).length &&
                         getValidMoves(cTens, -1).length && getValidMoves(cUnits, -1).length;

        if (!canPlus && !canMinus) { validSet = false; break; }

        let rowSign = 1;
        if (r === 0) {
          if (!canPlus) { validSet = false; break; }
        } else {
          if (canPlus && canMinus) rowSign = Math.random() < 0.5 ? 1 : -1;
          else if (canMinus) rowSign = -1;
        }

        const mThous = pickWeightedMove(getValidMoves(cThous, rowSign), lThous);
        const mHund = pickWeightedMove(getValidMoves(cHund, rowSign), lHund);
        const mTens = pickWeightedMove(getValidMoves(cTens, rowSign), lTens);
        const mUnits = pickWeightedMove(getValidMoves(cUnits, rowSign), lUnits);

        const fullMove = (mThous * 1000) + (mHund * 100) + (mTens * 10) + mUnits;
        currentSet.push(fullMove);
        cThous += mThous; cHund += mHund; cTens += mTens; cUnits += mUnits;
        lThous = mThous; lHund = mHund; lTens = mTens; lUnits = mUnits;
      }
      if (validSet) {
         sets.push({ numbers: currentSet, answer: (cThous * 1000) + (cHund * 100) + (cTens * 10) + cUnits });
         setGenerated = true;
      }
    }
  }
  return sets;
}
