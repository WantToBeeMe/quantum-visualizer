import { useState, useMemo } from 'react';
import './ProbabilityBars.css';

const VIEW_MODES = ['all', 'presence', 'compact'];
const MODE_LABELS = { all: 'All', presence: 'Presence', compact: 'Compact' };

export default function ProbabilityBars({ probabilities, allProbabilities }) {
    const [viewMode, setViewMode] = useState('presence');

    const displayProbs = useMemo(() => {
        if (viewMode === 'all') {
            return allProbabilities;
        }

        // Filter out zeros
        const nonZero = allProbabilities.filter(p => p.probability > 0.001);

        if (viewMode === 'presence') {
            return nonZero;
        }

        // Compact mode: top 5, or 6 if exactly 6, else top 5 + "others"
        if (nonZero.length <= 6) {
            return nonZero;
        }

        // Top 5 + others
        const top5 = nonZero.slice(0, 5);
        const othersSum = nonZero.slice(5).reduce((sum, p) => sum + p.probability, 0);

        return [
            ...top5,
            { state: '**', probability: othersSum, isOthers: true }
        ];
    }, [viewMode, allProbabilities]);

    const cycleMode = () => {
        const idx = VIEW_MODES.indexOf(viewMode);
        setViewMode(VIEW_MODES[(idx + 1) % VIEW_MODES.length]);
    };

    return (
        <div className="probability-bars">
            <div className="prob-header">
                <h3 className="prob-title">Probabilities</h3>
                <button className="mode-toggle" onClick={cycleMode} title="Click to cycle view mode">
                    {MODE_LABELS[viewMode]}
                </button>
            </div>

            <div className="prob-container styled-scrollbar">
                {displayProbs.map(({ state, probability, isOthers }) => (
                    <div key={state} className={`prob-row ${probability < 0.001 ? 'zero-prob' : ''} ${isOthers ? 'others' : ''}`}>
                        <span className="prob-label">|{state}⟩</span>
                        <div className="prob-bar-track">
                            <div
                                className={`prob-bar ${isOthers ? 'others-bar' : ''}`}
                                style={{ width: `${probability * 100}%` }}
                            />
                        </div>
                        <span className="prob-value">{(probability * 100).toFixed(1)}%</span>
                    </div>
                ))}
                {displayProbs.length === 0 && (
                    <div className="prob-empty">No states</div>
                )}
            </div>
        </div>
    );
}
