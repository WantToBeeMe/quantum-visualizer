import React, { useState } from 'react';
import './StateDisplay.css';

/**
 * Format a complex number for display
 */
const formatComplex = (c) => {
    const re = c.re;
    const im = c.im;
    const absRe = Math.abs(re);
    const absIm = Math.abs(im);

    if (absRe < 0.001 && absIm < 0.001) return '0';
    if (absIm < 0.001) return re.toFixed(3);
    if (absRe < 0.001) return `${im >= 0 ? '' : '-'}${absIm.toFixed(3)}i`;

    const sign = im >= 0 ? '+' : '-';
    return `${re.toFixed(3)}${sign}${absIm.toFixed(3)}i`;
};

/**
 * Format a quantum state as mathematical notation
 */
const formatStateString = (state) => {
    if (!state || state.length < 2) return '|0⟩';
    const [alpha, beta] = state;

    const alphaStr = formatComplex(alpha);
    const betaStr = formatComplex(beta);

    const parts = [];
    if (alphaStr !== '0') {
        parts.push({ coef: alphaStr, ket: '|0⟩' });
    }
    if (betaStr !== '0') {
        parts.push({ coef: betaStr, ket: '|1⟩' });
    }

    if (parts.length === 0) return '0';
    return parts;
};

/**
 * Format phase angle for display
 */
const formatPhase = (radians) => {
    if (Math.abs(radians) < 0.01) return null;
    const degrees = (radians * 180 / Math.PI).toFixed(0);
    return `${degrees}°`;
};

/**
 * Get total phases from rotations
 */
const getTotalPhases = (rotations) => {
    let lambda = 0, phi = 0;
    for (const r of rotations || []) {
        lambda += r.lambda || 0;
        phi += r.phi || 0;
    }
    return { lambda, phi };
};

function StateDisplay({ qubitStates }) {
    const [collapsed, setCollapsed] = useState(false);

    if (!qubitStates || qubitStates.length === 0) {
        return null;
    }

    return (
        <div className="state-display">
            <div className="state-display-header">
                <h4>Mathematical State</h4>
                <button
                    className="collapse-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? 'Expand' : 'Collapse'}
                >
                    {collapsed ? '▼' : '▲'}
                </button>
            </div>
            {!collapsed && (
                <div className="state-equations">
                    {qubitStates.map((branches, qIdx) => {
                        const branchList = branches && branches.length > 0 ? branches : [];

                        return (
                            <div key={qIdx} className="qubit-state-container">
                                <span className="qubit-label">q{qIdx}:</span>
                                <div className="branch-list">
                                    {branchList.map((branch, bIdx) => {
                                        const parts = formatStateString(branch.state);
                                        const probPercent = (branch.probability * 100).toFixed(0);
                                        const phases = getTotalPhases(branch.rotations);
                                        const lambdaStr = formatPhase(phases.lambda);
                                        const phiStr = formatPhase(phases.phi);
                                        const hasPhase = lambdaStr || phiStr;

                                        return (
                                            <div key={bIdx} className="branch-row">
                                                {branchList.length > 1 && (
                                                    <span className="branch-probability">{probPercent}%</span>
                                                )}
                                                <span className="state-equation">
                                                    {Array.isArray(parts) ? parts.map((p, i) => (
                                                        <React.Fragment key={i}>
                                                            {i > 0 && <span className="operator"> + </span>}
                                                            <span className="coefficient">{p.coef}</span>
                                                            <span className="ket">{p.ket}</span>
                                                        </React.Fragment>
                                                    )) : <span className="ket">{parts}</span>}
                                                </span>
                                                {hasPhase && branchList.length > 1 && (
                                                    <span className="phase-indicator">
                                                        {lambdaStr && <span className="lambda-phase" title="Lambda phase">λ:{lambdaStr}</span>}
                                                        {phiStr && <span className="phi-phase" title="Phi phase">φ:{phiStr}</span>}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default StateDisplay;
