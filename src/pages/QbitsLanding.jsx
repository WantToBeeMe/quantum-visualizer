import { useEffect, useRef } from 'react';
import './QbitsLanding.css';

function VectorField({ mouseRef }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationId = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const draw = () => {
            const width = canvas.width;
            const height = canvas.height;
            const spacing = 42;
            const cols = Math.ceil(width / spacing) + 1;
            const rows = Math.ceil(height / spacing) + 1;
            const visibleRadius = Math.min(Math.max(width, height) * 0.42, 560);
            const forceRadius = 250;
            const maxPush = 36;

            const mx = mouseRef.current.x;
            const my = mouseRef.current.y;

            ctx.clearRect(0, 0, width, height);

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const baseX = col * spacing + spacing / 2;
                    const baseY = row * spacing + spacing / 2;
                    const toMouseBaseX = mx - baseX;
                    const toMouseBaseY = my - baseY;
                    const baseDist = Math.hypot(toMouseBaseX, toMouseBaseY);
                    if (baseDist > visibleRadius) continue;

                    // Repulsion: push vector origins away from mouse but keep arrow direction toward it.
                    const awayX = baseX - mx;
                    const awayY = baseY - my;
                    const awayDist = Math.max(1, Math.hypot(awayX, awayY));
                    const pushT = Math.max(0, 1 - baseDist / forceRadius);
                    const pushAmount = Math.pow(pushT, 1.8) * maxPush;
                    const x = baseX + (awayX / awayDist) * pushAmount;
                    const y = baseY + (awayY / awayDist) * pushAmount;

                    const dx = mx - x;
                    const dy = my - y;
                    const dist = Math.hypot(dx, dy);
                    const intensity = Math.max(0, 1 - dist / visibleRadius);
                    if (intensity < 0.06) continue;

                    const angle = Math.atan2(dy, dx);
                    const length = 8 + intensity * 14;
                    const alpha = 0.12 + intensity * 0.74;

                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(angle);
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#00A488';
                    ctx.lineWidth = 0.8 + intensity * 1.7;
                    ctx.beginPath();
                    ctx.moveTo(-length / 2, 0);
                    ctx.lineTo(length / 2, 0);
                    ctx.lineTo(length / 2 - 4.4, -3);
                    ctx.moveTo(length / 2, 0);
                    ctx.lineTo(length / 2 - 4.4, 3);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            animationId = requestAnimationFrame(draw);
        };

        resize();
        draw();
        window.addEventListener('resize', resize);

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resize);
        };
    }, [mouseRef]);

    return <canvas ref={canvasRef} className="qbits-landing-vectors" />;
}

export default function QbitsLanding({ onStart }) {
    const mouseRef = useRef({
        x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0,
    });

    useEffect(() => {
        const onMouseMove = event => {
            mouseRef.current = { x: event.clientX, y: event.clientY };
        };
        window.addEventListener('mousemove', onMouseMove);
        return () => window.removeEventListener('mousemove', onMouseMove);
    }, []);

    return (
        <div className="qbits-landing">
            <VectorField mouseRef={mouseRef} />
            <div className="qbits-landing-noise" />
            <section className="qbits-landing-hero">
                <h1 className="qbits-brand">
                    <span className="qbits-brand-q">Q</span>
                    <span className="qbits-brand-bits">bits</span>
                </h1>
                <p className="qbits-landing-subtitle">Quantum circuit visualizer</p>
                <button type="button" className="qbits-start-button" onClick={onStart}>
                    Start
                </button>
            </section>
        </div>
    );
}
