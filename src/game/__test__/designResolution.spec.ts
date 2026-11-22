import { selectDesignResolution } from '../designResolution';

describe('selectDesignResolution', () => {
  it('should pick the small design for a touch phone in portrait', () => {
    expect(selectDesignResolution({ width: 390, height: 844 }, true)).toEqual({
      width: 640,
      height: 360,
    });
  });

  it('should pick the small design for a touch phone in landscape', () => {
    expect(selectDesignResolution({ width: 844, height: 390 }, true)).toEqual({
      width: 640,
      height: 360,
    });
  });

  it('should keep the desktop design for a fine pointer', () => {
    expect(selectDesignResolution({ width: 390, height: 844 }, false)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('should keep the desktop design on a large touch viewport', () => {
    expect(selectDesignResolution({ width: 1920, height: 1080 }, true)).toEqual(
      {
        width: 1280,
        height: 720,
      },
    );
  });

  it('should keep the desktop design when the viewport is unknown', () => {
    expect(selectDesignResolution({ width: 0, height: 0 }, true)).toEqual({
      width: 1280,
      height: 720,
    });
  });
});
