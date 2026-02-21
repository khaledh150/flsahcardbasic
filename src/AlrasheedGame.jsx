import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { generateUnits } from "./logic/generateUnits";
import { generateTens } from "./logic/generateTens";
import logoImage from "./assets/logo.webp";

// Import Audio Assets
import tickSound from "./assets/sounds/tick.wav";
import dingSound from "./assets/sounds/ding.wav";
import getReadySound from "./assets/sounds/readyGo.wav";
import wrongSoundFile from "./assets/sounds/wronganswer.wav";

// ─────────────────────────────────────────────────────────────────────────────
// INLINE STUBS (standalone — in the full app these come from external modules)
// ─────────────────────────────────────────────────────────────────────────────

function useWakeLock(active) {
  const wakeLockRef = useRef(null);
  useEffect(() => {
    if (!active) {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((wl) => {
        wakeLockRef.current = wl;
      }).catch(() => {});
    }
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [active]);
}

function LoadingCurtain({ visible, message }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-indigo-950/95 backdrop-blur-md">
      <div className="animate-spin h-16 w-16 border-4 border-white/30 border-t-pink-400 rounded-full mb-6" />
      <p className="text-white text-2xl font-black tracking-widest animate-pulse">{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAGNITUDE_OPTIONS = [
  { value: "units", label: "Units" },
  { value: "tens",  label: "Tens" },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AlrasheedGame() {
  // --- SETTINGS STATE ---
  const [speed, setSpeed] = useState(1.0);
  const [magnitude, setMagnitude] = useState("units");
  const [times, setTimes] = useState(10);
  const [totalRounds, setTotalRounds] = useState(5);
  const [revealMode, setRevealMode] = useState("each"); // "each" = practice, "end" = competition
  const mode = "Mixed"; // Only Mixed is supported for now
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const [voices, setVoices] = useState([]);

  // --- GAME STATE ---
  const [phase, setPhase] = useState("settings");
  useWakeLock(phase !== "settings");

  const [isLoading, setIsLoading] = useState(false);
  const gameSetsRef = useRef([]); // array of { numbers: number[], answer: number }

  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentNumberIndex, setCurrentNumberIndex] = useState(0);
  const [readyText, setReadyText] = useState("");
  const [isReadyWord, setIsReadyWord] = useState(false);
  const [actualAnswer, setActualAnswer] = useState(null);

  // --- INPUT & SCORE ---
  const [userInput, setUserInput] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [revealedSummaryCount, setRevealedSummaryCount] = useState(0);

  // --- AUDIO (real sound files, same as FlashcardGame) ---
  const audioRefs = useRef({
    tick: new Audio(tickSound),
    ding: new Audio(dingSound),
    wrong: new Audio(wrongSoundFile),
    ready: new Audio(getReadySound),
  });

  useEffect(() => {
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) audio.load();
    });
    if (audioRefs.current.tick) audioRefs.current.tick.volume = 0.7;
    if (audioRefs.current.ding) audioRefs.current.ding.volume = 1.0;
  }, []);

  const playSound = useCallback((name) => {
    try {
      const audio = audioRefs.current[name];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    } catch (e) { console.error(e); }
  }, []);

  // --- TIMERS ---
  const timeoutsRef = useRef([]);
  const isMounted = useRef(true);
  const flashTimerRef = useRef(null);

  const clearTimers = () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      clearTimers();
      window.speechSynthesis.cancel();
    };
  }, []);

  // --- TTS ---
  useEffect(() => {
    const loadVoices = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length > 0) setVoices(vs);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const getBestVoice = (langCode) => {
    const allVoices = window.speechSynthesis.getVoices();
    const preferred = langCode === "th"
      ? ["Kanya", "Narisa"]
      : ["Google US English", "Samantha", "Microsoft Zira"];
    for (const name of preferred) {
      const found = allVoices.find((v) => v.name.includes(name));
      if (found) return found;
    }
    const langTag = langCode === "th" ? "th" : "en";
    return allVoices.find((v) => v.lang.startsWith(langTag)) || null;
  };

  const speakText = (text, type = "number", skipCancel = false) => {
    if (!ttsEnabled || !isMounted.current) return;
    if (!skipCancel) window.speechSynthesis.cancel();
    let spokenText = text;
    if (text === "equals") {
      spokenText = "Equals";
    } else if (type === "op") {
      const sign = text.startsWith("-") ? "Minus" : "Plus";
      const num = text.replace(/^[+-]/, "");
      spokenText = `${sign} ${num}`;
    }
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const numericPart = text.replace(/^[+-]/, "");
    let rate = numericPart.length >= 2 ? 0.95 : 1.1;
    if (numericPart.length >= 2) {
      if (speed <= 0.3) rate = 1.8;
      else if (speed <= 0.4) rate = 1.6;
      else if (speed <= 0.5) rate = 1.45;
      else if (speed <= 0.6) rate = 1.3;
      else if (speed <= 0.7) rate = 1.15;
    }
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";
    const bestVoice = getBestVoice("en");
    if (bestVoice) utterance.voice = bestVoice;
    window.speechSynthesis.speak(utterance);
  };

  const unlockAudio = () => {
    try {
      const unlock = new SpeechSynthesisUtterance(" ");
      unlock.volume = 0.01;
      window.speechSynthesis.speak(unlock);
    } catch (e) { /* */ }
  };

  // ─── GAME LOGIC ────────────────────────────────────────────────────────────

  const startSequenceForSet = (targetIndex) => {
    clearTimers();
    setCurrentSetIndex(targetIndex);
    setCurrentNumberIndex(0);
    setActualAnswer(null);
    setUserInput("");
    setFeedbackStatus(null);
    setPhase("getready");

    const setData = gameSetsRef.current[targetIndex];
    if (setData) {
      setActualAnswer(setData.answer);
    }

    const seq = ["Get", "Ready", "3", "2", "1", "Go!"];
    let i = 0;
    const runSeq = () => {
      if (!isMounted.current) return;
      setReadyText(seq[i]);
      setIsReadyWord(seq[i].length > 1);
      const delays = [800, 800, 800, 800, 800, 600];
      if (i < seq.length - 1) {
        const id = setTimeout(() => { i++; runSeq(); }, delays[i]);
        timeoutsRef.current.push(id);
      } else {
        const id = setTimeout(() => {
          setReadyText("");
          const pauseId = setTimeout(() => startFlashing(targetIndex), 500);
          timeoutsRef.current.push(pauseId);
        }, delays[i]);
        timeoutsRef.current.push(id);
      }
    };
    playSound("ready");
    runSeq();
  };

  // Skip ready overlay — direct flash for practice auto-advance
  const startNextRoundDirectly = (targetIndex) => {
    clearTimers();
    setPhase("playing");
    setCurrentSetIndex(targetIndex);
    setCurrentNumberIndex(0);
    setActualAnswer(null);
    setUserInput("");
    setFeedbackStatus(null);

    const setData = gameSetsRef.current[targetIndex];
    if (setData) {
      setActualAnswer(setData.answer);
    }

    const id = setTimeout(() => startFlashing(targetIndex), 300);
    timeoutsRef.current.push(id);
  };

  const startFlashing = (targetIndex) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    const nps = Math.max(1, Math.min(times, 50));
    setPhase("playing");

    const setData = gameSetsRef.current[targetIndex];
    if (!setData) return;
    const numbers = setData.numbers;

    let idx = 0;
    const SPEECH_PREFIRE = 350; // ms to pre-fire speech before showing number

    function prefireAndShow() {
      if (!isMounted.current) return;
      if (idx >= nps) return;

      const num = numbers[idx];
      const textForSpeech = num >= 0 ? `+${Math.abs(num)}` : `-${Math.abs(num)}`;

      // Pre-fire speech ahead of display
      speakText(textForSpeech, "op", true);

      // Show number after prefire delay
      const showId = setTimeout(() => {
        if (!isMounted.current) return;
        setCurrentNumberIndex(idx);
        playSound("tick");

        const digitCount = Math.abs(num).toString().length;
        let delayMultiplier = 1.5;
        if (digitCount >= 4) delayMultiplier = 2.5;
        else if (digitCount >= 3) delayMultiplier = 2.0;
        else if (digitCount >= 2) delayMultiplier = 1.8;
        const delay = speed * 1000 * delayMultiplier;

        if (idx === nps - 1) {
          flashTimerRef.current = setTimeout(() => {
            if (!isMounted.current) return;
            speakText("equals");
            setPhase("input");
          }, delay);
        } else {
          flashTimerRef.current = setTimeout(() => { idx++; prefireAndShow(); }, delay);
        }
      }, SPEECH_PREFIRE);
      timeoutsRef.current.push(showId);
    }
    prefireAndShow();
  };

  const requestFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(() => {});
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
  };

  // ─── START ─────────────────────────────────────────────────────────────────

  const handleStart = () => {
    unlockAudio();
    requestFullscreen();
    setIsLoading(true);
    const loadStart = Date.now();

    const nps = Math.max(1, Math.min(times, 50));
    // Generate enough sets for all rounds (+ extras in case some fail)
    const numToGenerate = totalRounds + 5;

    const data = magnitude === "tens"
      ? generateTens(numToGenerate, nps, mode)
      : generateUnits(numToGenerate, nps, mode);

    if (data.length === 0) {
      setIsLoading(false);
      return;
    }

    gameSetsRef.current = data;

    const elapsed = Date.now() - loadStart;
    const remaining = Math.max(0, 2000 - elapsed);
    setTimeout(() => {
      setIsLoading(false);
      setPracticeHistory([]);
      setRevealedSummaryCount(0);
      startSequenceForSet(0);
    }, remaining);
  };

  // --- INPUT ---

  const handleKeypadPress = (val) => {
    if (val === "DEL") setUserInput((prev) => prev.slice(0, -1));
    else if (val === "ENTER") handleSubmitAnswer();
    else if (userInput.length < 8) setUserInput((prev) => prev + val);
  };

  const handleKeyDown = (e) => {
    if (phase !== "input") return;
    const key = e.key;
    if (!isNaN(key)) { if (userInput.length < 8) setUserInput((prev) => prev + key); }
    else if (key === "Backspace") setUserInput((prev) => prev.slice(0, -1));
    else if (key === "Enter") handleSubmitAnswer();
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, userInput]);

  const handleSubmitAnswer = () => {
    if (userInput === "" && revealMode === "each") return;

    const userInt = userInput ? parseInt(userInput, 10) : null;
    const isCorrect = userInt === actualAnswer;

    setPracticeHistory((prev) => [...prev, {
      setIndex: currentSetIndex, userAnswer: userInt,
      correctAnswer: actualAnswer, isCorrect,
    }]);

    if (revealMode === "each") {
      if (isCorrect) { setFeedbackStatus("correct"); playSound("ding"); }
      else { setFeedbackStatus("wrong"); playSound("wrong"); }
      setPhase("feedback");

      const feedbackDelay = isCorrect ? 1200 : 2000;
      const id = setTimeout(() => handleNextRound(true), feedbackDelay);
      timeoutsRef.current.push(id);
    }
  };

  // Competition mode: record and advance without showing answer
  const handleCompetitionNext = () => {
    setPracticeHistory((prev) => [...prev, {
      setIndex: currentSetIndex, userAnswer: null,
      correctAnswer: actualAnswer, isCorrect: false,
    }]);

    const nextIdx = currentSetIndex + 1;
    if (nextIdx < totalRounds) {
      startSequenceForSet(nextIdx);
    } else {
      startSummarySequence();
    }
  };

  // --- NAVIGATION ---

  const handleNextRound = (autoAdvance = false) => {
    const nextIdx = currentSetIndex + 1;
    if (nextIdx < totalRounds) {
      if (revealMode === "each" && autoAdvance) {
        startNextRoundDirectly(nextIdx);
      } else {
        startSequenceForSet(nextIdx);
      }
    } else {
      startSummarySequence();
    }
  };

  const startSummarySequence = () => {
    setPhase("summary");
    setRevealedSummaryCount(0);

    const count = Math.min(totalRounds, practiceHistory.length + 1);
    for (let idx = 0; idx < count; idx++) {
      const id = setTimeout(() => {
        setRevealedSummaryCount((prev) => prev + 1);
        playSound("ding");
      }, (idx + 1) * 600);
      timeoutsRef.current.push(id);
    }
  };

  const handleBackToSettings = () => {
    clearTimers();
    setPhase("settings");
    setActualAnswer(null);
    setCurrentSetIndex(0);
    setCurrentNumberIndex(0);
    setRevealedSummaryCount(0);
    gameSetsRef.current = [];
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document).catch?.(() => {});
    } else {
      requestFullscreen();
    }
  };

  const goToMainMenu = () => {
    clearTimers();
    window.speechSynthesis.cancel();
    if (phase !== "settings") handleBackToSettings();
  };

  // --- RENDER HELPERS ---
  const currentSetData = gameSetsRef.current[currentSetIndex];
  const currentNumbers = currentSetData ? currentSetData.numbers : [];

  const renderDisplayContent = () => {
    if (phase === "settings" || phase === "getready" || !currentNumbers.length) return null;
    const val = currentNumbers[currentNumberIndex];
    const numberSize = { fontSize: "clamp(18rem, 40vw, 20rem)" };
    const minusSize = { fontSize: "clamp(10rem, 15vw, 8rem)" };

    return (
      <div key={`flash-${currentSetIndex}-${currentNumberIndex}`} className="flex flex-col items-center justify-center relative w-full h-full">
        <div className="flex items-center justify-center w-[90vw] h-full text-center">
          {val < 0 && (
            <span className="font-black text-red-500 mr-2 self-center leading-none" style={minusSize}>−</span>
          )}
          <span className={`font-black tracking-tighter leading-none ${val < 0 ? "text-red-500" : "text-slate-800"} drop-shadow-2xl filter`} style={numberSize}>
            {Math.abs(val)}
          </span>
        </div>
      </div>
    );
  };

  // ─── JSX RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative select-none bg-slate-50 overflow-hidden">
      <LoadingCurtain visible={isLoading} message="Generating Questions..." />


      {/* Back Button */}
      <button onClick={goToMainMenu}
        className="fixed top-3 left-3 sm:top-5 sm:left-5 z-[999] w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/90 backdrop-blur-md border border-white/70 shadow-[0_12px_30px_rgba(0,0,0,0.18)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        aria-label="Back">
        <span className="text-2xl sm:text-3xl font-black text-slate-900">←</span>
      </button>

      {/* Fullscreen Toggle */}
      <button onClick={toggleFullscreen}
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[999] w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/90 backdrop-blur-md border border-white/70 shadow-[0_12px_30px_rgba(0,0,0,0.18)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
        aria-label="Fullscreen">
        <span className="text-xl sm:text-2xl">⛶</span>
      </button>

      {/* Round Indicator */}
      {phase !== "settings" && phase !== "summary" && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-white/80 backdrop-blur-md rounded-full border border-slate-200 shadow-md z-30">
          <h2 className="text-sm sm:text-lg font-black text-slate-700 tracking-widest uppercase flex items-center gap-2 whitespace-nowrap">
            {`Round ${currentSetIndex + 1} / ${totalRounds}`}
          </h2>
        </div>
      )}

      {/* ═══════════ PHASE: SETTINGS ═══════════ */}
      {phase === "settings" && (
        <div className="flex-1 w-full flex flex-col items-center justify-center px-4 pt-16 pb-4 overflow-y-auto">
          {/* Logo + Title */}
          <img
            src={logoImage}
            alt=""
            className="w-72 sm:w-80 md:w-96 h-auto object-contain mb-3"
          />
          <div className="mb-4 text-center">
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent drop-shadow-lg tracking-tight">
              Test Skills
            </h1>
            <p className="text-sm sm:text-base font-bold text-slate-500 mt-0.5 tracking-widest uppercase">
              Soroban Trainer
            </p>
          </div>

          <div className="bg-white/90 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-white max-w-lg w-full flex flex-col gap-4">

            {/* Control 1: Magnitude — pill buttons */}
            <div className="bg-slate-50 p-3 rounded-2xl">
              <label className="text-slate-400 font-bold text-xs uppercase ml-1 block mb-2">Magnitude</label>
              <div className="flex gap-2">
                {MAGNITUDE_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMagnitude(m.value)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm sm:text-base transition-all border-2 ${
                      magnitude === m.value
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                        : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 2 & 3: Speed + Rounds — side by side */}
            <div className="grid grid-cols-2 gap-4">
              {/* Speed */}
              <div className="bg-slate-50 p-3 rounded-2xl">
                <label className="text-slate-400 font-bold text-xs uppercase ml-1 block mb-1">Speed (sec)</label>
                <div className="flex items-center justify-center">
                  <input
                    type="number" min={0.3} max={5} step={0.1}
                    value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full bg-transparent text-center text-2xl font-black text-slate-800 focus:outline-none"
                  />
                </div>
              </div>
              {/* Rounds */}
              <div className="bg-slate-50 p-3 rounded-2xl">
                <label className="text-slate-400 font-bold text-xs uppercase ml-1 block mb-1">Rounds</label>
                <div className="flex items-center justify-between">
                  <button onClick={() => setTotalRounds(Math.max(1, totalRounds - 1))}
                    className="w-8 h-8 rounded-lg bg-white text-emerald-600 font-bold shadow-sm">−</button>
                  <span className="text-2xl font-black text-slate-800">{totalRounds}</span>
                  <button onClick={() => setTotalRounds(Math.min(50, totalRounds + 1))}
                    className="w-8 h-8 rounded-lg bg-white text-emerald-600 font-bold shadow-sm">+</button>
                </div>
              </div>
            </div>

            {/* Control 4: Numbers Per Set (Times) — stepper */}
            <div className="bg-slate-50 p-3 rounded-2xl">
              <label className="text-slate-400 font-bold text-xs uppercase ml-1 block mb-1">Numbers Per Set</label>
              <div className="flex items-center justify-between px-4">
                <button onClick={() => setTimes(Math.max(2, times - 1))}
                  className="w-10 h-10 rounded-xl bg-white text-emerald-600 font-bold shadow-sm text-xl active:scale-90 transition-all">−</button>
                <span className="text-3xl font-black text-slate-800">{times}</span>
                <button onClick={() => setTimes(Math.min(50, times + 1))}
                  className="w-10 h-10 rounded-xl bg-white text-emerald-600 font-bold shadow-sm text-xl active:scale-90 transition-all">+</button>
              </div>
            </div>

            {/* Control 5: Mode & Voice — side by side */}
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 p-3 rounded-2xl flex flex-col gap-2">
                <label className="text-slate-400 font-bold text-xs uppercase ml-1">Mode</label>
                <button onClick={() => setRevealMode(revealMode === "each" ? "end" : "each")}
                  className="flex-1 bg-white rounded-xl font-bold text-emerald-700 shadow-sm py-2 text-sm border-2 border-emerald-100">
                  {revealMode === "each" ? "Practice" : "Competition"}
                </button>
              </div>
              <div className="w-1/3 bg-slate-50 p-3 rounded-2xl flex flex-col gap-2">
                <label className="text-slate-400 font-bold text-xs uppercase ml-1">Voice</label>
                <button onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={`flex-1 rounded-xl font-bold shadow-sm py-2 text-xl ${ttsEnabled ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-400"}`}>
                  {ttsEnabled ? "🔊" : "🔇"}
                </button>
              </div>
            </div>

            {/* START Button — large circular gold */}
            <div className="flex justify-center mt-3">
              <button onClick={handleStart}
                className="w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 shadow-[0_8px_30px_rgba(245,180,0,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all border-4 border-amber-200/60">
                <span className="text-3xl sm:text-4xl font-black text-amber-900 uppercase tracking-wider drop-shadow-sm">Start</span>
              </button>
            </div>

            {/* Config summary */}
            <p className="text-center text-xs text-slate-400 font-medium">
              {magnitude === "units" ? "Units" : "Tens"} · {times} numbers · {totalRounds} rounds · {speed.toFixed(1)}s · {revealMode === "each" ? "Practice" : "Competition"}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════ PHASE: GET READY ═══════════ */}
      {phase === "getready" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "#1e1b4b" }}>
          <div className={`font-black text-pink-400 leading-none drop-shadow-[0_0_30px_rgba(253,144,215,0.6)] text-center ${isReadyWord ? "ready-word" : "ready-number"}`}>
            {readyText}
          </div>
        </div>
      )}

      {/* ═══════════ PHASE: PLAYING ═══════════ */}
      {phase === "playing" && (
        <div className="flex-1 w-full flex flex-col items-center justify-center pb-12">
          {/* Brand Logo */}
          <div className="absolute inset-x-0 top-12 flex justify-center pointer-events-none z-0">
            <img src={logoImage} alt="" className="w-72 sm:w-80 md:w-96 h-auto object-contain" />
          </div>
          <div className="relative z-20 w-full h-full flex justify-center">{renderDisplayContent()}</div>
          <div className="absolute bottom-24 sm:bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-30 flex-wrap justify-center max-w-[80vw]">
            {Array.from({ length: Math.min(times, 50) }).map((_, i) => (
              <div key={i} className={`h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full transition-all duration-200 ${i <= currentNumberIndex ? "bg-violet-500 scale-125" : "bg-slate-300"}`} />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ PHASE: INPUT ═══════════ */}
      {phase === "input" && (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center">
          {revealMode === "each" ? (
            <>
              {/* Practice Mode: Keypad input */}
              <div className="mb-6 w-full max-w-xs sm:max-w-sm px-4">
                <div className="bg-white rounded-2xl border-4 border-violet-100 h-20 sm:h-24 flex items-center justify-center shadow-inner">
                  <span className="text-5xl sm:text-6xl font-black text-slate-800">{userInput || <span className="text-slate-200">?</span>}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-sm px-4">
                {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
                  <button key={num} onClick={() => handleKeypadPress(num)} className="h-14 sm:h-16 bg-white rounded-xl shadow-md text-3xl font-bold text-slate-700 active:bg-slate-100 active:scale-95 transition-all">{num}</button>
                ))}
                <button onClick={() => handleKeypadPress(0)} className="col-span-2 h-14 sm:h-16 bg-white rounded-xl shadow-md text-3xl font-bold text-slate-700 active:bg-slate-100 active:scale-95 transition-all">0</button>
                <button onClick={() => handleKeypadPress("DEL")} className="h-14 sm:h-16 bg-red-50 rounded-xl shadow-md text-xl font-bold text-red-500 active:scale-95 transition-all">DEL</button>
              </div>
              <button onClick={handleSubmitAnswer} className="mt-6 w-full max-w-xs sm:max-w-sm px-4 py-4 rounded-2xl bg-pink-400 text-white font-black text-2xl shadow-md hover:bg-pink-500 active:scale-95 transition-all">SUBMIT</button>
            </>
          ) : (
            <>
              {/* Competition Mode: ? and Next/Results button */}
              <div className="mb-8 w-full max-w-xs sm:max-w-sm px-4">
                <div className="bg-white rounded-3xl border-4 border-violet-100 h-32 sm:h-40 flex items-center justify-center shadow-inner">
                  <span className="text-8xl sm:text-9xl font-black text-slate-200">?</span>
                </div>
              </div>
              <button onClick={handleCompetitionNext}
                className="w-full max-w-xs sm:max-w-sm px-4 py-5 rounded-2xl bg-pink-400 text-white font-black text-2xl shadow-md hover:bg-pink-500 active:scale-95 transition-all uppercase tracking-widest">
                {currentSetIndex + 1 >= totalRounds ? "Results" : "Next"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ═══════════ PHASE: FEEDBACK (Practice only) ═══════════ */}
      {phase === "feedback" && (
        <div className="flex-1 w-full flex flex-col items-center justify-center pb-12">
          <div className="feedback-container flex flex-col items-center justify-center">
            {feedbackStatus === "correct" ? (
              <>
                <div className="font-black drop-shadow-2xl text-green-500" style={{ fontSize: "min(28vh, 45vw)" }}>✓</div>
                <h2 className="text-5xl sm:text-6xl font-black text-green-500 mt-2 uppercase tracking-wider">CORRECT</h2>
              </>
            ) : (
              <>
                <div className="font-black drop-shadow-2xl text-red-500" style={{ fontSize: "min(28vh, 45vw)" }}>✗</div>
                <h2 className="text-5xl sm:text-6xl font-black text-red-500 mt-2 uppercase tracking-wider">WRONG</h2>
                <div className="mt-4 flex flex-col items-center">
                  <span className="text-lg text-slate-400 font-bold uppercase tracking-widest">Answer was</span>
                  <span className="text-5xl sm:text-6xl font-black text-emerald-500 mt-1">{actualAnswer}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ PHASE: SUMMARY ═══════════ */}
      {phase === "summary" && (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center px-2 overflow-hidden">
          <div className="w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl p-6 flex flex-col max-h-[90vh]">
            <h3 className="text-center text-2xl font-black text-slate-800 mb-4 uppercase border-b pb-2 shrink-0">Summary</h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 no-scrollbar">
              {practiceHistory.map((item, idx) => {
                const setData = gameSetsRef.current[idx];
                const nps = Math.max(1, Math.min(times, 50));
                const equationStr = setData
                  ? setData.numbers.slice(0, nps).map((n, i) => (n >= 0 && i > 0 ? `+${n}` : `${n}`)).join(" ")
                  : "";
                const isRevealed = revealedSummaryCount > idx;

                return (
                  <div key={idx}
                    className={`flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm transition-all duration-500 ${isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                    style={{ transitionDelay: `${idx * 100}ms` }}>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <div className="flex items-center gap-3">
                        <span className={`text-white font-black w-8 h-8 flex shrink-0 items-center justify-center rounded-full shadow-md ${
                          revealMode === "each" ? (item.isCorrect ? "bg-blue-500" : "bg-red-500") : "bg-blue-500"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-mono text-sm sm:text-lg text-slate-500 font-bold truncate">
                          {equationStr} =
                        </span>
                      </div>
                      {revealMode === "each" && item.userAnswer !== null && (
                        <div className="flex gap-4 ml-11 text-xs sm:text-sm font-bold">
                          <span className="text-slate-400">YOU: <span className={item.isCorrect ? "text-green-600" : "text-red-500"}>{item.userAnswer}</span></span>
                        </div>
                      )}
                    </div>
                    <div className="text-2xl sm:text-3xl font-black w-24 text-right shrink-0">
                      {isRevealed ? (
                        <span className="text-emerald-500 animate-pop-in inline-block">{item.correctAnswer}</span>
                      ) : (
                        <span className="text-slate-200">...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Buttons */}
            {revealedSummaryCount >= practiceHistory.length && (
              <div className="flex flex-col gap-3 mt-4 shrink-0">
                <button onClick={handleStart}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-500 text-amber-900 font-black text-xl shadow-md hover:scale-[1.02] active:scale-95 transition-all">
                  Play Again
                </button>
                <button onClick={handleBackToSettings}
                  className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-bold active:scale-95 transition-all">
                  Back to Settings
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes popIn {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .feedback-container { animation: feedbackIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @keyframes feedbackIn {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .ready-number { font-size: clamp(10rem, 55vw, 25rem); }
        .ready-word { font-size: clamp(5rem, 20vw, 10rem); }
        @media (max-height: 600px) and (orientation: landscape) {
          .ready-number { font-size: 5rem; }
          .ready-word { font-size: 4rem; }
        }
      `}</style>
    </div>
  );
}
