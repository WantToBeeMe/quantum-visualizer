import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import QbitsLanding from './pages/QbitsLanding';
import QbitsWorkspace from './layout/QbitsWorkspace';
import {
  getInitialQubitState,
  applyGate,
  createU3Matrix,
  getMultiQubitProbabilities,
  stateToBlochCoords,
  getProbabilities,
  getKickbackPhaseForControlledGate
} from './quantum';
import './App.css';

function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [circuits, setCircuits] = useState([[]]); // Each gate: { gate, matrix, decomposition, controlIndex }
  const [barriers, setBarriers] = useState([]);
  const [qubitVisibility, setQubitVisibility] = useState([true]);
  const [focusQubit, setFocusQubit] = useState(null);
  const [selectedGate, setSelectedGate] = useState(null);

  const [animationFrame, setAnimationFrame] = useState(-1); // -1 = show all
  const [isPlaying, setIsPlaying] = useState(false);
  const [configControlSignals, setConfigControlSignals] = useState([]); // Signals from config selection
  const [leftPanelWidth, setLeftPanelWidth] = useState(400);
  const [configHeightPercent, setConfigHeightPercent] = useState(80);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);
  const [visibilityChangeToken, setVisibilityChangeToken] = useState(0);
  const [initialStateMode, setInitialStateMode] = useState('zero');
  const containerRef = useRef(null);
  const leftPanelRef = useRef(null);

  const barrierCount = barriers.length;
  // Total frames: 0 = no gates, 1..barrierCount = after each barrier, barrierCount+1 = all gates
  const totalFrames = barrierCount + 2;

  // Highlighted barrier for animation (-1 = none)
  const highlightedBarrier = animationFrame > 0 && animationFrame <= barrierCount ? animationFrame - 1 : -1;

  // Compute animation duration per segment (for timeline)
  const segmentDurations = useMemo(() => {
    // Return equal duration for each segment to ensure uniform timeline
    return new Array(Math.max(0, totalFrames - 1)).fill(1);
  }, [totalFrames]);

  // Get gates up to a certain animation frame
  const getOrderedGates = useCallback((qubitIndex, frame) => {
    const row = circuits[qubitIndex] || [];
    const sortedBarriers = [...barriers].sort((a, b) => a - b);

    // Get all gates with their slots
    const entries = row.map((gate, slot) => ({ gate: gate ? { ...gate, slot } : null, slot })).filter(e => e.gate);
    entries.sort((a, b) => a.slot - b.slot);

    if (frame === 0) return [];
    if (frame > barrierCount) return entries.map(e => e.gate);

    const barrierSlot = sortedBarriers[frame - 1];
    if (barrierSlot === undefined) return entries.map(e => e.gate);
    return entries.filter(e => e.slot < barrierSlot).map(e => e.gate);
  }, [circuits, barriers, barrierCount]);

  const getInitialState = useCallback(() => getInitialQubitState(initialStateMode), [initialStateMode]);

  // ── Column state cache for phase kickback detection ──
  // Builds stateAtColumn[qi][slot] = state of qubit qi up to (not including) slot
  const buildColumnStateCache = useCallback((frame) => {
    const numQubits = circuits.length;
    // Find max slot across all qubits
    let maxSlot = 0;
    circuits.forEach(row => {
      row.forEach((g, s) => { if (g) maxSlot = Math.max(maxSlot, s); });
    });

    const cache = [];
    for (let qi = 0; qi < numQubits; qi++) {
      const gateList = getOrderedGates(qi, frame);
      // Build column->state mapping
      const statesAtSlot = {};
      let state = getInitialState();
      statesAtSlot[-1] = state; // before any gate

      // Process gates sorted by slot
      const sortedGates = [...gateList].sort((a, b) => a.slot - b.slot);
      for (let s = 0; s <= maxSlot + 1; s++) {
        statesAtSlot[s] = [...state]; // state BEFORE applying gate at slot s
        const gateAtSlot = sortedGates.find(g => g.slot === s);
        if (gateAtSlot && gateAtSlot.gate !== 'BARRIER' && gateAtSlot.gate !== 'CONTROL') {
          // Only apply non-controlled version OR skip controlled gates here
          // For state cache, apply the gate unconditionally (used to detect what the qubit looks like at this point)
          state = applyGate(state, gateAtSlot);
        }
      }
      cache.push(statesAtSlot);
    }
    return cache;
  }, [circuits, getOrderedGates, getInitialState]);

  // Calculate branches with rotation history
  const qubitBranches = useMemo(() => {
    const frame = animationFrame < 0 ? totalFrames - 1 : animationFrame;

    // Build column state cache for phase kickback detection
    const stateCache = buildColumnStateCache(frame);

    // Helper to get control qubit state at a specific slot from cache
    const getControlStateAtSlot = (ctrlQubit, slot) => {
      const qubitCache = stateCache[ctrlQubit];
      if (!qubitCache) return getInitialState();
      return qubitCache[slot] || getInitialState();
    };

    // For each control qubit, derive synthetic phase gates caused by outgoing controlled gates.
    const getKickbackGatesForControl = (controlQubit) => {
      const kickbackGates = [];

      circuits.forEach((_, targetQubit) => {
        const targetGates = getOrderedGates(targetQubit, frame);
        targetGates.forEach((gate) => {
          if (!gate || gate.gate === 'CONTROL') return;
          if (gate.controlIndex !== controlQubit) return;

          const targetStateBefore = stateCache[targetQubit]?.[gate.slot] || getInitialState();
          const phase = getKickbackPhaseForControlledGate(gate, targetStateBefore);
          if (phase === null || Math.abs(phase) <= 0.01) return;

          kickbackGates.push({
            gate: 'U',
            matrix: createU3Matrix(0, 0, phase),
            decomposition: { theta: 0, phi: 0, lambda: phase },
            controlIndex: null,
            slot: gate.slot,
            isDerivedKickback: true
          });
        });
      });

      return kickbackGates;
    };

    return circuits.map((_, qi) => {
      const rowGates = getOrderedGates(qi, frame);
      const kickbackGates = getKickbackGatesForControl(qi);
      const gates = [...rowGates, ...kickbackGates].sort((a, b) => a.slot - b.slot);
      const controlledGate = gates.find(g => g.controlIndex !== undefined && g.controlIndex !== null && g.gate !== 'CONTROL');
      const hasControl = !!controlledGate;

      // Build rotations from decomposition (for visualization)
      const buildRotations = (gateList) => {
        const rotations = [];
        for (const gate of gateList) {
          if (gate.gate === 'BARRIER' || gate.gate === 'CONTROL') continue;
          const decomp = gate.decomposition;
          if (decomp) {
            const { theta, phi, lambda } = decomp;
            const hasTheta = Math.abs(theta) > 0.01;
            const hasPhi = Math.abs(phi) > 0.01;
            const hasLambda = Math.abs(lambda) > 0.01;
            if (hasTheta || hasPhi || hasLambda) {
              rotations.push({ theta, phi, lambda, isCompound: true });
            }
          }
        }
        return rotations;
      };

      // Apply gates using matrix multiplication
      const applyGates = (gateList, state) => {
        for (const gate of gateList) {
          if (gate.gate === 'BARRIER' || gate.gate === 'CONTROL') continue;
          state = applyGate(state, gate);
        }
        return state;
      };

      if (!hasControl) {
        let state = getInitialState();
        state = applyGates(gates, state);
        const rotations = buildRotations(gates);
        return [{ state, coords: stateToBlochCoords(state), probability: 1, rotations }];
      } else {
        // Find all controlled gates (exclude CONTROL placeholder nodes)
        const controlledGates = gates.filter(g => g.controlIndex !== undefined && g.controlIndex !== null && g.gate !== 'CONTROL');
        const uniqueControls = [...new Set(controlledGates.map(g => g.controlIndex))];

        const numControls = uniqueControls.length;
        const numCombinations = Math.pow(2, numControls);

        // Get probabilities for each control qubit being in |1⟩
        const controlProbs = uniqueControls.map(ctrlIdx => {
          const ctrlGate = controlledGates.find(g => g.controlIndex === ctrlIdx);
          const ctrlState = getControlStateAtSlot(ctrlIdx, ctrlGate.slot);
          return getProbabilities(ctrlState).prob1;
        });

        const branches = [];

        for (let combo = 0; combo < numCombinations && branches.length < 10; combo++) {
          const controlActive = {};
          let probability = 1;

          for (let i = 0; i < numControls; i++) {
            const isActive = (combo >> i) & 1;
            controlActive[uniqueControls[i]] = isActive === 1;
            probability *= isActive ? controlProbs[i] : (1 - controlProbs[i]);
          }

          if (probability < 0.01) continue;

          const activeGates = gates.filter(g => {
            if (g.gate === 'CONTROL') return false;
            if (g.controlIndex === undefined || g.controlIndex === null) return true;
            return controlActive[g.controlIndex];
          });

          let state = getInitialState();
          state = applyGates(activeGates, state);
          const rotations = buildRotations(activeGates);

          branches.push({
            state,
            coords: stateToBlochCoords(state),
            probability,
            rotations
          });
        }

        // Merge branches with identical Bloch sphere positions AND phases
        const coordsEqual = (c1, c2) => {
          const tol = 0.01;
          return Math.abs(c1.x - c2.x) < tol &&
            Math.abs(c1.y - c2.y) < tol &&
            Math.abs(c1.z - c2.z) < tol;
        };

        const normalizeAngle = (a) => {
          while (a > Math.PI) a -= 2 * Math.PI;
          while (a < -Math.PI) a += 2 * Math.PI;
          return a;
        };

        const getTotalPhases = (rotations) => {
          let theta = 0, lambda = 0, phi = 0;
          for (const r of rotations) {
            theta += r.theta || 0;
            lambda += r.lambda || 0;
            phi += r.phi || 0;
          }
          return {
            theta: normalizeAngle(theta),
            lambda: normalizeAngle(lambda),
            phi: normalizeAngle(phi)
          };
        };

        const phasesEqual = (rots1, rots2) => {
          const tol = 0.01;
          const p1 = getTotalPhases(rots1);
          const p2 = getTotalPhases(rots2);
          return Math.abs(p1.theta - p2.theta) < tol &&
            Math.abs(p1.lambda - p2.lambda) < tol &&
            Math.abs(p1.phi - p2.phi) < tol;
        };

        const mergedBranches = [];
        for (const branch of branches) {
          const existing = mergedBranches.find(b =>
            coordsEqual(b.coords, branch.coords) &&
            phasesEqual(b.rotations, branch.rotations)
          );
          if (existing) {
            existing.probability += branch.probability;
          } else {
            mergedBranches.push({ ...branch });
          }
        }

        mergedBranches.sort((a, b) => b.probability - a.probability);
        if (mergedBranches.length > 10) mergedBranches.length = 10;

        return mergedBranches.length > 0 ? mergedBranches : [{
          state: getInitialState(),
          coords: stateToBlochCoords(getInitialState()),
          probability: 1,
          rotations: []
        }];
      }
    });
  }, [circuits, animationFrame, totalFrames, getOrderedGates, buildColumnStateCache, getInitialState]);

  const qubitStates = useMemo(() => qubitBranches.map(b => b.reduce((a, c) => c.probability > a.probability ? c : a).state), [qubitBranches]);
  const probabilities = useMemo(() => getMultiQubitProbabilities(qubitStates, false), [qubitStates]);
  const allProbabilities = useMemo(() => getMultiQubitProbabilities(qubitStates, true), [qubitStates]);

  // ── Phase kickback detection using column state cache ──
  const detectPhaseKickback = useCallback((targetGate, targetQubit, slot, stateCache) => {
    const targetStateBefore = stateCache[targetQubit]?.[slot] || getInitialState();
    const phase = getKickbackPhaseForControlledGate(targetGate, targetStateBefore);
    return phase !== null && Math.abs(phase) > 0.01;
  }, [getInitialState]);

  // Compute active control signals for current animation frame
  const activeControlSignals = useMemo(() => {
    if (!isPlaying || animationFrame <= 0) return [];

    const signals = [];
    const frame = animationFrame;
    const sortedBarriers = [...barriers].sort((a, b) => a - b);

    let minSlot = 0;
    let maxSlot = Infinity;
    if (frame > 0 && frame <= sortedBarriers.length) {
      minSlot = frame > 1 ? sortedBarriers[frame - 2] : 0;
      maxSlot = sortedBarriers[frame - 1];
    } else if (frame > sortedBarriers.length) {
      minSlot = sortedBarriers.length > 0 ? sortedBarriers[sortedBarriers.length - 1] : 0;
    }
    const stateCache = buildColumnStateCache(frame);

    // Find controlled gates in the active slot range
    circuits.forEach((row, qIdx) => {
      row.forEach((gate, slot) => {
        if (gate && gate.controlIndex !== undefined && gate.controlIndex !== null && gate.gate !== 'CONTROL') {
          if (slot >= minSlot && slot < maxSlot) {
            const hasKickback = detectPhaseKickback(gate, qIdx, slot, stateCache);
            signals.push({ from: gate.controlIndex, to: qIdx, hasKickback });
          }
        }
      });
    });

    return signals;
  }, [circuits, barriers, animationFrame, isPlaying, detectPhaseKickback, buildColumnStateCache]);

  // Handler for control signals triggered from GateSettings
  const handleControlSignal = useCallback((fromQubit, toQubit, hasKickbackHint = false, slot = null, targetGate = null) => {
    let hasKickback = hasKickbackHint;

    if (targetGate && slot !== null) {
      const frame = animationFrame < 0 ? totalFrames - 1 : animationFrame;
      const stateCache = buildColumnStateCache(frame);
      const targetStateBefore = stateCache[toQubit]?.[slot] || getInitialState();
      const phase = getKickbackPhaseForControlledGate(targetGate, targetStateBefore);
      hasKickback = phase !== null && Math.abs(phase) > 0.01;
    }

    setConfigControlSignals([{ from: fromQubit, to: toQubit, hasKickback }]);
    setTimeout(() => setConfigControlSignals([]), 50);
  }, [animationFrame, totalFrames, buildColumnStateCache, getInitialState]);

  // Combine animation signals and config signals
  const allControlSignals = useMemo(() => {
    return [...activeControlSignals, ...configControlSignals];
  }, [activeControlSignals, configControlSignals]);

  // ── Helper: shift ALL qubit threads right from a given slot ──
  const shiftAllColumnsRight = (circuitRows, fromSlot) => {
    return circuitRows.map(row => {
      const newRow = [...row];
      for (let s = newRow.length; s > fromSlot; s--) {
        newRow[s] = newRow[s - 1];
      }
      newRow[fromSlot] = null;
      return newRow;
    });
  };

  // ── Insert gate: column-synchronized ──
  const handleInsertGate = useCallback((qi, si, gate) => {
    const isOccupied = circuits[qi] && circuits[qi][si];

    setCircuits(prev => {
      let next = prev.map(r => [...r]);
      if (isOccupied) {
        // Shift ALL qubit threads right from this slot
        next = shiftAllColumnsRight(next, si);
        // Also shift any control references for gates at or after si
        next = next.map(row => row.map((g, s) => {
          if (!g) return g;
          // No need to remap controlIndex (it's a qubit index, not a slot)
          return g;
        }));
      }
      next[qi][si] = gate;
      return next;
    });

    if (isOccupied) {
      setBarriers(b => b.map(bi => bi >= si ? bi + 1 : bi));
    }

    setAnimationFrame(-1);
    setIsPlaying(false);
    setSelectedGate({ qubitIndex: qi, slotIndex: si, gate });
  }, [circuits]);

  // ── Remove gate: handles control pairing ──
  const handleRemoveGate = useCallback((qi, si) => {
    setCircuits(prev => {
      const next = prev.map(r => [...r]);
      const gate = next[qi][si];
      if (!gate) return prev;

      if (gate.gate === 'CONTROL') {
        // Removing a control dot: remove controlled config from target gate
        const targetQi = gate.targetIndex;
        if (next[targetQi] && next[targetQi][si] && next[targetQi][si].controlIndex === qi) {
          next[targetQi][si] = { ...next[targetQi][si], controlIndex: null };
        }
      } else if (gate.controlIndex !== undefined && gate.controlIndex !== null) {
        // Removing a target gate with a control: also remove the control dot
        const ctrlQi = gate.controlIndex;
        if (next[ctrlQi] && next[ctrlQi][si] && next[ctrlQi][si].gate === 'CONTROL' && next[ctrlQi][si].targetIndex === qi) {
          next[ctrlQi][si] = null;
        }
      }

      next[qi][si] = null;
      return next;
    });
    setSelectedGate(null);
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  const handleRemoveBarrier = useCallback((slotIdx) => {
    setBarriers(prev => prev.filter(b => b !== slotIdx));
    setSelectedGate(null);
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  // ── Update gate: handles control placement/removal with column sync ──
  const handleUpdateGate = useCallback((qi, si, newGate) => {
    setCircuits(prev => {
      let next = prev.map(r => [...r]);
      const oldGate = prev[qi][si];

      // --- Remove old control dot if control is changing or being removed ---
      if (oldGate && oldGate.controlIndex !== undefined && oldGate.controlIndex !== null) {
        const oldCtrlQi = oldGate.controlIndex;
        // Only remove if the new gate has a different control or no control
        if (newGate.controlIndex === null || newGate.controlIndex === undefined ||
          newGate.controlIndex !== oldCtrlQi) {
          if (next[oldCtrlQi] && next[oldCtrlQi][si] && next[oldCtrlQi][si].gate === 'CONTROL') {
            next[oldCtrlQi][si] = null;
          }
        }
      }

      // --- Place new control dot ---
      if (newGate.controlIndex !== undefined && newGate.controlIndex !== null) {
        const ctrlQi = newGate.controlIndex;

        // Check collision at the control qubit's slot
        const existingAtCtrl = next[ctrlQi][si];
        const isOurControlNode = existingAtCtrl && existingAtCtrl.gate === 'CONTROL' && existingAtCtrl.targetIndex === qi;

        if (existingAtCtrl && !isOurControlNode) {
          // Collision! Remove target gate first so it doesn't get shifted to si+1
          next[qi][si] = null;
          // Shift ALL threads right from this slot
          next = shiftAllColumnsRight(next, si);
          // After shift: slot si is now empty, old content at si moved to si+1
          // Place the target gate and control dot at si (the freed slot)
          next[qi][si] = newGate;
          next[ctrlQi][si] = { gate: 'CONTROL', targetIndex: qi, controlIndex: null };
          // Update barriers
          setBarriers(b => b.map(bi => bi >= si ? bi + 1 : bi));
          // Selected gate stays at si
          setSelectedGate(prev => prev ? { ...prev, gate: newGate } : null);
          return next;
        } else {
          // No collision: place directly
          next[qi][si] = newGate;
          next[ctrlQi][si] = { gate: 'CONTROL', targetIndex: qi, controlIndex: null };
        }
      } else {
        // Not controlled
        next[qi][si] = newGate;
      }

      return next;
    });

    // Update selected gate reference
    setSelectedGate(prev => prev ? { ...prev, gate: newGate } : null);
  }, [circuits]);

  const handleGateClick = useCallback((qi, si, g) => {
    if (qi === null && si === null) {
      setSelectedGate(null);
      return;
    }
    if (qi === -1) setSelectedGate({ isBarrier: true, slot: si });
    else setSelectedGate({ qubitIndex: qi, slotIndex: si, gate: g });
  }, []);

  const handleGateMiddleClick = useCallback((qi, si) => {
    // Check if this is a control dot
    const gate = circuits[qi]?.[si];
    if (gate?.gate === 'CONTROL') {
      // Middle-click on control dot: remove controlled config from target, remove control dot
      const targetQi = gate.targetIndex;
      setCircuits(prev => {
        const next = prev.map(r => [...r]);
        // Remove controlled config from target
        if (next[targetQi] && next[targetQi][si]) {
          next[targetQi][si] = { ...next[targetQi][si], controlIndex: null };
        }
        // Remove control dot
        next[qi][si] = null;
        return next;
      });
      setSelectedGate(null);
      return;
    }
    // Normal gate: remove it
    handleRemoveGate(qi, si);
  }, [circuits, handleRemoveGate]);

  const handleAddBarrier = useCallback((si) => {
    setBarriers(prev => prev.includes(si) ? prev : [...prev, si].sort((a, b) => a - b));
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  // ── Move gate: handles control pairing, cross-qubit rules ──
  // Moving a CONTROL dot moves the entire pair (target + control).
  // Moving a target with control also moves the control dot.
  // If EITHER destination slot is occupied, shift ALL threads right.
  const handleMoveGate = useCallback((fromQi, fromSi, toQi, toSi) => {
    setCircuits(prev => {
      let next = prev.map(r => [...r]);
      let gate = next[fromQi][fromSi];
      if (!gate) return prev;

      const isControlNode = gate.gate === 'CONTROL';

      if (isControlNode) {
        // ── Moving a CONTROL dot = move the whole pair ──
        // The user dragged the control dot. We treat this as moving the
        // target gate to the destination column, with the control dot
        // following on the toQi thread.
        const targetQi = gate.targetIndex;
        const targetGate = next[targetQi]?.[fromSi];
        if (!targetGate) return prev;

        // If dropping to a different qubit on the same column, just reassign control
        if (toSi === fromSi && toQi !== fromQi) {
          if (toQi === targetQi) {
            // Moving control dot to same qubit as target → disable controlled
            next[fromQi][fromSi] = null;
            next[targetQi][fromSi] = { ...targetGate, controlIndex: null };
            return next;
          }
          // Different qubit, same column — check if toQi slot is free
          if (next[toQi][fromSi] && next[toQi][fromSi] !== gate) {
            // Occupied: shift all right
            next = shiftAllColumnsRight(next, fromSi);
            setBarriers(b => b.map(bi => bi >= fromSi ? bi + 1 : bi));
            // Everything at fromSi shifted to fromSi+1
            next[toQi][fromSi + 1] = { gate: 'CONTROL', targetIndex: targetQi, controlIndex: null };
            next[targetQi][fromSi + 1] = { ...next[targetQi][fromSi + 1], controlIndex: toQi };
          } else {
            // Free: place directly
            next[fromQi][fromSi] = null;
            next[toQi][fromSi] = { gate: 'CONTROL', targetIndex: targetQi, controlIndex: null };
            next[targetQi][fromSi] = { ...targetGate, controlIndex: toQi };
          }
          return next;
        }

        // Different column: move the entire pair (target + control) to the new column
        const ctrlQi = toQi; // Control goes to the qubit we dropped on
        const tgtQi = targetQi; // Target stays on its own qubit

        // Remove both from old positions
        next[fromQi][fromSi] = null;
        next[tgtQi][fromSi] = null;

        // Check if moving control to same qubit as target
        if (ctrlQi === tgtQi) {
          // Disable controlled, just move the target gate
          const movedGate = { ...targetGate, controlIndex: null };
          if (next[tgtQi][toSi]) {
            next = shiftAllColumnsRight(next, toSi);
            setBarriers(b => b.map(bi => bi >= toSi ? bi + 1 : bi));
          }
          next[tgtQi][toSi] = movedGate;
          setSelectedGate({ qubitIndex: tgtQi, slotIndex: toSi, gate: movedGate });
          return next;
        }

        // Check BOTH destination slots
        const tgtOccupied = next[tgtQi][toSi] != null;
        const ctrlOccupied = next[ctrlQi][toSi] != null;

        if (tgtOccupied || ctrlOccupied) {
          // At least one slot is occupied: shift ALL right to make room
          next = shiftAllColumnsRight(next, toSi);
          setBarriers(b => b.map(bi => bi >= toSi ? bi + 1 : bi));
        }

        // Place target gate and control dot at the (now empty) destination
        const movedGate = { ...targetGate, controlIndex: ctrlQi };
        next[tgtQi][toSi] = movedGate;
        next[ctrlQi][toSi] = { gate: 'CONTROL', targetIndex: tgtQi, controlIndex: null };
        setSelectedGate({ qubitIndex: tgtQi, slotIndex: toSi, gate: movedGate });
        return next;
      }

      // ── Moving a regular gate ──
      const hasControl = gate.controlIndex !== undefined && gate.controlIndex !== null;
      const ctrlQi = hasControl ? gate.controlIndex : null;
      let ctrlGate = hasControl ? next[ctrlQi]?.[fromSi] : null;

      // Remove gate from old position
      next[fromQi][fromSi] = null;
      // Remove paired control dot from old position
      if (hasControl && ctrlGate) {
        next[ctrlQi][fromSi] = null;
      }

      // Check if moving to the same qubit as control → disable controlled
      if (hasControl && toQi === ctrlQi) {
        gate = { ...gate, controlIndex: null };
        ctrlGate = null;
      }

      if (!hasControl || !ctrlGate) {
        // No control pairing — simple move
        if (next[toQi][toSi]) {
          next = shiftAllColumnsRight(next, toSi);
          setBarriers(b => b.map(bi => bi >= toSi ? bi + 1 : bi));
        }
        next[toQi][toSi] = gate;
      } else {
        // Has control: check BOTH destination slots
        const tgtOccupied = next[toQi][toSi] != null;
        const ctrlOccupied = next[ctrlQi][toSi] != null;

        if (tgtOccupied || ctrlOccupied) {
          // At least one slot is occupied: shift ALL right to make room
          next = shiftAllColumnsRight(next, toSi);
          setBarriers(b => b.map(bi => bi >= toSi ? bi + 1 : bi));
        }

        // Place both at the (now empty) destination column
        next[toQi][toSi] = gate;
        next[ctrlQi][toSi] = { ...ctrlGate, targetIndex: toQi };
      }

      return next;
    });
    setSelectedGate(prev => ({ ...prev, qubitIndex: toQi, slotIndex: toSi }));
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  const handleAddQubit = useCallback(() => {
    setCircuits(prev => [...prev, []]);
    setQubitVisibility(prev => [...prev, true]);
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  const handleRemoveQubit = useCallback((qi) => {
    if (circuits.length <= 1) return;
    setCircuits(prev => {
      const next = prev.filter((_, i) => i !== qi);
      // Clean up control configs and CONTROL gates
      return next.map((row, newQi) =>
        row.map(gate => {
          if (!gate) return gate;

          // Remove CONTROL gates pointing to removed qubit
          if (gate.gate === 'CONTROL') {
            const originalTarget = gate.targetIndex;
            if (originalTarget === qi) return null; // Target was removed
            return {
              ...gate,
              targetIndex: originalTarget > qi ? originalTarget - 1 : originalTarget
            };
          }

          // Update controlIndex
          if (gate.controlIndex === undefined || gate.controlIndex === null) return gate;
          if (gate.controlIndex === qi) {
            return { ...gate, controlIndex: null };
          }
          return {
            ...gate,
            controlIndex: gate.controlIndex > qi ? gate.controlIndex - 1 : gate.controlIndex
          };
        })
      );
    });
    setQubitVisibility(prev => prev.filter((_, i) => i !== qi));
    setSelectedGate(null);
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, [circuits.length]);

  const handleToggleVisibility = useCallback((qi) => {
    setQubitVisibility(prev => { const n = [...prev]; n[qi] = !n[qi]; return n; });
    setVisibilityChangeToken(t => t + 1);
  }, []);

  const handleCycleInitialState = useCallback(() => {
    setInitialStateMode(prev => {
      if (prev === 'zero') return 'one';
      if (prev === 'one') return 'plus';
      return 'zero';
    });
    setVisibilityChangeToken(t => t + 1);
    setAnimationFrame(-1);
    setIsPlaying(false);
  }, []);

  const handleFocusQubit = useCallback((qi) => {
    setQubitVisibility(prev => { const n = [...prev]; n[qi] = true; return n; });
    setFocusQubit(qi);
    setTimeout(() => setFocusQubit(null), 50);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (isDraggingH && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setLeftPanelWidth(Math.min(Math.max(e.clientX - rect.left, 320), rect.width - 320));
      }
      if (isDraggingV && leftPanelRef.current) {
        const rect = leftPanelRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setConfigHeightPercent(Math.min(Math.max(pct, 30), 90));
      }
    };
    const onUp = () => { setIsDraggingH(false); setIsDraggingV(false); };
    if (isDraggingH || isDraggingV) {
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isDraggingH, isDraggingV]);

  const selectedGateData = selectedGate?.isBarrier ?
    { isBarrier: true, slot: selectedGate.slot } :
    selectedGate ? circuits[selectedGate.qubitIndex]?.[selectedGate.slotIndex] : null;

  if (showLanding) {
    return <QbitsLanding onStart={() => setShowLanding(false)} />;
  }

  return (
    <QbitsWorkspace
      containerRef={containerRef}
      leftPanelRef={leftPanelRef}
      leftPanelWidth={leftPanelWidth}
      configHeightPercent={configHeightPercent}
      isDraggingH={isDraggingH}
      isDraggingV={isDraggingV}
      onStartDragH={() => setIsDraggingH(true)}
      onStartDragV={() => setIsDraggingV(true)}
      circuits={circuits}
      barriers={barriers}
      qubitVisibility={qubitVisibility}
      selectedGate={selectedGate}
      highlightedBarrier={highlightedBarrier}
      isPlaying={isPlaying}
      animationFrame={animationFrame}
      initialStateMode={initialStateMode}
      barrierCount={barrierCount}
      totalFrames={totalFrames}
      segmentDurations={segmentDurations}
      probabilities={probabilities}
      allProbabilities={allProbabilities}
      qubitBranches={qubitBranches}
      focusQubit={focusQubit}
      allControlSignals={allControlSignals}
      visibilityChangeToken={visibilityChangeToken}
      selectedGateData={selectedGateData}
      onInsertGate={handleInsertGate}
      onRemoveGate={handleRemoveGate}
      onMoveGate={handleMoveGate}
      onGateClick={handleGateClick}
      onGateMiddleClick={handleGateMiddleClick}
      onAddQubit={handleAddQubit}
      onRemoveQubit={handleRemoveQubit}
      onToggleVisibility={handleToggleVisibility}
      onFocusQubit={handleFocusQubit}
      onAddBarrier={handleAddBarrier}
      onRemoveBarrier={handleRemoveBarrier}
      onCycleInitialState={handleCycleInitialState}
      onUpdateGate={handleUpdateGate}
      onControlSignal={handleControlSignal}
      onFrameChange={setAnimationFrame}
      onPlayPause={(playing) => {
        if (playing) setSelectedGate(null);
        setIsPlaying(playing);
      }}
    />
  );
}

export default App;
