'use client';

import { ArrowDown, ArrowDownToLine, ArrowUp, Axis3d, Boxes, Globe, Hand, Move3d, PackageMinus, Rotate3d, Settings2, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

/**
 * Free mode, top of the 3D view (the far background, never the ground near the camera where pieces
 * are put): the commands for the piece in hand or for the selection, one row, shown only while there
 * is one. The readouts live in the HUD just below, so a changing text never moves a button. Actions
 * are named in words; in a narrow scene the words fold into icons (still named for assistive
 * technologies, the tooltip gives the shortcut). Arrows and toggles are icons everywhere.
 */
type Axis = 'x' | 'y' | 'z';

function Tool({ testId, icon, label, tip, onClick, pressed, disabled, tipAlign, iconOnly = false }: {
  testId: string;
  icon: ReactNode;
  label: string;
  /** The icon says it all (arrows, manipulator modes): the word is for assistive technologies only. */
  iconOnly?: boolean;
  tip: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  tipAlign?: 'end';
}) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} data-tip={tip} data-tip-side="bottom" {...(tipAlign ? { 'data-tip-align': tipAlign } : {})}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })} {...(disabled ? { disabled } : {})}>
      <span className={iconOnly ? 'ico' : 'ico narrow-only'}>{icon}</span><span className={iconOnly ? 'visually-hidden' : 'lbl'}>{label}</span>
    </button>
  );
}

function Rotations({ onRotate }: { onRotate: (axis: Axis, dir: 1 | -1) => void }) {
  return (
    <span className="rotations" role="group" aria-label="Rotations d’un quart de tour">
      <span className="rot-unit" aria-hidden>90°</span>
      {(['x', 'y', 'z'] as const).map((axis) => {
        const A = axis.toUpperCase();
        return (
          <span key={axis} className={`axis axis-${axis}`}>
            <b aria-hidden>{A}</b>
            <button type="button" data-testid={`rot-${axis}-minus`} aria-label={`−90° autour de ${A}`} data-tip-side="bottom" data-tip={`−90° autour de ${A} (Maj+${A})`} onClick={() => onRotate(axis, -1)}>−</button>
            <button type="button" data-testid={`rot-${axis}-plus`} aria-label={`+90° autour de ${A}`} data-tip-side="bottom" data-tip={`+90° autour de ${A} (${A})`} onClick={() => onRotate(axis, 1)}>+</button>
          </span>
        );
      })}
    </span>
  );
}

const Sep = () => <span className="sep" aria-hidden />;

/** Piece (or group) in hand: height, quarter turns, back to the stock, let go. */
export function HeldBar({ moving, autoHeight, heightStep, steps, onLift, onStep, onAuto, onRotate, onRemove, onCancel }: {
  /** A placed piece or a group taken back (it can go back to the stock, Escape leaves it in place). */
  moving: boolean;
  autoHeight: boolean;
  heightStep: number;
  steps: readonly [plate: number, fine: number];
  onLift: (dir: 1 | -1) => void;
  onStep: (ldu: number) => void;
  onAuto: () => void;
  onRotate: (axis: Axis, dir: 1 | -1) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="manip-bar" data-testid="manip-bar" role="group" aria-label="Pièce en main">
      <span className="tool-group" role="group" aria-label="Hauteur">
        <Tool iconOnly testId="lift-up" icon={<ArrowUp size={16} aria-hidden />} label="Monter" tip="Monter d’un pas (Page ↑ ; Maj : 1 LDU)" onClick={() => onLift(1)} />
        <Tool iconOnly testId="lift-down" icon={<ArrowDown size={16} aria-hidden />} label="Descendre" tip="Descendre d’un pas (Page ↓ ; Maj : 1 LDU)" onClick={() => onLift(-1)} />
        <span className="segmented" role="group" aria-label="Pas de hauteur">
          <button type="button" data-testid="step-8" aria-pressed={heightStep === steps[0]} onClick={() => onStep(steps[0])}>{steps[0]} LDU</button>
          <button type="button" data-testid="step-1" aria-pressed={heightStep === steps[1]} onClick={() => onStep(steps[1])}>{steps[1]} LDU</button>
        </span>
        <Tool testId="height-auto" icon={<ArrowDownToLine size={16} aria-hidden />} label="Auto" tip="Hauteur auto : revenir à la surface visée (A)" onClick={onAuto} disabled={autoHeight} />
      </span>
      <Sep />
      <Rotations onRotate={onRotate} />
      <Sep />
      {moving && <Tool testId="remove-piece" icon={<PackageMinus size={16} aria-hidden />} label="Au stock" tip="Remettre dans le stock (Suppr)" onClick={onRemove} tipAlign="end" />}
      <Tool testId="cancel-held" icon={<X size={16} aria-hidden />} label={moving ? 'Laisser en place' : 'Lâcher'} tip={moving ? 'Laisser en place (Échap)' : 'Lâcher la pièce (Échap)'} onClick={onCancel} tipAlign="end" />
    </div>
  );
}

/** Selection: the manipulator (arrows or rings, axes), quarter turns, actions; the fine settings in a second row. */
export function SelectionBar({ gizmoMode, gizmoSpace, onGizmoMode, onGizmoSpace, onRotate, onMove, onAssembly, onRemove, onClear, settingsOpen, onSettings, settings }: {
  gizmoMode: 'translate' | 'rotate';
  gizmoSpace: 'world' | 'local';
  onGizmoMode: (m: 'translate' | 'rotate') => void;
  onGizmoSpace: (s: 'world' | 'local') => void;
  onRotate: (axis: Axis, dir: 1 | -1) => void;
  onMove: () => void;
  onAssembly: () => void;
  onRemove: () => void;
  onClear: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  /** Content of the settings row (steps, angle, coordinates). */
  settings: ReactNode;
}) {
  const settingsId = useId();
  return (
    <>
    <div className="manip-bar" data-testid="manip-bar" role="group" aria-label="Sélection">
      <span className="segmented" role="group" aria-label="Manipulateur">
        <Tool iconOnly testId="gizmo-translate" icon={<Move3d size={16} aria-hidden />} label="Flèches" tip="Flèches : déplacer le long d’un axe (W)" pressed={gizmoMode === 'translate'} onClick={() => onGizmoMode('translate')} />
        <Tool iconOnly testId="gizmo-rotate" icon={<Rotate3d size={16} aria-hidden />} label="Anneaux" tip="Anneaux : tourner autour d’un axe (E)" pressed={gizmoMode === 'rotate'} onClick={() => onGizmoMode('rotate')} />
      </span>
      <span className="segmented" role="group" aria-label="Axes">
        <Tool iconOnly testId="gizmo-world" icon={<Globe size={16} aria-hidden />} label="Globaux" tip="Axes de la scène (Q)" pressed={gizmoSpace === 'world'} onClick={() => onGizmoSpace('world')} />
        <Tool iconOnly testId="gizmo-local" icon={<Axis3d size={16} aria-hidden />} label="Locaux" tip="Axes de la pièce tournée (Q)" pressed={gizmoSpace === 'local'} onClick={() => onGizmoSpace('local')} />
      </span>
      <Sep />
      <Rotations onRotate={onRotate} />
      <Sep />
      <Tool testId="move-selection" icon={<Hand size={16} aria-hidden />} label="Déplacer" tip="Prendre la sélection en main (M)" onClick={onMove} />
      <Tool testId="select-assembly" icon={<Boxes size={16} aria-hidden />} label="Assemblage" tip="Toutes les pièces emboîtées, même cachées (double-clic)" onClick={onAssembly} />
      <Tool testId="remove-selection" icon={<PackageMinus size={16} aria-hidden />} label="Au stock" tip="Remettre dans le stock (Suppr)" onClick={onRemove} tipAlign="end" />
      <button type="button" data-testid="manip-settings" aria-expanded={settingsOpen} aria-controls={settingsId} data-tip="Pas, angle et coordonnées" data-tip-side="bottom" data-tip-align="end" onClick={onSettings}>
        <span className="ico"><Settings2 size={16} aria-hidden /></span><span className="visually-hidden">Réglages</span>
      </button>
      <Tool iconOnly testId="clear-selection" icon={<X size={16} aria-hidden />} label="Désélectionner" tip="Désélectionner (Échap)" onClick={onClear} tipAlign="end" />
    </div>
    {settingsOpen && <div className="manip-settings" id={settingsId} role="group" aria-label="Réglages de manipulation">{settings}</div>}
    </>
  );
}
