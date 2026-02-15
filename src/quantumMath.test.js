import { describe, it, expect } from 'vitest';
import {
    complex,
    cAdd,
    cSub,
    cMul,
    cAbs,
    cFromPolar,
    createGateInstance,
    getInitialQubitState
} from './quantum.js';

const TOL = 1e-6;
const SQRT1_2 = 1 / Math.sqrt(2);

const cScale = (a, s) => complex(a.re * s, a.im * s);

const complexDiv = (a, b) => {
    const den = b.re * b.re + b.im * b.im;
    return complex(
        (a.re * b.re + a.im * b.im) / den,
        (a.im * b.re - a.re * b.im) / den
    );
};

const expectComplexClose = (actual, expected, tol = TOL) => {
    expect(Math.abs(actual.re - expected.re)).toBeLessThan(tol);
    expect(Math.abs(actual.im - expected.im)).toBeLessThan(tol);
};

const expectStateClose = (actual, expected, tol = TOL) => {
    expect(actual.length).toBe(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expectComplexClose(actual[i], expected[i], tol);
    }
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

const applySingleQubitGate = (state, matrix, qubitIndex, numQubits) => {
    const out = [...state];
    const bitMask = 1 << (numQubits - 1 - qubitIndex);

    for (let i = 0; i < state.length; i++) {
        if ((i & bitMask) !== 0) continue;
        const j = i | bitMask;
        const a0 = state[i];
        const a1 = state[j];
        out[i] = cAdd(cMul(matrix[0][0], a0), cMul(matrix[0][1], a1));
        out[j] = cAdd(cMul(matrix[1][0], a0), cMul(matrix[1][1], a1));
    }
    return out;
};

const applyControlledGate = (state, targetMatrix, controlQubit, targetQubit, numQubits) => {
    const out = [...state];
    const controlMask = 1 << (numQubits - 1 - controlQubit);
    const targetMask = 1 << (numQubits - 1 - targetQubit);

    for (let i = 0; i < state.length; i++) {
        if ((i & controlMask) === 0) continue;
        if ((i & targetMask) !== 0) continue;

        const j = i | targetMask;
        const a0 = state[i];
        const a1 = state[j];
        out[i] = cAdd(cMul(targetMatrix[0][0], a0), cMul(targetMatrix[0][1], a1));
        out[j] = cAdd(cMul(targetMatrix[1][0], a0), cMul(targetMatrix[1][1], a1));
    }
    return out;
};

const runCircuit = (numQubits, steps) => {
    let state = Array.from({ length: 1 << numQubits }, (_, i) => i === 0 ? complex(1) : complex(0));
    for (const step of steps) {
        if (step.type === 'single') {
            state = applySingleQubitGate(state, step.matrix, step.qubit, numQubits);
        } else if (step.type === 'controlled') {
            state = applyControlledGate(state, step.targetMatrix, step.control, step.target, numQubits);
        }
    }
    return state;
};

const tensorProduct = (states) => {
    let result = [complex(1)];
    for (const state of states) {
        const next = [];
        for (const a of result) {
            for (const b of state) {
                next.push(cMul(a, b));
            }
        }
        result = next;
    }
    return result;
};

describe('single-qubit gate mathematics', () => {
    it('maps basis states correctly for I, X, Y, Z, H, S, T', () => {
        const zero = [complex(1), complex(0)];
        const one = [complex(0), complex(1)];

        const I = createGateInstance('I').matrix;
        const X = createGateInstance('X').matrix;
        const Y = createGateInstance('Y').matrix;
        const Z = createGateInstance('Z').matrix;
        const H = createGateInstance('H').matrix;
        const S = createGateInstance('S').matrix;
        const T = createGateInstance('T').matrix;

        expectStateClose(applySingleQubitGate(zero, I, 0, 1), zero);
        expectStateClose(applySingleQubitGate(one, I, 0, 1), one);

        expectStateClose(applySingleQubitGate(zero, X, 0, 1), one);
        expectStateClose(applySingleQubitGate(one, X, 0, 1), zero);

        expectStateClose(applySingleQubitGate(zero, Y, 0, 1), [complex(0), complex(0, 1)]);
        expectStateClose(applySingleQubitGate(one, Y, 0, 1), [complex(0, -1), complex(0)]);

        expectStateClose(applySingleQubitGate(zero, Z, 0, 1), zero);
        expectStateClose(applySingleQubitGate(one, Z, 0, 1), [complex(0), complex(-1)]);

        expectStateClose(applySingleQubitGate(zero, H, 0, 1), [complex(SQRT1_2), complex(SQRT1_2)]);
        expectStateClose(applySingleQubitGate(one, H, 0, 1), [complex(SQRT1_2), complex(-SQRT1_2)]);

        expectStateClose(applySingleQubitGate(one, S, 0, 1), [complex(0), complex(0, 1)]);
        expectStateClose(applySingleQubitGate(one, T, 0, 1), [complex(0), cFromPolar(1, Math.PI / 4)]);
    });

    it('matches analytical U(θ, φ, λ) action on |0> and |1>', () => {
        const theta = 1.1;
        const phi = -0.7;
        const lambda = 0.35;
        const U = createGateInstance('U', { theta, phi, lambda }).matrix;
        const zero = [complex(1), complex(0)];
        const one = [complex(0), complex(1)];

        const onZero = applySingleQubitGate(zero, U, 0, 1);
        const onOne = applySingleQubitGate(one, U, 0, 1);

        const expectedOnZero = [
            complex(Math.cos(theta / 2)),
            cScale(cFromPolar(1, phi), Math.sin(theta / 2))
        ];
        const expectedOnOne = [
            cScale(cFromPolar(1, -lambda), -Math.sin(theta / 2)),
            cScale(cFromPolar(1, phi + lambda), Math.cos(theta / 2))
        ];

        expectStateClose(onZero, expectedOnZero);
        expectStateClose(onOne, expectedOnOne);
    });

    it('supports initial-state modes zero/one/plus', () => {
        const zero = getInitialQubitState('zero');
        const one = getInitialQubitState('one');
        const plus = getInitialQubitState('plus');
        const fallback = getInitialQubitState('not-a-mode');

        expectStateClose(zero, [complex(1), complex(0)]);
        expectStateClose(one, [complex(0), complex(1)]);
        expectStateClose(plus, [complex(SQRT1_2), complex(SQRT1_2)]);
        expectStateClose(fallback, zero);
    });
});

describe('larger multi-qubit circuit mathematics', () => {
    it('builds a 3-qubit GHZ state', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const actual = runCircuit(3, [
            { type: 'single', qubit: 0, matrix: H },
            { type: 'controlled', control: 0, target: 1, targetMatrix: X },
            { type: 'controlled', control: 1, target: 2, targetMatrix: X }
        ]);

        const expected = Array.from({ length: 8 }, () => complex(0));
        expected[0] = complex(SQRT1_2); // |000>
        expected[7] = complex(SQRT1_2); // |111>
        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });

    it('builds a phased 4-qubit Bell-pair product circuit', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const S = createGateInstance('S').matrix;
        const T = createGateInstance('T').matrix;
        const Z = createGateInstance('Z').matrix;

        const actual = runCircuit(4, [
            { type: 'single', qubit: 0, matrix: H },
            { type: 'single', qubit: 2, matrix: H },
            { type: 'controlled', control: 0, target: 1, targetMatrix: X },
            { type: 'controlled', control: 2, target: 3, targetMatrix: X },
            { type: 'single', qubit: 1, matrix: S },
            { type: 'single', qubit: 3, matrix: T },
            { type: 'single', qubit: 0, matrix: Z }
        ]);

        const expected = Array.from({ length: 16 }, () => complex(0));
        expected[0] = complex(0.5); // |0000>
        expected[3] = cScale(cFromPolar(1, Math.PI / 4), 0.5); // |0011>
        expected[12] = cScale(complex(0, -1), 0.5); // |1100>
        expected[15] = cScale(cFromPolar(1, -Math.PI / 4), 0.5); // |1111>

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });

    it('propagates CNOT kickback correctly inside a 3-qubit chain', () => {
        const H = createGateInstance('H').matrix;
        const X = createGateInstance('X').matrix;
        const S = createGateInstance('S').matrix;

        const actual = runCircuit(3, [
            { type: 'single', qubit: 0, matrix: H }, // q0: |+>
            { type: 'single', qubit: 1, matrix: X }, // q1: |1>
            { type: 'single', qubit: 1, matrix: H }, // q1: |->
            { type: 'controlled', control: 0, target: 1, targetMatrix: X }, // kickback -> q0 becomes |->
            { type: 'single', qubit: 2, matrix: H }, // q2: |+>
            { type: 'single', qubit: 2, matrix: S }  // q2: (|0> + i|1>)/sqrt(2)
        ]);

        const minus = [complex(SQRT1_2), complex(-SQRT1_2)];
        const sPlus = [complex(SQRT1_2), complex(0, SQRT1_2)];
        const expected = tensorProduct([minus, minus, sPlus]);

        expectStateEquivalentUpToGlobalPhase(actual, expected);
    });
});
