import { useState, useEffect } from 'react';
import { GATES, createU3Matrix, gateHasPhaseKickbackPotential } from './quantum';
import './GateSettings.css';

const parsePiNotation = (str) => {
    if (typeof str === 'number') return str;
    const s = str.toString().trim().toLowerCase().replace('π', 'pi');
    if (s === 'pi') return Math.PI;
    if (s === '-pi') return -Math.PI;
    const divMatch = s.match(/^(-?)pi\s*\/\s*(\d+)$/);
    if (divMatch) return (divMatch[1] === '-' ? -1 : 1) * Math.PI / parseInt(divMatch[2]);
    const mulMatch = s.match(/^(-?\d*\.?\d*)\s*\*?\s*pi$/);
    if (mulMatch) {
        const num = mulMatch[1] === '' || mulMatch[1] === '-' ? (mulMatch[1] === '-' ? -1 : 1) : parseFloat(mulMatch[1]);
        return num * Math.PI;
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
};

const toPiNotation = (rad) => {
    const pi = Math.PI;
    if (Math.abs(rad) < 0.001) return '0';
    if (Math.abs(rad - pi) < 0.001) return 'π';
    if (Math.abs(rad + pi) < 0.001) return '-π';
    if (Math.abs(rad - pi / 2) < 0.001) return 'π/2';
    if (Math.abs(rad + pi / 2) < 0.001) return '-π/2';
    if (Math.abs(rad - pi / 4) < 0.001) return 'π/4';
    if (Math.abs(rad + pi / 4) < 0.001) return '-π/4';
    return rad.toFixed(3);
};

export default function GateSettings({ gate, gateIndex, qubitIndex, onRemove, onUpdate, numQubits, onControlSignal }) {
    const [isControlled, setIsControlled] = useState(gate?.controlIndex !== undefined && gate?.controlIndex !== null);
    const [controlQubit, setControlQubit] = useState(gate?.controlIndex ?? -1);
    const [useSliders, setUseSliders] = useState(false);
    const [params, setParams] = useState({
        theta: gate?.decomposition?.theta || 0,
        phi: gate?.decomposition?.phi || 0,
        lambda: gate?.decomposition?.lambda || 0
    });
    const [paramStrings, setParamStrings] = useState({
        theta: toPiNotation(params.theta),
        phi: toPiNotation(params.phi),
        lambda: toPiNotation(params.lambda)
    });

    useEffect(() => {
        if (gate && !gate.isBarrier) {
            setIsControlled(gate.controlIndex !== undefined && gate.controlIndex !== null);
            setControlQubit(gate.controlIndex ?? -1);
            const newParams = {
                theta: gate.decomposition?.theta || 0,
                phi: gate.decomposition?.phi || 0,
                lambda: gate.decomposition?.lambda || 0
            };
            setParams(newParams);
            setParamStrings({
                theta: toPiNotation(newParams.theta),
                phi: toPiNotation(newParams.phi),
                lambda: toPiNotation(newParams.lambda)
            });
        }
    }, [gate, gateIndex, qubitIndex]);

    if (!gate) {
        return (
            <div className="gate-settings empty">
                <span className="placeholder">Click a gate to configure</span>
            </div>
        );
    }

    if (gate.isBarrier) {
        return (
            <div className="gate-settings">
                <div className="settings-header">
                    <div className="gate-badge barrier">┃</div>
                    <span className="gate-name">Barrier</span>
                </div>
                <div className="settings-actions">
                    <button className="action-btn remove" onClick={() => onRemove(qubitIndex, gateIndex)}>Remove</button>
                </div>
            </div>
        );
    }

    if (gate.gate === 'CONTROL') {
        return (
            <div className="gate-settings">
                <div className="settings-header">
                    <div className="gate-badge control-node"></div>
                    <span className="gate-name">Control Node</span>
                </div>
                <div className="settings-description">
                    Controls the gate at Qubit {gate.targetIndex}.
                </div>
                <div className="settings-actions">
                    <button className="action-btn remove" onClick={() => onRemove(qubitIndex, gateIndex)}>Remove Control</button>
                </div>
            </div>
        );
    }

    const gateInfo = GATES[gate.gate] || gate;
    const isParametric = gate.gate === 'U' || gateInfo.showDecomposition;
    const canDecompose = gate.gate !== 'U' && gateInfo.defaultDecomposition;

    const handleParamStringChange = (key, value) => setParamStrings(prev => ({ ...prev, [key]: value }));

    const handleParamBlur = (key) => {
        const parsed = parsePiNotation(paramStrings[key]);
        const newDecomp = { ...params, [key]: parsed };
        setParams(newDecomp);
        // Sync matrix with decomposition
        const newMatrix = createU3Matrix(newDecomp.theta, newDecomp.phi, newDecomp.lambda);
        onUpdate(qubitIndex, gateIndex, { ...gate, decomposition: newDecomp, matrix: newMatrix });
    };

    const handleSliderChange = (key, value) => {
        const numValue = parseFloat(value);
        const newDecomp = { ...params, [key]: numValue };
        setParams(newDecomp);
        setParamStrings(prev => ({ ...prev, [key]: toPiNotation(numValue) }));
        // Sync matrix with decomposition
        const newMatrix = createU3Matrix(newDecomp.theta, newDecomp.phi, newDecomp.lambda);
        onUpdate(qubitIndex, gateIndex, { ...gate, decomposition: newDecomp, matrix: newMatrix });
    };

    const handleControlChange = (checked) => {
        setIsControlled(checked);
        if (!checked) {
            setControlQubit(-1);
            onUpdate(qubitIndex, gateIndex, { ...gate, controlIndex: null });
        }
    };

    const handleControlQubitChange = (value) => {
        const ctrl = parseInt(value);
        setControlQubit(ctrl);
        if (ctrl >= 0) {
            onUpdate(qubitIndex, gateIndex, { ...gate, controlIndex: ctrl });
            // Trigger control signal animation
            if (onControlSignal) {
                const hasKickback = gateHasPhaseKickbackPotential(gate);
                onControlSignal(ctrl, qubitIndex, hasKickback, gateIndex, gate);
            }
        }
    };

    const handleDecompose = () => {
        if (gateInfo.defaultDecomposition) {
            // Switch to U gate, keep same matrix and decomposition
            onUpdate(qubitIndex, gateIndex, {
                ...gate,
                gate: 'U',
                label: 'U',
                color: GATES.U.color,
                description: GATES.U.description
                // matrix and decomposition stay the same
            });
        }
    };

    const availableControlQubits = Array.from({ length: numQubits }, (_, i) => i).filter(i => i !== qubitIndex);

    return (
        <div className="gate-settings">
            <div className="settings-header">
                <div className="gate-badge" style={{ '--gate-color': gate.color }}>{gate.label}</div>
                <span className="gate-name">{gateInfo.description}</span>
            </div>

            {isParametric && (
                <div className="param-section">
                    <div className="param-header">
                        <span>Parameters</span>
                        <label className="slider-toggle">
                            <input type="checkbox" checked={useSliders} onChange={e => setUseSliders(e.target.checked)} />
                            <span>Sliders</span>
                        </label>
                    </div>

                    {useSliders ? (
                        <div className="param-sliders">
                            {['theta', 'phi', 'lambda'].map(key => {
                                const tooltips = {
                                    theta: 'Tips the state vector away from the Z-axis (Y rotation)',
                                    phi: 'Rotates around the Z-axis after tilting',
                                    lambda: 'Rotates the starting point in XY plane before tilting'
                                };
                                return (
                                    <div key={key} className="slider-row">
                                        <label title={tooltips[key]}>{key === 'theta' ? 'θ' : key === 'phi' ? 'φ' : 'λ'}</label>
                                        <input type="range" min={-Math.PI} max={Math.PI} step={0.001} value={params[key]} onChange={e => handleSliderChange(key, e.target.value)} />
                                        <span className="slider-value">{toPiNotation(params[key])}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="param-grid">
                            {['theta', 'phi', 'lambda'].map(key => (
                                <div key={key} className="param-row">
                                    <label>{key === 'theta' ? 'θ' : key === 'phi' ? 'φ' : 'λ'}</label>
                                    <input type="text" value={paramStrings[key]} onChange={e => handleParamStringChange(key, e.target.value)} onBlur={() => handleParamBlur(key)} placeholder="π/4..." />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {numQubits > 1 && !gate.isBarrier && (
                <div className="control-section">
                    <label className="control-toggle">
                        <input type="checkbox" checked={isControlled} onChange={e => handleControlChange(e.target.checked)} />
                        <span>Controlled</span>
                    </label>
                    {isControlled && (
                        <div className="control-select">
                            {availableControlQubits.map(q => (
                                <button
                                    key={q}
                                    className={`control-qubit-btn ${controlQubit === q ? 'active' : ''}`}
                                    onClick={() => handleControlQubitChange(q)}
                                >
                                    q[{q}]
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="settings-actions">
                {canDecompose && <button className="action-btn decompose" onClick={handleDecompose}>→ U</button>}
                <button className="action-btn remove" onClick={() => onRemove(qubitIndex, gateIndex)}>Remove</button>
            </div>
        </div>
    );
}
