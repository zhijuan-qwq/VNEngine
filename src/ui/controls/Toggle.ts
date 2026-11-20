import { Graphics, Rectangle } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { resolveTheme } from '../theme';
import type { DeepPartial, UITheme } from '../theme';

export interface ToggleOptions {
  width: number;
  height?: number;
  value?: boolean;
  disabled?: boolean;
  onColor?: number;
  offColor?: number;
  knobColor?: number;
  theme?: DeepPartial<UITheme>;
  onChange?: (value: boolean) => void;
}

interface ResolvedOptions {
  width: number;
  height: number;
  disabled: boolean;
  onColor: number;
  offColor: number;
  knobColor: number;
  onChange?: (value: boolean) => void;
}

export class Toggle extends UIComponent {
  private readonly opts: ResolvedOptions;
  private readonly track: Graphics;
  private readonly knob: Graphics;
  private currentValue: boolean;

  constructor(options: ToggleOptions) {
    super({ id: 'toggle' });
    const theme = resolveTheme(options.theme);
    this.opts = {
      width: options.width,
      height: options.height ?? theme.sizes.toggleHeight,
      disabled: options.disabled ?? false,
      onColor: options.onColor ?? theme.colors.success,
      offColor: options.offColor ?? theme.colors.neutral600,
      knobColor: options.knobColor ?? theme.colors.textPrimary,
      onChange: options.onChange,
    };
    this.currentValue = options.value ?? false;

    this.track = new Graphics();
    this.addChild(this.track);

    this.knob = new Graphics();
    this.addChild(this.knob);

    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, this.opts.width, this.opts.height);
    this.on('pointertap', (event) => {
      event.stopPropagation();
      this.toggle();
    });

    this.redraw();
  }

  public get value(): boolean {
    return this.currentValue;
  }

  public get disabled(): boolean {
    return this.opts.disabled;
  }

  /** 程序化设置（不受 disabled 限制，供受控方回填） */
  public setValue(value: boolean): void {
    if (value === this.currentValue) {
      return;
    }
    this.currentValue = value;
    this.redraw();
    this.opts.onChange?.(value);
  }

  /** 用户点击切换；disabled 时 no-op */
  public toggle(): void {
    if (this.opts.disabled) {
      return;
    }
    this.setValue(!this.currentValue);
  }

  private redraw(): void {
    const { width, height, onColor, offColor, knobColor } = this.opts;
    this.track.clear();
    this.track.roundRect(0, 0, width, height, height / 2);
    this.track.fill(this.currentValue ? onColor : offColor, 1);

    const radius = height / 2 - 2;
    const cx = this.currentValue ? width - height / 2 : height / 2;
    this.knob.clear();
    this.knob.circle(cx, height / 2, radius);
    this.knob.fill(knobColor, 1);
  }
}

export default Toggle;
