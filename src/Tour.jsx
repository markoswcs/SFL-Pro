import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';

// Tour de boas-vindas: destaca uma parte da tela por vez com um balão curto.
// Cada passo aponta para um elemento com data-tour="…" e pode trocar de aba antes.
export const TOUR_STEPS = [
  { id: 'welcome' },
  { id: 'game', target: 'game' },
  { id: 'next', target: 'next', tab: 'farm' },
  { id: 'timers', target: 'timers', tab: 'farm' },
  { id: 'market', target: 'tab-market', tab: 'farm' },
  { id: 'alerts', target: 'tab-alerts', tab: 'farm' },
  { id: 'done' },
];

const PAD = 8;

function useTargetRect(target, step) {
  const [rect, setRect] = useState(null);
  const measure = useCallback(() => {
    const el = target && document.querySelector(`[data-tour="${target}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [target]);
  useLayoutEffect(() => {
    const el = target && document.querySelector(`[data-tour="${target}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Espera a rolagem terminar antes de medir de novo.
    const timers = [0, 250, 600].map(ms => setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { timers.forEach(clearTimeout); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [target, step, measure]);
  return rect;
}

export default function Tour({ onTab, onClose }) {
  const t = useT();
  const [i, setI] = useState(0);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  useEffect(() => { if (step.tab) onTab(step.tab); }, [step, onTab]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') setI(x => Math.min(x + 1, TOUR_STEPS.length - 1));
      if (e.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rect = useTargetRect(step.target, i);
  // Balão abaixo do destaque, ou acima quando o destaque está na metade de baixo da tela.
  const vh = window.innerHeight;
  const below = rect && rect.top + rect.height / 2 < vh / 2;
  const bubbleStyle = rect
    ? below ? { top: Math.min(rect.top + rect.height + 12, vh - 220) } : { bottom: Math.max(vh - rect.top + 12, 12) }
    : { top: '50%', transform: 'translateY(-50%)' };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour.label')}>
      {rect ? <div className="tour-spot" style={rect} /> : <div className="tour-dim" />}
      <div className="tour-bubble" style={bubbleStyle} key={step.id}>
        <div className="tour-step">{t('tour.stepOf', { n: i + 1, total: TOUR_STEPS.length })}</div>
        <h3>{t(`tour.${step.id}.title`)}</h3>
        <p>{t(`tour.${step.id}.text`)}</p>
        <div className="tour-dots" aria-hidden="true">{TOUR_STEPS.map((s, k) => <i key={s.id} className={k === i ? 'on' : k < i ? 'seen' : ''} />)}</div>
        <div className="row">
          {!last && <button className="link-btn" style={{ color: 'var(--muted)' }} onClick={onClose}>{t('tour.skip')}</button>}
          <span className="grow" />
          {i > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>{t('tour.back')}</button>}
          <button className="btn btn-sun btn-sm" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{last ? t('tour.finish') : i === 0 ? t('tour.go') : t('tour.next')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
