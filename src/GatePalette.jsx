import { GATES, createGateInstance } from './quantum';
import './GatePalette.css';

export default function GatePalette() {
    // Separate gates and barrier (include I now)
    const gateList = Object.values(GATES).filter(g => !g.isBarrier);
    const barrier = GATES.BARRIER;

    const handleDragStart = (e, gate) => {
        // Create a full gate instance with matrix and decomposition
        const gateInstance = createGateInstance(gate.name);
        const gateData = {
            ...gateInstance,
            label: gate.label,
            color: gate.color,
            description: gate.description,
            isBarrier: gate.isBarrier || false
        };
        e.dataTransfer.setData('gate', JSON.stringify(gateData));
        e.dataTransfer.effectAllowed = 'copy';

        // Add a custom property for barrier detection
        if (gate.isBarrier) {
            e.dataTransfer.setData('barrier', 'true');
        }
    };

    return (
        <div className="gate-palette">
            <div className="palette-section">
                <h3 className="palette-title">Gates</h3>
                <div className="gates-grid">
                    {gateList.map(gate => (
                        <div
                            key={gate.name}
                            className={`gate-button ${gate.isParametric ? 'parametric' : ''}`}
                            style={{ '--gate-color': gate.color }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, gate)}
                            title={`${gate.description}\n(Drag to circuit)`}
                        >
                            {gate.label}
                        </div>
                    ))}
                </div>
            </div>

            {barrier && (
                <div className="palette-section barrier-section">
                    <h3 className="palette-title">Barrier</h3>
                    <div
                        className="barrier-button"
                        draggable
                        onDragStart={(e) => handleDragStart(e, barrier)}
                        title="Barrier - pauses animation\n(Drag between gates)"
                    >
                        <svg viewBox="0 0 24 40" width="16" height="28">
                            <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <line x1="12" y1="14" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <line x1="12" y1="26" x2="12" y2="32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            <line x1="12" y1="38" x2="12" y2="40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
}
