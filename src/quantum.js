// Quantum simulation logic with multi-qubit support and entanglement

// Complex number operations
export const complex = (re, im = 0) => ({ re, im });
const SQRT2_INV = 1 / Math.sqrt(2);

export const cAdd = (a, b) => complex(a.re + b.re, a.im + b.im);
export const cSub = (a, b) => complex(a.re - b.re, a.im - b.im);
export const cMul = (a, b) => complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const cConj = (a) => complex(a.re, -a.im);
export const cAbs = (a) => Math.sqrt(a.re * a.re + a.im * a.im);
export const cPhase = (a) => Math.atan2(a.im, a.re);
export const cFromPolar = (r, theta) => complex(r * Math.cos(theta), r * Math.sin(theta));
export const cScale = (a, s) => complex(a.re * s, a.im * s);

// Normalize a qubit state
export const normalize = (state) => {
    const norm = Math.sqrt(cAbs(state[0]) ** 2 + cAbs(state[1]) ** 2);
    if (norm === 0) return [complex(1), complex(0)];
    return [
        complex(state[0].re / norm, state[0].im / norm),
        complex(state[1].re / norm, state[1].im / norm)
    ];
};

// Initial states
export const STATE_ZERO = () => [complex(1), complex(0)];
export const STATE_ONE = () => [complex(0), complex(1)];
export const STATE_PLUS = () => [complex(SQRT2_INV), complex(SQRT2_INV)];

export const getInitialQubitState = (mode = 'zero') => {
    if (mode === 'one') return STATE_ONE();
    if (mode === 'plus') return STATE_PLUS();
    return STATE_ZERO();
};

// Gate matrices

// Create U3 gate matrix from angles (theta, phi, lambda)
export const createU3Matrix = (theta, phi, lambda) => [
    [complex(Math.cos(theta / 2)), cScale(cFromPolar(1, -lambda), -Math.sin(theta / 2))],
    [cScale(cFromPolar(1, phi), Math.sin(theta / 2)), cScale(cFromPolar(1, phi + lambda), Math.cos(theta / 2))]
];

// Gate colors (pastel theme): I/X share the same green used by state vectors.
// All gates store both matrix and decomposition for unified handling
export const GATES = {
    I: {
        name: 'I',
        label: 'I',
        description: 'Identity - does nothing',
        color: '#8EFFE2',
        showDecomposition: false,
        animDuration: 0,
        defaultMatrix: [[complex(1), complex(0)], [complex(0), complex(1)]],
        defaultDecomposition: { theta: 0, phi: 0, lambda: 0 }
    },
    X: {
        name: 'X',
        label: 'X',
        description: 'Pauli-X (NOT) - π rotation around X axis',
        color: '#8EFFE2',
        showDecomposition: false,
        animDuration: 1,
        defaultMatrix: [[complex(0), complex(1)], [complex(1), complex(0)]],
        defaultDecomposition: { theta: Math.PI, phi: 0, lambda: Math.PI }
    },
    Y: {
        name: 'Y',
        label: 'Y',
        description: 'Pauli-Y - π rotation around Y axis',
        color: '#B08CFF',
        showDecomposition: false,
        animDuration: 1,
        defaultMatrix: [[complex(0), complex(0, -1)], [complex(0, 1), complex(0)]],
        defaultDecomposition: { theta: Math.PI, phi: Math.PI / 2, lambda: Math.PI / 2 }
    },
    Z: {
        name: 'Z',
        label: 'Z',
        description: 'Pauli-Z - π rotation around Z axis (phase flip)',
        color: '#4DBAF5',
        showDecomposition: false,
        animDuration: 1,
        defaultMatrix: [[complex(1), complex(0)], [complex(0), complex(-1)]],
        defaultDecomposition: { theta: 0, phi: 0, lambda: Math.PI }
    },
    H: {
        name: 'H',
        label: 'H',
        description: 'Hadamard - creates superposition',
        color: '#FE2048',
        showDecomposition: false,
        animDuration: 1,
        defaultMatrix: [[complex(SQRT2_INV), complex(SQRT2_INV)], [complex(SQRT2_INV), complex(-SQRT2_INV)]],
        defaultDecomposition: { theta: Math.PI / 2, phi: 0, lambda: Math.PI }
    },
    S: {
        name: 'S',
        label: 'S',
        description: 'S gate - π/2 rotation around Z axis',
        color: '#4DBAF5',
        showDecomposition: false,
        animDuration: 0.5,
        defaultMatrix: [[complex(1), complex(0)], [complex(0), complex(0, 1)]],
        defaultDecomposition: { theta: 0, phi: 0, lambda: Math.PI / 2 }
    },
    T: {
        name: 'T',
        label: 'T',
        description: 'T gate - π/4 rotation around Z axis',
        color: '#4DBAF5',
        showDecomposition: false,
        animDuration: 0.25,
        defaultMatrix: [[complex(1), complex(0)], [complex(0), cFromPolar(1, Math.PI / 4)]],
        defaultDecomposition: { theta: 0, phi: 0, lambda: Math.PI / 4 }
    },
    U: {
        name: 'U',
        label: 'U',
        description: 'Universal gate - U(θ, φ, λ)',
        color: '#FFD80D',
        showDecomposition: true,
        animDuration: null, // Computed from params
        defaultMatrix: [[complex(1), complex(0)], [complex(0), complex(1)]], // Identity by default
        defaultDecomposition: { theta: 0, phi: 0, lambda: 0 }
    },
    BARRIER: {
        name: 'BARRIER',
        label: '┃',
        description: 'Barrier - visual separator',
        color: '#D7D9E0',
        isBarrier: true,
        showDecomposition: false,
        animDuration: 0,
        defaultMatrix: [[complex(1), complex(0)], [complex(0), complex(1)]],
        defaultDecomposition: { theta: 0, phi: 0, lambda: 0 }
    }
};

// Apply a matrix to a qubit state (core calculation)
export const applyMatrix = (state, matrix) => {
    if (!matrix) return state;
    return normalize([
        cAdd(cMul(matrix[0][0], state[0]), cMul(matrix[0][1], state[1])),
        cAdd(cMul(matrix[1][0], state[0]), cMul(matrix[1][1], state[1]))
    ]);
};

// Create a circuit gate object with both matrix and decomposition
export const createGateInstance = (gateName, decomposition = null) => {
    const gateRef = GATES[gateName];
    if (!gateRef) return null;

    const decomp = decomposition || { ...gateRef.defaultDecomposition };
    const matrix = gateName === 'U' || decomposition
        ? createU3Matrix(decomp.theta, decomp.phi, decomp.lambda)
        : gateRef.defaultMatrix.map(row => row.map(c => ({ ...c })));

    return {
        gate: gateName,
        matrix,
        decomposition: decomp,
        controlIndex: null
    };
};

// Update matrix from decomposition (call when sliders change)
export const updateMatrixFromDecomposition = (gateInstance) => {
    const { theta, phi, lambda } = gateInstance.decomposition;
    gateInstance.matrix = createU3Matrix(theta, phi, lambda);
    return gateInstance;
};

// Apply a gate instance to a state
export const applyGate = (state, gateInstance) => {
    if (gateInstance.gate === 'BARRIER') return state;
    return applyMatrix(state, gateInstance.matrix);
};

// Get rotation info for animation
export const getRotationInfo = (gate, params = null) => {
    if (gate.rotation) return gate.rotation;
    if (gate.isParametric && params) {
        // U gate rotation is complex, approximate with main theta rotation
        if (Math.abs(params.theta) > 0.01) {
            return { axis: 'y', angle: params.theta };
        }
        if (Math.abs(params.lambda) > 0.01) {
            return { axis: 'z', angle: params.lambda };
        }
    }
    return null;
};

// Calculate measurement probabilities for a single qubit
export const getProbabilities = (state) => {
    const prob0 = cAbs(state[0]) ** 2;
    const prob1 = cAbs(state[1]) ** 2;
    return { prob0, prob1 };
};

const normalizeAngle = (angle) => {
    let a = angle;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
};

const complexDiv = (a, b) => {
    const den = b.re * b.re + b.im * b.im;
    if (den < 1e-12) return complex(0, 0);
    return complex(
        (a.re * b.re + a.im * b.im) / den,
        (a.im * b.re - a.re * b.im) / den
    );
};

// Returns target-gate eigenphase phi when U|psi> = e^(i*phi)|psi>, else null.
export const getKickbackPhaseForControlledGate = (targetGate, targetStateBefore, tolerance = 0.01) => {
    if (!targetGate || targetGate.gate === 'BARRIER' || targetGate.gate === 'CONTROL' || !targetGate.matrix) {
        return null;
    }

    const state = targetStateBefore || STATE_ZERO();
    const evolved = applyMatrix(state, targetGate.matrix);
    const referenceIdx = state.findIndex(amp => cAbs(amp) > tolerance);
    if (referenceIdx < 0) return null;

    const rawPhase = complexDiv(evolved[referenceIdx], state[referenceIdx]);
    const rawMag = cAbs(rawPhase);
    if (rawMag <= tolerance) return null;

    const unitPhase = cScale(rawPhase, 1 / rawMag);
    for (let i = 0; i < state.length; i++) {
        const expected = cMul(unitPhase, state[i]);
        const diff = cAbs(cSub(evolved[i], expected));
        if (diff > tolerance * 2) return null;
    }

    const phase = normalizeAngle(cPhase(unitPhase));
    return Math.abs(phase) > tolerance ? phase : 0;
};

// True when a gate can produce visible phase kickback in this visualizer.
// We treat phase-only controlled operations as kickback-capable.
export const gateHasPhaseKickbackPotential = (gateInstance, tolerance = 0.01) => {
    if (!gateInstance || gateInstance.gate === 'BARRIER' || gateInstance.gate === 'CONTROL') {
        return false;
    }

    if (['Z', 'S', 'T'].includes(gateInstance.gate)) {
        return true;
    }

    if (gateInstance.gate !== 'U' || !gateInstance.decomposition) {
        return false;
    }

    const { theta = 0, phi = 0, lambda = 0 } = gateInstance.decomposition;
    if (Math.abs(theta) > tolerance) {
        return false;
    }

    const relativePhase = normalizeAngle(phi + lambda);
    return Math.abs(relativePhase) > tolerance;
};

// Calculate combined probabilities for multiple independent qubits
export const getMultiQubitProbabilities = (qubitStates, includeZero = true) => {
    const numQubits = qubitStates.length;
    const numStates = Math.pow(2, numQubits);
    const results = [];

    for (let i = 0; i < numStates; i++) {
        let prob = 1;
        let stateLabel = '';

        for (let q = 0; q < numQubits; q++) {
            const bit = (i >> (numQubits - 1 - q)) & 1;
            stateLabel += bit;
            const qubitProbs = getProbabilities(qubitStates[q]);
            prob *= bit === 0 ? qubitProbs.prob0 : qubitProbs.prob1;
        }

        if (includeZero || prob > 0.001) {
            results.push({ state: stateLabel, probability: prob });
        }
    }

    results.sort((a, b) => b.probability - a.probability);
    return results;
};

// Extract rotation parameters (theta, phi, lambda) from a 2x2 unitary matrix
// Uses ZYZ decomposition: U = e^(iα) * Rz(φ) * Ry(θ) * Rz(λ)
export const extractRotationFromMatrix = (matrix) => {
    if (!matrix || !matrix[0] || !matrix[1]) return { theta: 0, phi: 0, lambda: 0 };

    const [[a, b], [c, d]] = matrix;

    // Magnitude of a (should equal cos(theta/2))
    const aMag = cAbs(a);
    const cMag = cAbs(c);

    // Handle edge cases
    if (aMag < 0.0001) {
        // theta = π (a ≈ 0)
        const theta = Math.PI;
        const phi = cPhase(c);
        const lambda = -cPhase(b);
        return { theta, phi, lambda };
    }

    if (cMag < 0.0001) {
        // theta = 0 (c ≈ 0, identity-like)
        const phiPlusLambda = cPhase(d) - cPhase(a);
        return { theta: 0, phi: phiPlusLambda / 2, lambda: phiPlusLambda / 2 };
    }

    // General case
    const theta = 2 * Math.acos(Math.min(1, aMag));

    // Extract phases
    const aPhase = cPhase(a);
    const cPhase_ = cPhase(c);
    const bPhase = cPhase(b);

    // phi + lambda = phase(d) - phase(a) (global phase adjusted)
    // phi - lambda = phase(c) - phase(b) + π
    const phi = cPhase_;
    const lambda = -bPhase;

    return { theta, phi, lambda };
};

// Convert qubit state to Bloch sphere coordinates
export const stateToBlochCoords = (state) => {
    const [alpha, beta] = state;

    const prob0 = cAbs(alpha) ** 2;
    const theta = 2 * Math.acos(Math.sqrt(Math.max(0, Math.min(1, prob0))));

    const alphaPhase = cPhase(alpha);
    const betaPhase = cPhase(beta);
    const phi = betaPhase - alphaPhase;

    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);

    return { x, y, z, theta, phi };
};

// Format angle for display
export const formatAngle = (rad) => {
    const pi = Math.PI;
    if (Math.abs(rad) < 0.001) return '0';
    if (Math.abs(rad - pi) < 0.001) return 'π';
    if (Math.abs(rad + pi) < 0.001) return '-π';
    if (Math.abs(rad - pi / 2) < 0.001) return 'π/2';
    if (Math.abs(rad + pi / 2) < 0.001) return '-π/2';
    if (Math.abs(rad - pi / 4) < 0.001) return 'π/4';
    if (Math.abs(rad + pi / 4) < 0.001) return '-π/4';
    return rad.toFixed(2);
};
