import AudioTrack from '../AudioTrack';
import {
  FakeAudioContext,
  asFakeGain,
  makeAudioBuffer,
  makeAudioContext,
} from '@/__testUtils__/fakeWebAudio';

describe('AudioTrack', () => {
  let context: AudioContext;
  let fake: FakeAudioContext;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    ({ context, fake } = makeAudioContext());
  });

  it('should start playing immediately when no fadeIn is given', () => {
    const track = new AudioTrack('bgm', context);

    track.play(makeAudioBuffer());

    expect(track.state).toBe('playing');
    expect(asFakeGain(track.gain).gain.value).toBe(1);
  });

  it('should enter fading state and ramp gain up when fadeIn is given', () => {
    const track = new AudioTrack('bgm', context);

    track.play(makeAudioBuffer(), { fadeIn: 2000 });
    expect(track.state).toBe('fading');
    expect(asFakeGain(track.gain).gain.value).toBe(0);

    track.update(1);
    expect(asFakeGain(track.gain).gain.value).toBe(0.5);

    track.update(1);
    expect(asFakeGain(track.gain).gain.value).toBe(1);
    expect(track.state).toBe('playing');
  });

  it('should stop immediately when no fadeOut is given', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());
    fake.currentTime = 1;

    track.stop();

    expect(track.state).toBe('stopped');
  });

  it('should fade out before stopping when fadeOut is given', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer(), { fadeIn: 1000 });
    track.update(1);

    track.stop({ fadeOut: 1000 });
    expect(track.state).toBe('fading');

    track.update(1);
    expect(track.state).toBe('stopped');
    expect(asFakeGain(track.gain).gain.value).toBe(0);
  });

  it('should ignore stop when the track is already stopped', () => {
    const track = new AudioTrack('bgm', context);

    expect(() => track.stop()).not.toThrow();
    expect(track.state).toBe('stopped');
  });

  it('should pause and resume from the stored offset', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());
    fake.currentTime = 3;

    track.pause();
    expect(track.state).toBe('paused');
    expect(track.currentProgress).toBe(3);

    track.resume();
    expect(track.state).toBe('playing');
  });

  it('should warn and stay put when resuming a non-paused track', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = new AudioTrack('bgm', context);

    expect(() => track.resume()).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('should apply volume immediately while playing', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());

    track.setVolume(0.3);

    expect(asFakeGain(track.gain).gain.value).toBe(0.3);
  });

  it('should accept the lower volume bound of zero', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());

    track.setVolume(0);

    expect(asFakeGain(track.gain).gain.value).toBe(0);
  });

  it('should update the fade-in target when volume changes', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer(), { fadeIn: 2000 });

    track.setVolume(0.5);
    track.update(2);

    expect(asFakeGain(track.gain).gain.value).toBe(0.5);
  });

  it('should invoke onFadeComplete when a fade-in finishes', () => {
    const onFadeComplete = vi.fn();
    const track = new AudioTrack('bgm', context, onFadeComplete);
    track.play(makeAudioBuffer(), { fadeIn: 1000 });

    track.update(1);

    expect(onFadeComplete).toHaveBeenCalledOnce();
  });

  it('should invoke onFadeComplete when a fade-out finishes', () => {
    const onFadeComplete = vi.fn();
    const track = new AudioTrack('bgm', context, onFadeComplete);
    track.play(makeAudioBuffer());

    track.stop({ fadeOut: 1000 });
    track.update(1);

    expect(onFadeComplete).toHaveBeenCalledOnce();
  });

  it('should not invoke onFadeComplete on an immediate stop', () => {
    const onFadeComplete = vi.fn();
    const track = new AudioTrack('bgm', context, onFadeComplete);
    track.play(makeAudioBuffer());

    track.stop();

    expect(onFadeComplete).not.toHaveBeenCalled();
  });

  it('should not connect its gain to the destination on construction', () => {
    const track = new AudioTrack('bgm', context);

    expect(asFakeGain(track.gain).connections).toHaveLength(0);
  });

  it('should report live progress while playing', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());

    fake.currentTime = 4;

    expect(track.currentProgress).toBe(4);
  });

  it('should rebuild the source when seeking while playing', () => {
    const track = new AudioTrack('bgm', context);
    track.play(makeAudioBuffer());
    const sourcesBefore = fake.sources.length;

    track.currentProgress = 5;

    expect(fake.sources.length).toBe(sourcesBefore + 1);
    expect(fake.sources.at(-1)?.starts.at(0)?.offset).toBe(5);
  });

  it('should ignore a seek when no buffer is loaded', () => {
    const track = new AudioTrack('bgm', context);

    expect(() => {
      track.currentProgress = 5;
    }).not.toThrow();
    expect(track.currentProgress).toBe(0);
  });
});
