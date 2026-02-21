// ─────────────────────────────────────────────────────────────────────────────
// generateHundreds.js — 3-digit Generator (Vertical Column Sync)
// Generates Hundreds, Tens, and Units columns independently using the exact
// same weighted rules, synchronized by direction (+ or -).
// ─────────────────────────────────────────────────────────────────────────────

const getValidMoves = (currentVal, requiredSign) => {
  const moves = [];
  const lowerBeads = currentVal % 5;
  const heavenBeadActive = currentVal >= 5;

  for (let n = -9; n <= 9; n++) {
    if (n === 0) continue; // Excludes 0 naturally
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
    if (Math.abs(n) >= 6) {
       candidatePool.push(n);
       candidatePool.push(n); // 3x weight for big numbers
    }
  });

  let move = 0;
  let found = false;
  let attempts = 0;
  while (!found && attempts < 8) {
    attempts++;
    const candidate = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    if (candidate !== -lastMove || validMoves.length === 1) {
       move = candidate;
       found = true;
    }
  }
  if (!found) move = candidatePool[Math.floor(Math.random() * candidatePool.length)];
  return move;
};

export function generateHundreds(numSets, rows, mode) {
  const sets = [];

  for (let s = 0; s < numSets; s++) {
    let retryCount = 0;
    let setGenerated = false;

    // Retry loop: syncing 3 columns is strict, so we retry if they get deadlocked
    while (!setGenerated && retryCount < 50) {
      retryCount++;
      let currentHundreds = 0;
      let currentTens = 0;
      let currentUnits = 0;
      const currentSet = [];
      let validSet = true;

      let lastMoveHundreds = 0;
      let lastMoveTens = 0;
      let lastMoveUnits = 0;

      for (let r = 0; r < rows; r++) {
        // 1. Check which directions are valid for ALL THREE columns simultaneously
        const canPlus = getValidMoves(currentHundreds, 1).length > 0 &&
                        getValidMoves(currentTens, 1).length > 0 &&
                        getValidMoves(currentUnits, 1).length > 0;

        const canMinus = getValidMoves(currentHundreds, -1).length > 0 &&
                         getValidMoves(currentTens, -1).length > 0 &&
                         getValidMoves(currentUnits, -1).length > 0;

        if (!canPlus && !canMinus) { validSet = false; break; }

        // 2. Decide the direction for this row
        let rowSign = 1;
        if (r === 0) {
          rowSign = 1; // First row must be positive
          if (!canPlus) { validSet = false; break; }
        } else {
          if (canPlus && canMinus) {
            rowSign = Math.random() < 0.5 ? 1 : -1;
          } else if (canMinus) {
            rowSign = -1;
          }
        }

        // 3. Get the valid moves locked to that direction
        const validHundredsMoves = getValidMoves(currentHundreds, rowSign);
        const validTensMoves = getValidMoves(currentTens, rowSign);
        const validUnitsMoves = getValidMoves(currentUnits, rowSign);

        // 4. Pick using the exact weighting
        const moveHundreds = pickWeightedMove(validHundredsMoves, lastMoveHundreds);
        const moveTens = pickWeightedMove(validTensMoves, lastMoveTens);
        const moveUnits = pickWeightedMove(validUnitsMoves, lastMoveUnits);

        // 5. Combine and apply
        const fullMove = (moveHundreds * 100) + (moveTens * 10) + moveUnits;

        currentSet.push(fullMove);
        currentHundreds += moveHundreds;
        currentTens += moveTens;
        currentUnits += moveUnits;

        lastMoveHundreds = moveHundreds;
        lastMoveTens = moveTens;
        lastMoveUnits = moveUnits;
      }

      if (validSet) {
         sets.push({ numbers: currentSet, answer: (currentHundreds * 100) + (currentTens * 10) + currentUnits });
         setGenerated = true;
      }
    }
  }
  return sets;
}
