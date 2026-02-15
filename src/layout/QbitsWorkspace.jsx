import BlochSphereView from '../BlochSphere';
import GatePalette from '../GatePalette';
import CircuitBuilder from '../CircuitBuilder';
import GateSettings from '../GateSettings';
import AnimationPlayer from '../AnimationPlayer';
import ProbabilityBars from '../ProbabilityBars';
import StateDisplay from '../StateDisplay';

export default function QbitsWorkspace({
    containerRef,
    leftPanelRef,
    leftPanelWidth,
    configHeightPercent,
    isDraggingH,
    isDraggingV,
    onStartDragH,
    onStartDragV,
    circuits,
    barriers,
    qubitVisibility,
    selectedGate,
    highlightedBarrier,
    isPlaying,
    animationFrame,
    initialStateMode,
    barrierCount,
    totalFrames,
    segmentDurations,
    probabilities,
    allProbabilities,
    qubitBranches,
    focusQubit,
    allControlSignals,
    visibilityChangeToken,
    selectedGateData,
    onInsertGate,
    onRemoveGate,
    onMoveGate,
    onGateClick,
    onGateMiddleClick,
    onAddQubit,
    onRemoveQubit,
    onToggleVisibility,
    onFocusQubit,
    onAddBarrier,
    onRemoveBarrier,
    onCycleInitialState,
    onUpdateGate,
    onControlSignal,
    onFrameChange,
    onPlayPause,
}) {
    return (
        <div className="app">
            <main className="app-main" ref={containerRef}>
                <div className="left-panel" ref={leftPanelRef} style={{ width: leftPanelWidth }}>
                    <div className="config-section styled-scrollbar" style={{ height: `${configHeightPercent}%` }}>
                        <GatePalette />
                        <CircuitBuilder
                            circuits={circuits}
                            barriers={barriers}
                            qubitVisibility={qubitVisibility}
                            selectedGate={selectedGate}
                            highlightedBarrier={highlightedBarrier}
                            isPlaying={isPlaying}
                            animationFrame={animationFrame < 0 ? -1 : animationFrame}
                            onInsertGate={onInsertGate}
                            onRemoveGate={onRemoveGate}
                            onMoveGate={onMoveGate}
                            onGateClick={onGateClick}
                            onGateMiddleClick={onGateMiddleClick}
                            onAddQubit={onAddQubit}
                            onRemoveQubit={onRemoveQubit}
                            onToggleVisibility={onToggleVisibility}
                            onFocusQubit={onFocusQubit}
                            onAddBarrier={onAddBarrier}
                            onRemoveBarrier={onRemoveBarrier}
                            initialStateMode={initialStateMode}
                            onCycleInitialState={onCycleInitialState}
                        />
                        <GateSettings
                            gate={selectedGateData}
                            gateIndex={selectedGate?.slotIndex}
                            qubitIndex={selectedGate?.qubitIndex}
                            numQubits={circuits.length}
                            onRemove={selectedGate?.isBarrier ? () => onRemoveBarrier(selectedGate.slot) : onRemoveGate}
                            onUpdate={onUpdateGate}
                            onControlSignal={onControlSignal}
                        />
                    </div>

                    <div className={`resize-handle-h ${isDraggingV ? 'active' : ''}`} onMouseDown={onStartDragV} />

                    <div className="prob-section styled-scrollbar" style={{ height: `${100 - configHeightPercent}%` }}>
                        <AnimationPlayer
                            barrierCount={barrierCount}
                            currentFrame={animationFrame < 0 ? totalFrames - 1 : animationFrame}
                            isPlaying={isPlaying}
                            segmentDurations={segmentDurations}
                            onFrameChange={onFrameChange}
                            onPlayPause={onPlayPause}
                        />
                        <ProbabilityBars probabilities={probabilities} allProbabilities={allProbabilities} />
                        <StateDisplay qubitStates={qubitBranches} />
                    </div>
                </div>

                <div className={`resize-handle ${isDraggingH ? 'active' : ''}`} onMouseDown={onStartDragH} />

                <div className="right-panel">
                    <BlochSphereView
                        qubitBranches={qubitBranches}
                        visibility={qubitVisibility}
                        focusQubit={focusQubit}
                        isPlaying={isPlaying}
                        controlSignals={allControlSignals}
                        staticSnapshotToken={visibilityChangeToken}
                        initialStateMode={initialStateMode}
                    />
                </div>
            </main>
        </div>
    );
}
