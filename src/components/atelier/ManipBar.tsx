'use client';

import { ArrowDown, ArrowDownToLine, ArrowUp, Axis3d, Boxes, Globe, Hand, Move3d, PackageMinus, Rotate3d, Settings2, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useT } from '@/i18n/I18nProvider';

/**
 * Top of the 3D view (free mode; guided modes only get the piece-in-hand bar) (the far background, never the ground near the camera where pieces
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

/** Rotation steps offered (degrees), from the quarter turn down to one degree. */
const ROTATION_STEPS = [90, 45, 15, 5, 1] as const;

interface RotationProps {
  onRotate: (axis: Axis, dir: 1 | -1) => void;
  /** Degrees per click / key press, shared with the rings of the manipulator. */
  rotationStep: number;
  /** Absent: the step is fixed (guided modes: quarter turns only), no step picker. */
  onRotationStep?: (deg: number) => void;
}

function Rotations({ onRotate, rotationStep, onRotationStep }: RotationProps) {
  const t = useT();
  const m = t.workshop.manip;
  const d = rotationStep;
  return (
    <span className="rotations" role="group" aria-label={m.rotationsOf(d)}>
      {onRotationStep && (
        <span className="segmented rot-steps" role="group" aria-label={m.rotationStep}>
          {ROTATION_STEPS.map((deg) => (
            <button key={deg} type="button" data-testid={`rot-step-${deg}`} aria-pressed={d === deg} aria-label={m.stepOf(deg)}
              data-tip-side="bottom" data-tip={deg === 90 ? m.quarterTurnTip : m.stepTip(deg)}
              onClick={() => onRotationStep(deg)}>{deg}°</button>
          ))}
        </span>
      )}
      {(['x', 'y', 'z'] as const).map((axis) => {
        const A = axis.toUpperCase();
        return (
          <span key={axis} className={`axis axis-${axis}`}>
            <b aria-hidden>{A}</b>
            <button type="button" data-testid={`rot-${axis}-minus`} aria-label={m.rotateMinus(d, A)} data-tip-side="bottom" data-tip={m.rotateMinusTip(d, A)} onClick={() => onRotate(axis, -1)}>−</button>
            <button type="button" data-testid={`rot-${axis}-plus`} aria-label={m.rotatePlus(d, A)} data-tip-side="bottom" data-tip={m.rotatePlusTip(d, A)} onClick={() => onRotate(axis, 1)}>+</button>
          </span>
        );
      })}
    </span>
  );
}

const Sep = () => <span className="sep" aria-hidden />;

/** Piece (or group) in hand: height, rotations, back to the stock, let go. */
export function HeldBar({ moving, autoHeight, heightStep, steps, onLift, onStep, onAuto, onRotate, rotationStep, onRotationStep, onRemove, onCancel }: RotationProps & {
  /** A placed piece or a group taken back (it can go back to the stock, Escape leaves it in place). */
  moving: boolean;
  autoHeight: boolean;
  heightStep: number;
  steps: readonly [plate: number, fine: number];
  onLift: (dir: 1 | -1) => void;
  onStep: (ldu: number) => void;
  onAuto: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const m = useT().workshop.manip;
  return (
    <div className="manip-bar" data-testid="manip-bar" role="group" aria-label={m.held}>
      <span className="tool-group" role="group" aria-label={m.height}>
        <Tool iconOnly testId="lift-up" icon={<ArrowUp size={16} aria-hidden />} label={m.liftUp} tip={m.liftUpTip} onClick={() => onLift(1)} />
        <Tool iconOnly testId="lift-down" icon={<ArrowDown size={16} aria-hidden />} label={m.liftDown} tip={m.liftDownTip} onClick={() => onLift(-1)} />
        <span className="segmented" role="group" aria-label={m.heightStep}>
          <button type="button" data-testid="step-8" aria-pressed={heightStep === steps[0]} onClick={() => onStep(steps[0])}>{steps[0]} LDU</button>
          <button type="button" data-testid="step-1" aria-pressed={heightStep === steps[1]} onClick={() => onStep(steps[1])}>{steps[1]} LDU</button>
        </span>
        <Tool testId="height-auto" icon={<ArrowDownToLine size={16} aria-hidden />} label={m.auto} tip={m.autoTip} onClick={onAuto} disabled={autoHeight} />
      </span>
      <Sep />
      <Rotations onRotate={onRotate} rotationStep={rotationStep} onRotationStep={onRotationStep} />
      <Sep />
      {moving && <Tool testId="remove-piece" icon={<PackageMinus size={16} aria-hidden />} label={m.toStock} tip={m.toStockTip} onClick={onRemove} tipAlign="end" />}
      <Tool testId="cancel-held" icon={<X size={16} aria-hidden />} label={moving ? m.leaveInPlace : m.letGo} tip={moving ? m.leaveInPlaceTip : m.letGoTip} onClick={onCancel} tipAlign="end" />
    </div>
  );
}

/**
 * Guided modes (LDraw steps, synchronised booklet), piece in hand: quarter turns around the three
 * axes (the targets are the model's poses, so finer steps would never fit one), let go.
 */
export function GuidedHeldBar({ onRotate, onCancel }: { onRotate: RotationProps['onRotate']; onCancel: () => void }) {
  const m = useT().workshop.manip;
  return (
    <div className="manip-bar" data-testid="manip-bar" role="group" aria-label={m.held}>
      <Rotations onRotate={onRotate} rotationStep={90} />
      <Sep />
      <Tool testId="cancel-held" icon={<X size={16} aria-hidden />} label={m.letGo} tip={m.letGoTip} onClick={onCancel} tipAlign="end" />
    </div>
  );
}

/** Selection: the manipulator (arrows or rings, axes), rotations, actions; the fine settings in a second row. */
export function SelectionBar({ gizmoMode, gizmoSpace, onGizmoMode, onGizmoSpace, onRotate, rotationStep, onRotationStep, onMove, onAssembly, onRemove, onClear, settingsOpen, onSettings, settings }: RotationProps & {
  gizmoMode: 'translate' | 'rotate';
  gizmoSpace: 'world' | 'local';
  onGizmoMode: (m: 'translate' | 'rotate') => void;
  onGizmoSpace: (s: 'world' | 'local') => void;
  onMove: () => void;
  onAssembly: () => void;
  onRemove: () => void;
  onClear: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  /** Content of the settings row (steps, angle, coordinates). */
  settings: ReactNode;
}) {
  const m = useT().workshop.manip;
  const settingsId = useId();
  return (
    <>
    <div className="manip-bar" data-testid="manip-bar" role="group" aria-label={m.selection}>
      <span className="segmented" role="group" aria-label={m.manipulator}>
        <Tool iconOnly testId="gizmo-translate" icon={<Move3d size={16} aria-hidden />} label={m.arrows} tip={m.arrowsTip} pressed={gizmoMode === 'translate'} onClick={() => onGizmoMode('translate')} />
        <Tool iconOnly testId="gizmo-rotate" icon={<Rotate3d size={16} aria-hidden />} label={m.rings} tip={m.ringsTip} pressed={gizmoMode === 'rotate'} onClick={() => onGizmoMode('rotate')} />
      </span>
      <span className="segmented" role="group" aria-label={m.axes}>
        <Tool iconOnly testId="gizmo-world" icon={<Globe size={16} aria-hidden />} label={m.world} tip={m.worldTip} pressed={gizmoSpace === 'world'} onClick={() => onGizmoSpace('world')} />
        <Tool iconOnly testId="gizmo-local" icon={<Axis3d size={16} aria-hidden />} label={m.local} tip={m.localTip} pressed={gizmoSpace === 'local'} onClick={() => onGizmoSpace('local')} />
      </span>
      <Sep />
      <Rotations onRotate={onRotate} rotationStep={rotationStep} onRotationStep={onRotationStep} />
      <Sep />
      <Tool testId="move-selection" icon={<Hand size={16} aria-hidden />} label={m.move} tip={m.moveTip} onClick={onMove} />
      <Tool testId="select-assembly" icon={<Boxes size={16} aria-hidden />} label={m.assembly} tip={m.assemblyTip} onClick={onAssembly} />
      <Tool testId="remove-selection" icon={<PackageMinus size={16} aria-hidden />} label={m.toStock} tip={m.toStockTip} onClick={onRemove} tipAlign="end" />
      <button type="button" data-testid="manip-settings" aria-expanded={settingsOpen} aria-controls={settingsId} data-tip={m.settingsTip} data-tip-side="bottom" data-tip-align="end" onClick={onSettings}>
        <span className="ico"><Settings2 size={16} aria-hidden /></span><span className="visually-hidden">{m.settings}</span>
      </button>
      <Tool iconOnly testId="clear-selection" icon={<X size={16} aria-hidden />} label={m.clear} tip={m.clearTip} onClick={onClear} tipAlign="end" />
    </div>
    {settingsOpen && <div className="manip-settings" id={settingsId} role="group" aria-label={m.settingsRow}>{settings}</div>}
    </>
  );
}
