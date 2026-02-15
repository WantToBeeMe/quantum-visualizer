// Circuit Calculations Module
// Dedicated module for evaluating quantum circuits with all gates normalized to U-gate

import { GATES, STATE_ZERO, applyGate, stateToBlochCoords, cAbs, cPhase, complex } from './quantum.js';

/**
 * Get the effective U-gate parameters for any gate
 * All gates are internally treated as U gates for consistent behavior
 */
export const getUParams = (gate, customParams = null) => {
    const info = GATES[gate.gate] || gate;

    // If it's a U gate with custom params, use those
    if (info.isParametric && customParams) {
        return {
            theta: Number(customParams.theta) || 0,
            phi: Number(customParams.phi) || 0,
            lambda: Number(customParams.lambda) || 0
        };
    }

    // Use decomposition params if available
    if (info.decomposition && info.decomposition.params) {
        return {
            theta: Number(info.decomposition.params.theta) || 0,
            phi: Number(info.decomposition.params.phi) || 0,
            lambda: Number(info.decomposition.params.lambda) || 0
        };
    }

    // Identity gate
    return { theta: 0, phi: 0, lambda: 0 };
};

/**
 * Calculate rotation info for Bloch sphere animation
 * Returns compound rotation with theta, phi, lambda
 */
export const getRotationForGate = (gate) => {
    const params = getUParams(gate, gate.params);
    const hasTheta = Math.abs(params.theta) > 0.01;
    const hasPhi = Math.abs(params.phi) > 0.01;
    const hasLambda = Math.abs(params.lambda) > 0.01;

    if (hasTheta || hasPhi || hasLambda) {
        return {
            theta: params.theta,
            phi: params.phi,
            lambda: params.lambda,
            isCompound: true
        };
    }
    return null;
};

/**
 * Evaluate a single qubit through a list of gates
 * Returns array of branches with state, coordinates, probability, and rotations
 */
export const evaluateQubit = (gates, controlStates = null) => {
    const rotations = [];

    for (const gate of gates) {
        const rotation = getRotationForGate(gate);
        if (rotation) {
            rotations.push(rotation);
        }
    }

    // Check for controlled gates
    const controlledGate = gates.find(g => g.controlQubit !== undefined);
    const hasControl = !!controlledGate;

    if (!hasControl) {
        // Simple case: no control qubits
        let state = STATE_ZERO();
        for (const gate of gates) {
            const info = GATES[gate.gate] || gate;
            state = applyGate(state, info, gate.params);
        }
        return [{ state, coords: stateToBlochCoords(state), probability: 1, rotations }];
    }

    // Controlled gate case - needs control qubit state
    if (!controlStates) {
        // No control state info, return default
        let state = STATE_ZERO();
        for (const gate of gates) {
            const info = GATES[gate.gate] || gate;
            state = applyGate(state, info, gate.params);
        }
        return [{ state, coords: stateToBlochCoords(state), probability: 1, rotations }];
    }

    // Handle controlled gates with branching
    const ctrlSlot = controlledGate.slot;
    const ctrlIdx = controlledGate.controlQubit;

    // Evaluate with control qubit in |0⟩ (controlled gate doesn't fire)
    let state0 = STATE_ZERO();
    const rotations0 = [];
    for (const gate of gates) {
        const info = GATES[gate.gate] || gate;
        if (gate.controlQubit !== undefined) continue; // Skip controlled gate
        state0 = applyGate(state0, info, gate.params);
        const rotation = getRotationForGate(gate);
        if (rotation) rotations0.push(rotation);
    }

    // Evaluate with control qubit in |1⟩ (controlled gate fires)
    let state1 = STATE_ZERO();
    const rotations1 = [];
    for (const gate of gates) {
        const info = GATES[gate.gate] || gate;
        state1 = applyGate(state1, info, gate.params);
        const rotation = getRotationForGate(gate);
        if (rotation) rotations1.push(rotation);
    }

    // Get control qubit probabilities
    const [ctrlState] = controlStates[ctrlIdx] || [STATE_ZERO()];
    const prob0 = cAbs(ctrlState[0]) ** 2;
    const prob1 = cAbs(ctrlState[1]) ** 2;

    const branches = [];
    if (prob0 > 0.001) {
        branches.push({ state: state0, coords: stateToBlochCoords(state0), probability: prob0, rotations: rotations0 });
    }
    if (prob1 > 0.001) {
        branches.push({ state: state1, coords: stateToBlochCoords(state1), probability: prob1, rotations: rotations1 });
    }

    return branches;
};

/**
 * Format a quantum state as a mathematical string
 * Returns string like "0.707|0⟩ + 0.707|1⟩" or "(0.5+0.5i)|0⟩ + (0.5-0.5i)|1⟩"
 */
export const formatStateString = (state) => {
    const [alpha, beta] = state;

    const formatComplex = (c) => {
        const re = c.re;
        const im = c.im;
        const absRe = Math.abs(re);
        const absIm = Math.abs(im);

        if (absRe < 0.001 && absIm < 0.001) return '0';
        if (absIm < 0.001) return re.toFixed(3);
        if (absRe < 0.001) return `${im >= 0 ? '' : '-'}${absIm.toFixed(3)}i`;

        const sign = im >= 0 ? '+' : '-';
        return `(${re.toFixed(3)}${sign}${absIm.toFixed(3)}i)`;
    };

    const alphaStr = formatComplex(alpha);
    const betaStr = formatComplex(beta);

    const parts = [];
    if (alphaStr !== '0') {
        parts.push(`${alphaStr}|0⟩`);
    }
    if (betaStr !== '0') {
        const prefix = parts.length > 0 && !betaStr.startsWith('-') && !betaStr.startsWith('(') ? ' + ' : (parts.length > 0 ? ' ' : '');
        parts.push(`${prefix}${betaStr}|1⟩`);
    }

    return parts.length > 0 ? parts.join('') : '0';
};

/**
 * Check if two Bloch coordinates are approximately at the same position
 */
export const areCoordsOverlapping = (coords1, coords2, threshold = 0.1) => {
    const dx = coords1.x - coords2.x;
    const dy = coords1.y - coords2.y;
    const dz = coords1.z - coords2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < threshold;
};

/**
 * Assign depth offsets to branches to avoid visual overlap
 * Returns branches with added 'depthOffset' property (0, 1, 2, etc.)
 */
export const assignDepthOffsets = (branches) => {
    if (branches.length <= 1) {
        return branches.map(b => ({ ...b, depthOffset: 0 }));
    }

    const result = [];
    const assignedPositions = [];

    for (const branch of branches) {
        let offset = 0;
        // Check against already assigned branches
        for (const assigned of assignedPositions) {
            if (areCoordsOverlapping(branch.coords, assigned.coords)) {
                offset = Math.max(offset, assigned.offset + 1);
            }
        }
        assignedPositions.push({ coords: branch.coords, offset });
        result.push({ ...branch, depthOffset: offset });
    }

    return result;
};
