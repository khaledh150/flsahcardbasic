// ─────────────────────────────────────────────────────────────────────────────
// generateUnits.js — 1-digit Generator (Weighted + Anti-Repetition)
// 1. Prioritizes 6, 7, 8, 9 (3x chance).
// 2. Prevents "Ping Pong" (e.g. +7 then immediately -7).
// ─────────────────────────────────────────────────────────────────────────────

const getValidMoves = (currentVal) => {
  const moves = [];
  const lowerBeads = currentVal % 5;
  const heavenBeadActive = currentVal >= 5;
  
  for (let n = -9; n <= 9; n++) {
    if (n === 0) continue;
    const absN = Math.abs(n);
    const lowerN = absN % 5;
    const hasHeaven = absN >= 5;

    // Direct Move Rules
    if (n > 0) { // Addition
      if (currentVal + n > 9) continue;
      if (hasHeaven && heavenBeadActive) continue;
      if (lowerBeads + lowerN > 4) continue;
      moves.push(n);
    } else { // Subtraction
      if (currentVal + n < 0) continue;
      if (hasHeaven && !heavenBeadActive) continue;
      if (lowerBeads - lowerN < 0) continue;
      moves.push(n);
    }
  }
  return moves;
};

export function generateUnits(numSets, rows, mode) {
  const sets = [];

  for (let s = 0; s < numSets; s++) {
    let currentVal = 0;
    const currentSet = [];
    let validSet = true;
    let lastMove = 0; // Track the previous move to avoid immediate reversal

    for (let r = 0; r < rows; r++) {
      let validMoves = getValidMoves(currentVal);

      if (validMoves.length === 0) { validSet = false; break; }

      // 1. Filter Logic
      let availableNumbers = [];
      if (r === 0) {
        availableNumbers = validMoves.filter(n => n > 0);
        if (availableNumbers.length === 0) { validSet = false; break; }
      } else {
        availableNumbers = validMoves;
      }

      // 2. Build Weighted Pool
      let candidatePool = [];
      availableNumbers.forEach(n => {
        candidatePool.push(n);
        // Weight "Big Numbers" (6,7,8,9) heavier (3x total)
        if (Math.abs(n) >= 6) {
           candidatePool.push(n);
           candidatePool.push(n);
        }
      });

      // 3. Pick from Pool with Anti-Ping-Pong Check
      let move = 0;
      let foundGoodMove = false;
      let attempts = 0;

      // Try up to 8 times to find a move that isn't just "-lastMove"
      while (!foundGoodMove && attempts < 8) {
        attempts++;
        const candidate = candidatePool[Math.floor(Math.random() * candidatePool.length)];

        // Rule: Avoid exact opposite of last move (e.g. if last was +7, avoid -7)
        // Exception: If we really have no other choice, eventually attempts will max out and we take it.
        if (candidate !== -lastMove || availableNumbers.length === 1) {
           move = candidate;
           foundGoodMove = true;
        }
      }
      
      // Fallback: If we couldn't find a non-repeat in 8 tries, just take the last candidate picked
      if (!foundGoodMove) {
         move = candidatePool[Math.floor(Math.random() * candidatePool.length)];
      }

      currentSet.push(move);
      currentVal += move;
      lastMove = move;
    }
    
    if (validSet) sets.push({ numbers: currentSet, answer: currentVal });
  }
  return sets;
}