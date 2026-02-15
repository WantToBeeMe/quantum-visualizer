import { describe, it, expect } from 'vitest';
import {
    complex,
    cAdd,
    cSub,
    cMul,
    cAbs,
    createGateInstance,
    createU3Matrix,
    gateHasPhaseKickbackPotential,
    getKickbackPhaseForControlledGate
} from './quantum.js';

const SQRT1_2 = 1 / Math.sqrt(2);
const TOL = 1e-6;

const complexDiv = (a, b) => {
    const den = b.re * b.re + b.im * b.im;
    return complex(
        (a.re * b.re + a.im * b.im) / den,
        (a.im * b.re - a.re * b.im) / den
    );
};

const applySingleQubitGate = (state, matrix, qubitIndex) => {
    const out = [...state];
    const pairs = qubitIndex === 0
        ? [[0, 2], [1, 3]]
        : [[0, 1], [2, 3]];

    for (const [i0, i1] of pairs) {
        const a0 = state[i0];
        const a1 = state[i1];
        out[i0] = cAdd(cMul(matrix[0][0], a0), cMul(matrix[0][1], a1));
        out[i1] = cAdd(cMul(matrix[1][0], a0), cMul(matrix[1][1], a1));
    }
    return out;
};

const applyControlledTargetGate = (state, targetMatrix) => {
    const out = [...state];
    const a10 = state[2];
    const a11 = state[3];
    out[2] = cAdd(cMul(targetMatrix[0][0], a10), cMul(targetMatrix[0][1], a11));
    out[3] = cAdd(cMul(targetMatrix[1][0], a10), cMul(targetMatrix[1][1], a11));
    return out;
};

const runCircuit = (steps) => {
    let state = [complex(1), complex(0), complex(0), complex(0)]; // |00>
    for (const step of steps) {
        if (step.type === 'single') {
            state = applySingleQubitGate(state, step.matrix, step.qubit);
        } else if (step.type === 'controlled') {
            state = applyControlledTargetGate(state, step.targetMatrix);
        }
    }
    return state;
};

const expectStateEquivalentUpToGlobalPhase = (actual, expected, tol = TOL) => {
    const idx = expected.findIndex(a => cAbs(a) > tol);
    expect(idx).toBeGreaterThanOrEqual(0);

    const phase = complexDiv(actual[idx], expected[idx]);
    for (let i = 0; i < expected.length; i++) {
        const rotatedExpected = cMul(phase, expected[i]);
        const diff = cSub(actual[i], rotatedExpected);
        expect(cAbs(diff)).toBeLessThan(tol);
    }
};

describe('phase kickback regression circuits', () => {
    it('CZ kicks phase back onto control when target is |1>', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const Z = createGateInstance('Z').matrix;

        const actual = runCircuit([
            { type: 'single', qubit: 0, matrix: H }, // control: |+>
            { type: 'single', qubit: 1, matrix: X }, // target: |1>
            { type: 'controlled', targetMatrix: Z }  // CZ
        ]);

        // Expected: |->|1> = (|01> - |11>) / sqrt(2)
        const expected = [
            complex(0),
            complex(SQRT1_2),
            complex(0),
            complex(-SQRT1_2)
        ];

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });

    it('CS on target |1> produces +pi/2 phase on control |1> branch', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const S = createGateInstance('S').matrix;

        const actual = runCircuit([
            { type: 'single', qubit: 0, matrix: H }, // control: |+>
            { type: 'single', qubit: 1, matrix: X }, // target: |1>
            { type: 'controlled', targetMatrix: S }  // CS
        ]);

        // Expected: (|01> + i|11>) / sqrt(2)
        const expected = [
            complex(0),
            complex(SQRT1_2),
            complex(0),
            complex(0, SQRT1_2)
        ];

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });

    it('phase-only CU also kicks back expected control phase', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const UPhase = createU3Matrix(0, Math.PI / 3, Math.PI / 6); // phi+lambda = pi/2

        const actual = runCircuit([
            { type: 'single', qubit: 0, matrix: H },      // control: |+>
            { type: 'single', qubit: 1, matrix: X },      // target: |1>
            { type: 'controlled', targetMatrix: UPhase }  // CU_phase
        ]);

        // Expected: (|01> + i|11>) / sqrt(2)
        const expected = [
            complex(0),
            complex(SQRT1_2),
            complex(0),
            complex(0, SQRT1_2)
        ];

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });

    it('no kickback when target is not a phase-eigenstate (CZ with target |0>)', () => {
        const H = createGateInstance('H').matrix;
        const Z = createGateInstance('Z').matrix;

        const actual = runCircuit([
            { type: 'single', qubit: 0, matrix: H }, // control: |+>
            { type: 'controlled', targetMatrix: Z }  // CZ, target starts in |0>
        ]);

        // Expected unchanged control: |+>|0> = (|00> + |10>) / sqrt(2)
        const expected = [
            complex(SQRT1_2),
            complex(0),
            complex(SQRT1_2),
            complex(0)
        ];

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });
});

describe('kickback gate classification', () => {
    it('accepts only phase-only target gates as kickback-capable', () => {
        expect(gateHasPhaseKickbackPotential(createGateInstance('Z'))).toBe(true);
        expect(gateHasPhaseKickbackPotential(createGateInstance('S'))).toBe(true);
        expect(gateHasPhaseKickbackPotential(createGateInstance('T'))).toBe(true);

        expect(gateHasPhaseKickbackPotential(createGateInstance('X'))).toBe(false);
        expect(gateHasPhaseKickbackPotential(createGateInstance('H'))).toBe(false);

        const phaseU = createGateInstance('U', { theta: 0, phi: Math.PI / 8, lambda: Math.PI / 8 });
        const cancelPhaseU = createGateInstance('U', { theta: 0, phi: Math.PI / 8, lambda: -Math.PI / 8 });
        const nonPhaseU = createGateInstance('U', { theta: Math.PI / 3, phi: 0, lambda: 0 });

        expect(gateHasPhaseKickbackPotential(phaseU)).toBe(true);
        expect(gateHasPhaseKickbackPotential(cancelPhaseU)).toBe(false);
        expect(gateHasPhaseKickbackPotential(nonPhaseU)).toBe(false);
    });
});

describe('kickback phase extraction from target eigenstates', () => {
    it('captures CNOT kickback when target is |->', () => {
        const X = createGateInstance('X');
        const minus = [complex(SQRT1_2), complex(-SQRT1_2)];
        const phase = getKickbackPhaseForControlledGate(X, minus);
        expect(phase).not.toBeNull();
        expect(Math.abs(Math.abs(phase) - Math.PI)).toBeLessThan(1e-6);
    });

    it('returns no visible kickback for CNOT target |+>', () => {
        const X = createGateInstance('X');
        const plus = [complex(SQRT1_2), complex(SQRT1_2)];
        const phase = getKickbackPhaseForControlledGate(X, plus);
        expect(phase).toBe(0);
    });

    it('returns null when target is not an eigenstate of controlled gate', () => {
        const X = createGateInstance('X');
        const zero = [complex(1), complex(0)];
        const phase = getKickbackPhaseForControlledGate(X, zero);
        expect(phase).toBeNull();
    });
});
